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

type ProspectRecord = {
  Id?: string;
  Name?: string;
  First_Name__c?: string | null;
  Last_Name__c?: string | null;
  Full_Name__c?: string | null;
  Company__c?: string | null;
  Designation__c?: string | null;
  Status__c?: string | null;
  BANT_Budget__c?: string | null;
  BANT_Authority__c?: string | null;
  BANT_Timeline__c?: string | null;
  BANT_Need__c?: string | null;
  Email__c?: string | null;
  Mobile__c?: string | null;
};

type SoslResponse = {
  searchRecords?: ProspectRecord[];
};

// SOSL reserved characters that must be backslash-escaped in user input.
function escapeSoslTerm(term: string): string {
  return term
    .replace(/\\/g, "\\\\")
    .replace(/([?&|!{}()\[\]^~*:"'+\-])/g, "\\$1");
}

function buildName(r: ProspectRecord): string | null {
  if (r.Full_Name__c && r.Full_Name__c.trim()) return r.Full_Name__c.trim();
  const composed = [r.First_Name__c, r.Last_Name__c]
    .filter((p) => typeof p === "string" && p.trim().length > 0)
    .join(" ")
    .trim();
  return composed.length > 0 ? composed : null;
}

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  let searchTerm: string;
  try {
    searchTerm = requireString(parsed.value, "searchTerm");
  } catch (err) {
    return agentError(
      err instanceof Error ? err.message : "Invalid request",
      400,
    );
  }

  const escaped = escapeSoslTerm(searchTerm);
  const sosl =
    `FIND {${escaped}*} IN ALL FIELDS RETURNING Prospect__c` +
    `(Id, Name, First_Name__c, Last_Name__c, Full_Name__c, Company__c, ` +
    `Designation__c, Status__c, BANT_Budget__c, BANT_Authority__c, ` +
    `BANT_Timeline__c, BANT_Need__c, Email__c, Mobile__c LIMIT 5)`;

  try {
    const token = await getSalesforceToken();

    const result = await sfFetch<SoslResponse>(
      `/services/data/${SF_API_VERSION}/search?q=${encodeURIComponent(sosl)}`,
      { method: "GET" },
      token,
    );

    const records = Array.isArray(result?.searchRecords)
      ? result!.searchRecords!
      : [];

    const prospects = records.map((r) => ({
      id: r.Id ?? null,
      prospectNumber: r.Name ?? null,
      name: buildName(r),
      company: r.Company__c ?? null,
      designation: r.Designation__c ?? null,
      status: r.Status__c ?? null,
      budget: r.BANT_Budget__c ?? null,
      authority: r.BANT_Authority__c ?? null,
      timeline: r.BANT_Timeline__c ?? null,
      need: r.BANT_Need__c ?? null,
      email: r.Email__c ?? null,
      mobile: r.Mobile__c ?? null,
    }));

    return agentJson({
      success: true,
      prospects,
      count: prospects.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to search prospects.";
    console.error("find-prospect error:", err);
    return agentError(message, 500);
  }
}
