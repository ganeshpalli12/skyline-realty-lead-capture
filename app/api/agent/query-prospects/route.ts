import {
  agentError,
  agentJson,
  corsPreflight,
  readJson,
} from "@/lib/agent-route";
import {
  getSalesforceToken,
  sfFetch,
  SF_API_VERSION,
} from "@/lib/salesforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProspectRow = {
  Id?: string;
  Name?: string;
  Full_Name__c?: string | null;
  Company__c?: string | null;
  Status__c?: string | null;
  Prospect_Score__c?: number | null;
  BANT_Budget__c?: string | null;
  Next_Outreach_Date__c?: string | null;
  Total_Activities__c?: number | null;
  Total_Responses__c?: number | null;
};

type SoqlResponse = {
  records?: ProspectRow[];
  totalSize?: number;
};

function escapeSoqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function asStringArray(value: unknown): string[] | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    const cleaned = value
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
    return cleaned.length > 0 ? cleaned : null;
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function inClause(field: string, values: string[]): string {
  if (values.length === 1) {
    return `${field} = '${escapeSoqlLiteral(values[0])}'`;
  }
  const quoted = values.map((v) => `'${escapeSoqlLiteral(v)}'`).join(", ");
  return `${field} IN (${quoted})`;
}

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.value;

  const where: string[] = [];

  const statusValues = asStringArray(body.status);
  if (statusValues) where.push(inClause("Status__c", statusValues));

  const budget = asNonEmptyString(body.bantBudget);
  if (budget) {
    where.push(`BANT_Budget__c = '${escapeSoqlLiteral(budget)}'`);
  }

  const authority = asNonEmptyString(body.bantAuthority);
  if (authority) {
    where.push(`BANT_Authority__c = '${escapeSoqlLiteral(authority)}'`);
  }

  const source = asNonEmptyString(body.source);
  if (source) {
    where.push(`Source__c = '${escapeSoqlLiteral(source)}'`);
  }

  if (body.nextOutreachOverdue === true) {
    where.push("Next_Outreach_Date__c < TODAY");
  }

  if (typeof body.minScore === "number" && Number.isFinite(body.minScore)) {
    where.push(`Prospect_Score__c >= ${body.minScore}`);
  }

  const limitRaw =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? body.limit
      : 10;
  const limit = Math.min(Math.max(Math.floor(limitRaw), 1), 200);

  const soql =
    "SELECT Id, Name, Full_Name__c, Company__c, Status__c, " +
    "Prospect_Score__c, BANT_Budget__c, Next_Outreach_Date__c, " +
    "Total_Activities__c, Total_Responses__c " +
    "FROM Prospect__c" +
    (where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY Prospect_Score__c DESC NULLS LAST" +
    ` LIMIT ${limit}`;

  try {
    const token = await getSalesforceToken();

    const result = await sfFetch<SoqlResponse>(
      `/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`,
      { method: "GET" },
      token,
    );

    const records = Array.isArray(result?.records) ? result!.records! : [];

    const prospects = records.map((r) => ({
      id: r.Id ?? null,
      prospectNumber: r.Name ?? null,
      name: r.Full_Name__c ?? null,
      company: r.Company__c ?? null,
      status: r.Status__c ?? null,
      score: typeof r.Prospect_Score__c === "number" ? r.Prospect_Score__c : null,
      budget: r.BANT_Budget__c ?? null,
      nextOutreachDate: r.Next_Outreach_Date__c ?? null,
      totalActivities:
        typeof r.Total_Activities__c === "number" ? r.Total_Activities__c : null,
      totalResponses:
        typeof r.Total_Responses__c === "number" ? r.Total_Responses__c : null,
    }));

    return agentJson({
      success: true,
      prospects,
      count: prospects.length,
    });
  } catch (err) {
    const sfBody = (err as any)?.sfBody;
    const message =
      err instanceof Error ? err.message : "Failed to query prospects.";
    console.error("query-prospects error:", {
      message,
      salesforceBody: sfBody,
      soql,
    });
    return agentError(message, 500);
  }
}
