import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Whisper + Slack posting after the 200 ack can take ~10s on a long
// clip. Give the function room.
export const maxDuration = 60;

const AUDIO_FILETYPES = new Set([
  "mp4",
  "webm",
  "m4a",
  "wav",
  "mp3",
  "ogg",
]);

type SlackFile = {
  id?: string;
  name?: string;
  mimetype?: string;
  filetype?: string;
  url_private_download?: string;
  url_private?: string;
};

type SlackEvent = {
  type?: string;
  subtype?: string;
  text?: string;
  channel?: string;
  user?: string;
  bot_id?: string;
  bot_profile?: unknown;
  files?: SlackFile[];
  ts?: string;
  event_ts?: string;
  thread_ts?: string;
};

function isAudioFile(f: SlackFile): boolean {
  if (typeof f.mimetype === "string" && f.mimetype.startsWith("audio/")) {
    return true;
  }
  if (
    typeof f.filetype === "string" &&
    AUDIO_FILETYPES.has(f.filetype.toLowerCase())
  ) {
    return true;
  }
  return false;
}

async function downloadSlackFile(
  file: SlackFile,
  token: string,
): Promise<{ blob: Blob; filename: string }> {
  const url = file.url_private_download || file.url_private;
  if (!url) throw new Error("Slack file has no download URL.");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Slack file download failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const blob = await res.blob();
  const filename =
    file.name ||
    `audio.${(file.filetype || "webm").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  return { blob, filename };
}

async function transcribeWithWhisper(
  blob: Blob,
  filename: string,
  apiKey: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", "whisper-1");

  const res = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Whisper transcription failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { text?: string };
  return (data?.text ?? "").trim();
}

async function postSlackMessage(
  channel: string,
  text: string,
  token: string,
  threadTs?: string,
) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    }),
  });

  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;

  if (!res.ok || !data?.ok) {
    throw new Error(
      `Slack chat.postMessage failed: ${data?.error || `http ${res.status}`}`,
    );
  }
  return data;
}

function isFromBot(event: SlackEvent): boolean {
  if (event.bot_id) return true;
  if (event.subtype === "bot_message") return true;
  if (event.bot_profile) return true;
  return false;
}

async function processEvent(event: SlackEvent, eventId: string | undefined) {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!slackToken) {
    console.error("Slack: SLACK_BOT_TOKEN not configured");
    return;
  }

  if (isFromBot(event)) {
    console.log("Slack: ignoring bot-authored event", { eventId });
    return;
  }

  const channel = event.channel;
  if (!channel) {
    console.log("Slack: event has no channel, ignoring", { eventId });
    return;
  }

  // 1. Audio file path — voice notes come through here.
  const audioFile = (event.files || []).find(isAudioFile);
  if (audioFile) {
    if (!openaiKey) {
      console.error("Slack: OPENAI_API_KEY not configured");
      try {
        await postSlackMessage(
          channel,
          "Got your voice note, but transcription isn't configured yet.",
          slackToken,
          event.thread_ts,
        );
      } catch (err) {
        console.error("Slack: fallback reply failed:", err);
      }
      return;
    }

    try {
      const { blob, filename } = await downloadSlackFile(
        audioFile,
        slackToken,
      );
      const transcript = await transcribeWithWhisper(
        blob,
        filename,
        openaiKey,
      );
      console.log("Voice transcribed:", transcript);

      const reply = transcript
        ? `Got your voice note. Here's what I heard:\n\n> ${transcript}`
        : "Got your voice note, but I couldn't make out any words.";

      await postSlackMessage(channel, reply, slackToken, event.thread_ts);
    } catch (err) {
      console.error("Slack: voice processing failed:", err);
      try {
        await postSlackMessage(
          channel,
          "Sorry, I couldn't transcribe that audio.",
          slackToken,
          event.thread_ts,
        );
      } catch (replyErr) {
        console.error("Slack: error reply failed:", replyErr);
      }
    }
    return;
  }

  // 2. Plain text message path.
  if (event.type === "message" && typeof event.text === "string" && event.text.trim().length > 0) {
    console.log("Text message received:", event.text);
    try {
      await postSlackMessage(
        channel,
        `Got your message: ${event.text}`,
        slackToken,
        event.thread_ts,
      );
    } catch (err) {
      console.error("Slack: text reply failed:", err);
    }
    return;
  }

  console.log("Slack: no-op event", {
    eventId,
    type: event.type,
    subtype: event.subtype,
    hasFiles: Array.isArray(event.files) && event.files.length > 0,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. URL verification — Slack sends this once when Event
    //    Subscriptions is configured.
    if (body?.type === "url_verification") {
      console.log(
        "Slack URL verification received, challenge:",
        body.challenge,
      );
      return NextResponse.json({ challenge: body.challenge });
    }

    // 2. Event callback.
    if (body?.type === "event_callback") {
      const event = body.event as SlackEvent;
      console.log("Slack event received:", event?.type, {
        subtype: event?.subtype,
        eventId: body.event_id,
        teamId: body.team_id,
        hasFiles:
          Array.isArray(event?.files) && (event.files?.length ?? 0) > 0,
      });

      // Acknowledge fast; do real work after the 200.
      waitUntil(
        (async () => {
          try {
            await processEvent(event, body.event_id);
          } catch (err) {
            console.error("Slack: processEvent threw:", err);
          }
        })(),
      );

      return NextResponse.json({ ok: true });
    }

    console.log("Slack event with unknown type:", body?.type);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
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
