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

type CreateResponse = {
  id?: string;
  success?: boolean;
  errors?: unknown;
};

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.value;

  let lastName: string;
  try {
    lastName = requireString(body, "lastName");
  } catch (err) {
    return agentError(
      err instanceof Error ? err.message : "Invalid request",
      400,
    );
  }

  const { payload, rejectedKeys } = buildProspectSfPayload(body);
  // lastName was already validated; buildProspectSfPayload already mapped it.
  // Drop unknown keys silently — they are non-fatal — but log for visibility.
  if (rejectedKeys.length > 0) {
    console.warn("create-prospect: ignoring unknown fields:", rejectedKeys);
  }

  // Defensive: ensure Last_Name__c is in the payload (it must be, given
  // requireString passed and buildProspectSfPayload maps lastName).
  if (!payload.Last_Name__c) {
    payload.Last_Name__c = lastName;
  }

  try {
    const token = await getSalesforceToken();

    const created = await sfFetch<CreateResponse>(
      `/services/data/${SF_API_VERSION}/sobjects/Prospect__c/`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      token,
    );

    if (!created?.id) {
      throw new Error("Salesforce did not return an Id for the new Prospect.");
    }

    // Fetch the auto-number Name to return as prospectNumber.
    let prospectNumber: string | null = null;
    try {
      const fetched = await sfFetch<{ Name?: string }>(
        `/services/data/${SF_API_VERSION}/sobjects/Prospect__c/${encodeURIComponent(
          created.id,
        )}?fields=Name`,
        { method: "GET" },
        token,
      );
      prospectNumber = fetched?.Name ?? null;
    } catch (lookupErr) {
      // Don't fail the whole call if the post-create lookup blips.
      console.error(
        "create-prospect: Name lookup after create failed:",
        lookupErr,
      );
    }

    return agentJson({
      success: true,
      id: created.id,
      prospectNumber,
    });
  } catch (err) {
    const sfBody = (err as any)?.sfBody;
    const message =
      err instanceof Error ? err.message : "Failed to create prospect.";
    console.error("create-prospect error:", {
      message,
      salesforceBody: sfBody,
      attemptedFields: Object.keys(payload),
    });
    return agentError(message, 500);
  }
}
