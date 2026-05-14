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

type InventoryUnit = {
  unitId: string | null;
  project: string | null;
  tower: string | null;
  unitNumber: string | null;
  configuration: string | null;
  carpetAreaSqft: number | null;
  priceInr: number | null;
  facing: string | null;
  amenities: string | null;
};

type QueryV2Response = {
  data?: unknown[][];
  metadata?: unknown;
  rowCount?: number;
};

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.value;
  const projectName =
    typeof body.projectName === "string" && body.projectName.trim().length > 0
      ? body.projectName.trim()
      : null;
  const configuration =
    typeof body.configuration === "string" &&
    body.configuration.trim().length > 0
      ? body.configuration.trim()
      : null;
  const maxResultsRaw =
    typeof body.maxResults === "number" ? body.maxResults : 3;
  const maxResults = Math.min(
    Math.max(Math.floor(Number.isFinite(maxResultsRaw) ? maxResultsRaw : 3), 1),
    25,
  );

  const where: string[] = ["status__c = 'Available'"];
  if (projectName) {
    where.push(`project_name__c = '${escapeSqlLiteral(projectName)}'`);
  }
  if (configuration) {
    where.push(`configuration__c = '${escapeSqlLiteral(configuration)}'`);
  }

  const sql =
    "SELECT unit_id__c, project_name__c, tower__c, unit_number__c, " +
    "configuration__c, carpet_area_sqft__c, price_inr__c, facing__c, amenities__c " +
    `FROM Inventory__dlm WHERE ${where.join(" AND ")} LIMIT ${maxResults}`;

  try {
    const token = await getSalesforceToken();

    const result = await sfFetch<QueryV2Response>(
      `/services/data/${SF_API_VERSION}/ssot/queryv2`,
      {
        method: "POST",
        body: JSON.stringify({ sql }),
      },
      token,
    );

    const rows: unknown[][] = Array.isArray(result?.data) ? result!.data! : [];

    const units: InventoryUnit[] = rows.map((row) => ({
      unitId: toStr(row[0]),
      project: toStr(row[1]),
      tower: toStr(row[2]),
      unitNumber: toStr(row[3]),
      configuration: toStr(row[4]),
      carpetAreaSqft: toNumber(row[5]),
      priceInr: toNumber(row[6]),
      facing: toStr(row[7]),
      amenities: toStr(row[8]),
    }));

    return agentJson({
      success: true,
      units,
      count: units.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to query inventory.";
    console.error("get-inventory error:", err);
    return agentError(message, 500);
  }
}
