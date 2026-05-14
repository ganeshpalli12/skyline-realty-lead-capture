import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeadPayload = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  projectInterest: string;
  budgetRange: string;
  configuration: string;
  preferredChannel: string;
  message?: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validate(body: unknown): LeadPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  const b = body as Record<string, unknown>;
  const required = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "projectInterest",
    "budgetRange",
    "configuration",
    "preferredChannel",
  ] as const;

  for (const key of required) {
    if (!isNonEmptyString(b[key])) {
      throw new Error(`Missing or invalid field: ${key}`);
    }
  }

  return {
    firstName: (b.firstName as string).trim(),
    lastName: (b.lastName as string).trim(),
    email: (b.email as string).trim(),
    phone: (b.phone as string).trim(),
    projectInterest: (b.projectInterest as string).trim(),
    budgetRange: (b.budgetRange as string).trim(),
    configuration: (b.configuration as string).trim(),
    preferredChannel: (b.preferredChannel as string).trim(),
    message: isNonEmptyString(b.message) ? (b.message as string).trim() : undefined,
  };
}

async function getAccessToken(instanceUrl: string, clientId: string, clientSecret: string) {
  const tokenRes = await fetch(`${instanceUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    cache: "no-store",
  });

  const text = await tokenRes.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!tokenRes.ok || !parsed?.access_token) {
    const msg =
      parsed?.error_description ||
      parsed?.error ||
      `Salesforce token request failed (${tokenRes.status})`;
    throw new Error(msg);
  }

  return {
    accessToken: parsed.access_token as string,
    apiInstanceUrl: (parsed.instance_url as string) || instanceUrl,
  };
}

async function createLead(
  apiInstanceUrl: string,
  accessToken: string,
  data: LeadPayload,
) {
  const leadBody: Record<string, string> = {
    FirstName: data.firstName,
    LastName: data.lastName,
    Email: data.email,
    Phone: data.phone,
    Company: "Individual Buyer",
    LeadSource: "Web",
    Project_Interest__c: data.projectInterest,
    Budget_Range__c: data.budgetRange,
    Configuration__c: data.configuration,
    Preferred_Channel__c: data.preferredChannel,
    Qualification_Status__c: "New",
  };

  if (data.message) {
    leadBody.Description = data.message;
  }

  const res = await fetch(
    `${apiInstanceUrl}/services/data/v60.0/sobjects/Lead/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(leadBody),
      cache: "no-store",
    },
  );

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed?.id) {
    const sfError =
      (Array.isArray(parsed) && parsed[0]?.message) ||
      parsed?.message ||
      `Salesforce lead creation failed (${res.status})`;
    throw new Error(sfError);
  }

  return parsed.id as string;
}

export async function POST(request: Request) {
  try {
    const instanceUrl = process.env.SF_INSTANCE_URL;
    const clientId = process.env.SF_CLIENT_ID;
    const clientSecret = process.env.SF_CLIENT_SECRET;

    if (!instanceUrl || !clientId || !clientSecret) {
      console.error("submit-lead: missing Salesforce env vars");
      return NextResponse.json(
        {
          success: false,
          error:
            "Server is not configured. Set SF_INSTANCE_URL, SF_CLIENT_ID, SF_CLIENT_SECRET.",
        },
        { status: 500 },
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    let data: LeadPayload;
    try {
      data = validate(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid request";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const { accessToken, apiInstanceUrl } = await getAccessToken(
      instanceUrl,
      clientId,
      clientSecret,
    );

    const leadId = await createLead(apiInstanceUrl, accessToken, data);

    return NextResponse.json({ success: true, leadId }, { status: 200 });
  } catch (err) {
    console.error("submit-lead error:", err);
    const message =
      err instanceof Error
        ? err.message
        : "Unexpected error while submitting the lead.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
