export const SF_API_VERSION = "v60.0";

export type SalesforceToken = {
  accessToken: string;
  instanceUrl: string;
};

function getEnv() {
  const instanceUrl = process.env.SF_INSTANCE_URL;
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;

  if (!instanceUrl || !clientId || !clientSecret) {
    throw new Error(
      "Salesforce is not configured. Set SF_INSTANCE_URL, SF_CLIENT_ID, SF_CLIENT_SECRET.",
    );
  }

  return { instanceUrl, clientId, clientSecret };
}

/**
 * Exchange the configured client credentials for a short-lived Salesforce access token.
 * Mirrors the OAuth flow used in /api/submit-lead.
 */
export async function getSalesforceToken(): Promise<SalesforceToken> {
  const { instanceUrl, clientId, clientSecret } = getEnv();

  const res = await fetch(`${instanceUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed?.access_token) {
    const msg =
      parsed?.error_description ||
      parsed?.error ||
      `Salesforce token request failed (${res.status})`;
    throw new Error(msg);
  }

  return {
    accessToken: parsed.access_token as string,
    instanceUrl: (parsed.instance_url as string) || instanceUrl,
  };
}

export type SfFetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

/**
 * Wrapper around fetch() for Salesforce REST calls.
 * - Prepends the token's instance_url
 * - Adds Authorization: Bearer
 * - Parses JSON (returns null for empty/204 responses)
 * - Throws a descriptive Error on non-2xx responses
 */
export async function sfFetch<T = any>(
  path: string,
  options: SfFetchOptions = {},
  token: SalesforceToken,
): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `${token.instanceUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    Accept: "application/json",
    ...(options.headers || {}),
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    ...options,
    headers,
    cache: "no-store",
  });

  // 204 No Content (typical for PATCH/DELETE) — nothing to parse.
  if (res.status === 204) {
    return null as T;
  }

  const text = await res.text();
  let parsed: any = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const sfMessage =
      (Array.isArray(parsed) && parsed[0]?.message) ||
      parsed?.message ||
      parsed?.error_description ||
      parsed?.error ||
      (typeof parsed === "string" ? parsed : null) ||
      `Salesforce request failed (${res.status})`;
    const err = new Error(sfMessage);
    (err as any).status = res.status;
    (err as any).sfBody = parsed;
    throw err;
  }

  return parsed as T;
}
