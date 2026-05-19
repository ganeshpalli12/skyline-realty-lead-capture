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
import { buildProspectSfPayload } from "@/lib/prospect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.value;

  let prospectId: string;
  try {
    prospectId = requireString(body, "prospectId");
  } catch (err) {
    return agentError(
      err instanceof Error ? err.message : "Invalid request",
      400,
    );
  }

  // Accept both nested and flat shapes.
  //   { prospectId, updates: { ... } }
  //   { prospectId, status, bantBudget, ... }
  const { prospectId: _id, updates: nestedUpdates, ...rest } = body as
    & { prospectId: unknown; updates?: unknown }
    & Record<string, unknown>;

  let updatesInput: Record<string, unknown>;
  if (
    nestedUpdates &&
    typeof nestedUpdates === "object" &&
    !Array.isArray(nestedUpdates)
  ) {
    updatesInput = nestedUpdates as Record<string, unknown>;
  } else {
    updatesInput = rest;
  }

  const { payload, rejectedKeys } = buildProspectSfPayload(updatesInput);

  if (rejectedKeys.length > 0) {
    console.warn("update-prospect: ignoring unknown fields:", rejectedKeys);
  }

  if (Object.keys(payload).length === 0) {
    return agentError(
      "No valid fields to update. Provide at least one mappable field.",
      400,
    );
  }

  try {
    const token = await getSalesforceToken();

    await sfFetch(
      `/services/data/${SF_API_VERSION}/sobjects/Prospect__c/${encodeURIComponent(
        prospectId,
      )}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
      token,
    );

    return agentJson({ success: true, message: "Prospect updated" });
  } catch (err) {
    const sfBody = (err as any)?.sfBody;
    const message =
      err instanceof Error ? err.message : "Failed to update prospect.";
    console.error("update-prospect error:", {
      prospectId,
      attemptedFields: Object.keys(payload),
      payload,
      salesforceBody: sfBody,
      message,
    });
    return agentError(message, 500);
  }
}
