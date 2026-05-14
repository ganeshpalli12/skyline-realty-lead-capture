import { NextResponse } from "next/server";

/**
 * CORS headers applied to /api/agent/* routes so ElevenLabs (and other server
 * or browser-side callers) can invoke them. These are intentionally NOT applied
 * to /api/submit-lead, which remains same-origin only.
 */
export const AGENT_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: AGENT_CORS_HEADERS });
}

export function agentJson<T extends Record<string, unknown>>(
  body: T,
  status = 200,
) {
  return NextResponse.json(body, { status, headers: AGENT_CORS_HEADERS });
}

export function agentError(message: string, status = 500) {
  console.error(`agent route error (${status}):`, message);
  return agentJson({ success: false, error: message }, status);
}

/**
 * Safely parse the incoming JSON body. Returns a typed error response if the
 * payload is missing or malformed.
 */
export async function readJson(request: Request): Promise<
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: ReturnType<typeof agentError> }
> {
  try {
    const value = (await request.json()) as Record<string, unknown>;
    if (!value || typeof value !== "object") {
      return { ok: false, response: agentError("Body must be a JSON object.", 400) };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, response: agentError("Request body must be valid JSON.", 400) };
  }
}

export function requireString(
  body: Record<string, unknown>,
  key: string,
): string {
  const v = body[key];
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Missing or invalid field: ${key}`);
  }
  return v.trim();
}
