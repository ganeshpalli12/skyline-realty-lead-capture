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

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(request: Request) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.value;

  let leadId: string;
  let visitDateTimeRaw: string;
  let projectName: string;
  try {
    leadId = requireString(body, "leadId");
    visitDateTimeRaw = requireString(body, "visitDateTime");
    projectName = requireString(body, "projectName");
  } catch (err) {
    return agentError(
      err instanceof Error ? err.message : "Invalid request",
      400,
    );
  }

  const visitDate = new Date(visitDateTimeRaw);
  if (Number.isNaN(visitDate.getTime())) {
    return agentError(
      "'visitDateTime' must be a valid ISO 8601 datetime string.",
      400,
    );
  }
  const visitIso = visitDate.toISOString();
  const visitDateOnly = visitIso.slice(0, 10);

  try {
    const token = await getSalesforceToken();

    // 1. Update the Lead with the scheduled visit + qualification status.
    await sfFetch(
      `/services/data/${SF_API_VERSION}/sobjects/Lead/${encodeURIComponent(
        leadId,
      )}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          Site_Visit_Scheduled_At__c: visitIso,
          Qualification_Status__c: "Booked",
          Last_Conversation_At__c: new Date().toISOString(),
        }),
      },
      token,
    );

    // 2. Create a follow-up Task attached to the Lead.
    const taskRes = await sfFetch<{ id?: string; success?: boolean }>(
      `/services/data/${SF_API_VERSION}/sobjects/Task/`,
      {
        method: "POST",
        body: JSON.stringify({
          Subject: `Site visit scheduled: ${projectName}`,
          ActivityDate: visitDateOnly,
          Status: "Not Started",
          Priority: "High",
          WhoId: leadId,
        }),
      },
      token,
    );

    if (!taskRes?.id) {
      throw new Error("Task creation returned no ID.");
    }

    return agentJson({
      success: true,
      message: "Site visit booked",
      taskId: taskRes.id,
    });
  } catch (err) {
    const status = (err as any)?.status === 404 ? 404 : 500;
    const message =
      err instanceof Error ? err.message : "Failed to book site visit.";
    console.error("book-visit error:", err);
    return agentError(message, status);
  }
}
