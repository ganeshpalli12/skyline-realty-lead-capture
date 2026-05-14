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

/**
 * Salesforce Data Cloud DMOs (suffix __dlm) are queried via the Data Cloud
 * SQL endpoint, not the classic SOQL endpoint. The response shape is:
 *   { data: [[...row values...]], metadata: [{ name, type }, ...] }
 * or { data: [{ColName: value, ...}, ...], ... } depending on the org.
 * We handle both.
 */
type DcQueryResponse = {
  data?: Array<Array<unknown> | Record<string, unknown>>;
  metadata?: Array<{ name?: string; type?: string }> | Record<string, unknown>;
  done?: boolean;
};

const FIELD_ALIASES: Record<keyof InventoryUnit, string[]> = {
  unitId: ["UnitId__c", "Unit_Id__c", "unitId__c", "Unit_ID__c", "Name"],
  project: ["Project__c", "ProjectName__c", "Project_Name__c", "project__c"],
  tower: ["Tower__c", "TowerName__c", "Tower_Name__c", "tower__c"],
  unitNumber: ["UnitNumber__c", "Unit_Number__c", "unitNumber__c"],
  configuration: ["Configuration__c", "configuration__c"],
  carpetAreaSqft: [
    "CarpetAreaSqft__c",
    "Carpet_Area_Sqft__c",
    "carpetAreaSqft__c",
    "CarpetArea__c",
  ],
  priceInr: ["PriceInr__c", "Price_INR__c", "priceInr__c", "Price__c"],
  facing: ["Facing__c", "facing__c"],
  amenities: ["Amenities__c", "amenities__c"],
};

const STATUS_FIELDS = ["Status__c", "status__c", "InventoryStatus__c"];

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function rowToObject(
  row: Array<unknown> | Record<string, unknown>,
  metadata?: DcQueryResponse["metadata"],
): Record<string, unknown> {
  if (Array.isArray(row)) {
    if (Array.isArray(metadata)) {
      const out: Record<string, unknown> = {};
      metadata.forEach((m, i) => {
        if (m?.name) out[m.name] = row[i];
      });
      return out;
    }
    return { _row: row };
  }
  return row as Record<string, unknown>;
}

function pickField<T = unknown>(
  obj: Record<string, unknown>,
  aliases: string[],
): T | null {
  // Try exact matches first.
  for (const key of aliases) {
    if (key in obj && obj[key] !== null && obj[key] !== undefined) {
      return obj[key] as T;
    }
  }
  // Case-insensitive fallback.
  const lowerMap: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    lowerMap[k.toLowerCase()] = v;
  }
  for (const key of aliases) {
    const v = lowerMap[key.toLowerCase()];
    if (v !== null && v !== undefined) return v as T;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
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

  try {
    const token = await getSalesforceToken();

    // Build SQL for the Data Cloud query endpoint.
    const where: string[] = [
      `(${STATUS_FIELDS.map(
        (f) => `${f} = 'Available'`,
      ).join(" OR ")})`,
    ];

    if (projectName) {
      const escaped = escapeSqlLiteral(projectName);
      const projectFields = FIELD_ALIASES.project;
      where.push(
        `(${projectFields
          .map((f) => `${f} = '${escaped}'`)
          .join(" OR ")})`,
      );
    }

    if (configuration) {
      const escaped = escapeSqlLiteral(configuration);
      const configFields = FIELD_ALIASES.configuration;
      where.push(
        `(${configFields
          .map((f) => `${f} = '${escaped}'`)
          .join(" OR ")})`,
      );
    }

    const sql = `SELECT * FROM Inventory__dlm WHERE ${where.join(
      " AND ",
    )} LIMIT ${maxResults}`;

    let rows: Array<Record<string, unknown>> = [];
    try {
      const result = await sfFetch<DcQueryResponse>(
        `/services/data/${SF_API_VERSION}/ssot/queryv2`,
        {
          method: "POST",
          body: JSON.stringify({ sql }),
        },
        token,
      );

      const rawRows = Array.isArray(result?.data) ? result!.data! : [];
      rows = rawRows.map((r) => rowToObject(r, result?.metadata));
    } catch (dcErr) {
      // Fallback: try a classic SOQL query in case the org exposes the DMO
      // through standard SOQL (rare, but possible for some configurations).
      console.warn(
        "Data Cloud query failed, falling back to classic SOQL:",
        (dcErr as Error)?.message,
      );

      const soqlWhere = [`Status__c = 'Available'`];
      if (projectName) {
        soqlWhere.push(
          `Project__c = '${escapeSqlLiteral(projectName)}'`,
        );
      }
      if (configuration) {
        soqlWhere.push(
          `Configuration__c = '${escapeSqlLiteral(configuration)}'`,
        );
      }
      const soql = `SELECT FIELDS(ALL) FROM Inventory__dlm WHERE ${soqlWhere.join(
        " AND ",
      )} LIMIT ${maxResults}`;

      const soqlResult = await sfFetch<{ records?: Array<Record<string, unknown>> }>(
        `/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`,
        { method: "GET" },
        token,
      );
      rows = soqlResult?.records ?? [];
    }

    const units: InventoryUnit[] = rows.map((row) => ({
      unitId: toStr(pickField(row, FIELD_ALIASES.unitId)),
      project: toStr(pickField(row, FIELD_ALIASES.project)),
      tower: toStr(pickField(row, FIELD_ALIASES.tower)),
      unitNumber: toStr(pickField(row, FIELD_ALIASES.unitNumber)),
      configuration: toStr(pickField(row, FIELD_ALIASES.configuration)),
      carpetAreaSqft: toNumber(pickField(row, FIELD_ALIASES.carpetAreaSqft)),
      priceInr: toNumber(pickField(row, FIELD_ALIASES.priceInr)),
      facing: toStr(pickField(row, FIELD_ALIASES.facing)),
      amenities: toStr(pickField(row, FIELD_ALIASES.amenities)),
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
