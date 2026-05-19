import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. URL verification challenge (Slack sends this once when we set
    //    up Event Subscriptions).
    if (body?.type === "url_verification") {
      console.log(
        "Slack URL verification received, challenge:",
        body.challenge,
      );
      return NextResponse.json({ challenge: body.challenge });
    }

    // 2. Event callback (all real events come through this type).
    if (body?.type === "event_callback") {
      const event = body.event;
      console.log("Slack event received:", event?.type, {
        eventId: body.event_id,
        teamId: body.team_id,
      });

      // Acknowledge immediately — Slack requires a 200 within 3 seconds.
      // Actual handling of message / file_share / app_mention events
      // will be added in a later step.
      return NextResponse.json({ ok: true });
    }

    // Unknown event type — acknowledge so Slack doesn't retry.
    console.log("Slack event with unknown type:", body?.type);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error";
    console.error("Slack events error:", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Slack events endpoint" });
}
