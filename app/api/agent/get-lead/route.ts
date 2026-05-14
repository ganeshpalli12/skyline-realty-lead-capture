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

type LeadRecord = {
  FirstName?: string | null;
  LastName?: string | null;
  Phone?: string | null;
  Email?: string | null;
  Project_Interest__c?: string | null;
  Budget_Range__c?: string | null;
  Configuration__c?: string | null;
  Qualification_Status__c?: string | null;
};

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  let leadId: string;
  try {
    leadId = requireString(parsed.value, "leadId");
  } catch (err) {
    return agentError(
      err instanceof Error ? err.message : "Invalid request",
      400,
    );
  }

  try {
    const token = await getSalesforceToken();

    const fields = [
      "FirstName",
      "LastName",
      "Phone",
      "Email",
      "Project_Interest__c",
      "Budget_Range__c",
      "Configuration__c",
      "Qualification_Status__c",
    ].join(",");

    const record = await sfFetch<LeadRecord>(
      `/services/data/${SF_API_VERSION}/sobjects/Lead/${encodeURIComponent(
        leadId,
      )}?fields=${fields}`,
      { method: "GET" },
      token,
    );

    const name = [record?.FirstName, record?.LastName]
      .filter((p) => typeof p === "string" && p.trim().length > 0)
      .join(" ")
      .trim();

    return agentJson({
      success: true,
      lead: {
        name,
        phone: record?.Phone ?? null,
        email: record?.Email ?? null,
        projectInterest: record?.Project_Interest__c ?? null,
        budgetRange: record?.Budget_Range__c ?? null,
        configuration: record?.Configuration__c ?? null,
        qualificationStatus: record?.Qualification_Status__c ?? null,
      },
    });
  } catch (err) {
    const status = (err as any)?.status === 404 ? 404 : 500;
    const message =
      err instanceof Error ? err.message : "Failed to fetch lead.";
    console.error("get-lead error:", err);
    return agentError(message, status);
  }
}
