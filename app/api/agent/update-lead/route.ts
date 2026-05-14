import {
  agentError,
  agentJson,
  corsPreflight,
  readJson,
  requireString,
} from "@/lib/agent-route";
import {
  getSalesforceToken,
  sfFetch,
  SF_API_VERSION,
} from "@/lib/salesforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELD_MAP: Record<string, string> = {
  budgetRange: "Budget_Range__c",
  configuration: "Configuration__c",
  qualificationStatus: "Qualification_Status__c",
  intentScore: "Intent_Score__c",
};

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.value;

  let leadId: string;
  try {
    leadId = requireString(body, "leadId");
  } catch (err) {
    return agentError(
      err instanceof Error ? err.message : "Invalid request",
      400,
    );
  }

  // Accept both shapes:
  //   { leadId, updates: { ... } }            (nested)
  //   { leadId, qualificationStatus, ... }    (flat — what ElevenLabs sends)
  const { leadId: _ignored, updates: nestedUpdates, ...rest } = body as
    & { leadId: unknown; updates?: unknown }
    & Record<string, unknown>;

  let updatesObj: Record<string, unknown>;
  if (
    nestedUpdates &&
    typeof nestedUpdates === "object" &&
    !Array.isArray(nestedUpdates)
  ) {
    updatesObj = nestedUpdates as Record<string, unknown>;
  } else {
    updatesObj = rest;
  }

  const sfUpdate: Record<string, unknown> = {};

  for (const [inputKey, sfFieldName] of Object.entries(FIELD_MAP)) {
    if (!(inputKey in updatesObj)) continue;
    const value = updatesObj[inputKey];
    if (value === null || value === undefined) continue;

    if (inputKey === "intentScore") {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) {
        return agentError("'intentScore' must be a number.", 400);
      }
      sfUpdate[sfFieldName] = n;
    } else {
      if (typeof value !== "string" || value.trim().length === 0) {
        return agentError(`'${inputKey}' must be a non-empty string.`, 400);
      }
      sfUpdate[sfFieldName] = value.trim();
    }
  }

  // Always stamp last conversation time.
  sfUpdate.Last_Conversation_At__c = new Date().toISOString();

  if (Object.keys(sfUpdate).length === 1) {
    // Only the timestamp would be written — no caller-provided updates.
    return agentError(
      "No valid fields to update. Provide at least one of: budgetRange, configuration, qualificationStatus, intentScore.",
      400,
    );
  }

  try {
    const token = await getSalesforceToken();

    await sfFetch(
      `/services/data/${SF_API_VERSION}/sobjects/Lead/${encodeURIComponent(
        leadId,
      )}`,
      {
        method: "PATCH",
        body: JSON.stringify(sfUpdate),
      },
      token,
    );

    return agentJson({ success: true, message: "Lead updated" });
  } catch (err) {
    const sfBody = (err as any)?.sfBody;
    const sfStatus = (err as any)?.status;
    const message =
      err instanceof Error ? err.message : "Failed to update lead.";

    console.error("update-lead error:", {
      leadId,
      attemptedFields: Object.keys(sfUpdate),
      payload: sfUpdate,
      salesforceStatus: sfStatus,
      salesforceBody: sfBody,
      message,
    });

    return agentError(message, 500);
  }
}
