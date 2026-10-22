import { type NextRequest } from "next/server";
import crypto from "node:crypto";
import webpush from "web-push";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status });
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const ALLOWED_HOSTS = ["push.apple.com", "fcm.googleapis.com", "updates.push.services.mozilla.com"];

function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    const host = url.hostname;
    if (ALLOWED_HOSTS.includes(host)) return true;
    // *.push.apple.com, *.notify.windows.com
    if (host.endsWith(".push.apple.com")) return true;
    if (host.endsWith(".notify.windows.com")) return true;
    return false;
  } catch {
    return false;
  }
}

function siteOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // 1. Auth
  const testerKey = process.env.TESTER_KEY;
  if (!testerKey) {
    return json({ error: "TESTER_KEY not configured" }, 500);
  }

  const reqKey = req.headers.get("x-tester-key") ?? "";
  if (!safeEqual(reqKey, testerKey)) {
    return json({ error: "Unauthorized" }, 401);
  }

  // 2. VAPID config
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    const missing: string[] = [];
    if (!vapidPublic) missing.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    if (!vapidPrivate) missing.push("VAPID_PRIVATE_KEY");
    if (!vapidSubject) missing.push("VAPID_SUBJECT");
    return json({ error: `Missing env vars: ${missing.join(", ")}` }, 500);
  }

  if (!vapidSubject.startsWith("mailto:") && !vapidSubject.startsWith("https://")) {
    return json({ error: "VAPID_SUBJECT must start with mailto: or https://" }, 500);
  }
  if (/[\s<>]/.test(vapidSubject)) {
    return json({ error: "VAPID_SUBJECT must not contain spaces or angle brackets" }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  // 3. Validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return json({ error: "Body must be an object" }, 400);
  }

  const b = body as Record<string, unknown>;

  // Subscription
  const subscription = b.subscription;
  if (typeof subscription !== "object" || subscription === null) {
    return json({ error: "subscription is required" }, 400);
  }
  const sub = subscription as Record<string, unknown>;
  if (typeof sub.endpoint !== "string" || !sub.endpoint) {
    return json({ error: "subscription.endpoint is required" }, 400);
  }
  if (!isAllowedEndpoint(sub.endpoint)) {
    return json(
      { error: "subscription.endpoint must be a known push service (Apple, FCM, Mozilla, WNS)" },
      400,
    );
  }
  const keys = sub.keys;
  if (typeof keys !== "object" || keys === null) {
    return json({ error: "subscription.keys is required" }, 400);
  }
  const k = keys as Record<string, unknown>;
  if (typeof k.p256dh !== "string" || typeof k.auth !== "string") {
    return json({ error: "subscription.keys.p256dh and keys.auth must be strings" }, 400);
  }

  // Fields
  const mode = b.mode;
  if (mode !== "legacy" && mode !== "declarative") {
    return json({ error: 'mode must be "legacy" or "declarative"' }, 400);
  }

  const title = typeof b.title === "string" ? b.title.slice(0, 100) : "Test push";
  const bodyText = typeof b.body === "string" ? b.body.slice(0, 500) : "";

  const delaySeconds =
    typeof b.delaySeconds === "number" &&
    Number.isInteger(b.delaySeconds) &&
    b.delaySeconds >= 0 &&
    b.delaySeconds <= 30
      ? b.delaySeconds
      : 0;

  const ttl =
    typeof b.ttl === "number" && Number.isInteger(b.ttl) && b.ttl >= 1 && b.ttl <= 86400
      ? b.ttl
      : 3600;

  const URGENCIES = ["very-low", "low", "normal", "high"] as const;
  const urgency =
    typeof b.urgency === "string" && (URGENCIES as readonly string[]).includes(b.urgency)
      ? b.urgency
      : "high";

  let topic: string | undefined;
  if (typeof b.topic === "string" && b.topic.length > 0) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(b.topic)) {
      return json({ error: "topic must be 1-32 URL-safe base64 characters" }, 400);
    }
    topic = b.topic;
  }

  let badge: number | undefined;
  if (typeof b.badge === "number") {
    if (!Number.isInteger(b.badge) || b.badge < 0 || b.badge > 99) {
      return json({ error: "badge must be an integer 0-99" }, 400);
    }
    badge = b.badge;
  }

  // 4. Build payload
  const sentAt = Date.now();
  const id = crypto.randomUUID();
  const origin = siteOrigin(req);

  let payload: Record<string, unknown>;
  if (mode === "declarative") {
    const notification: Record<string, unknown> = {
      title,
      body: bodyText,
      navigate: origin + "/",
      silent: false,
      data: { sentAt, id },
    };
    if (badge !== undefined) {
      notification.app_badge = String(badge);
    }
    payload = { web_push: 8030, notification };
  } else {
    payload = { title, body: bodyText, url: "/", sentAt, id } as Record<string, unknown>;
    if (badge !== undefined) {
      (payload as Record<string, unknown>).badge = badge;
    }
  }

  const payloadStr = JSON.stringify(payload);
  const payloadBytes = Buffer.byteLength(payloadStr, "utf-8");
  if (payloadBytes > 3990) {
    return json(
      { error: "Payload exceeds ~3990 bytes (4KB limit includes encryption overhead)" },
      413,
    );
  }

  // 5. Delay
  if (delaySeconds > 0) {
    await sleep(delaySeconds * 1000);
  }

  // 6. Send
  const pushSub = {
    endpoint: sub.endpoint as string,
    keys: {
      p256dh: k.p256dh as string,
      auth: k.auth as string,
    },
  };

  const options: webpush.RequestOptions = {
    TTL: ttl,
    urgency: urgency as webpush.Urgency,
    timeout: 15000,
  };
  if (topic) {
    options.topic = topic;
  }

  try {
    const result = await webpush.sendNotification(pushSub, payloadStr, options);
    const apnsId = result.headers?.["apns-id"] ?? null;
    const endpointHost = new URL(sub.endpoint as string).hostname;

    return json(
      {
        ok: true,
        status: result.statusCode,
        apnsId,
        endpointHost,
        mode,
        ttl,
        urgency,
        topic: topic ?? null,
        payloadBytes,
        delaySeconds,
        sentAt,
      },
      200,
    );
  } catch (e: unknown) {
    // 7. Error handling
    if (typeof e === "object" && e !== null && "statusCode" in e) {
      const wpe = e as {
        statusCode: number;
        body: string;
        headers: Record<string, string>;
      };

      let reason: string | null = null;
      try {
        const parsed = JSON.parse(wpe.body) as Record<string, unknown>;
        if (typeof parsed.reason === "string") reason = parsed.reason;
      } catch {
        // body not JSON
      }

      let hint = "";
      if (wpe.statusCode === 403 && reason === "BadJwtToken") {
        hint = "Check VAPID_SUBJECT — it must be a valid mailto: or https:// URL.";
      } else if (wpe.statusCode === 403 && reason === "VapidPkHashMismatch") {
        hint =
          "The subscription was created with a different VAPID public key. Unsubscribe and subscribe again.";
      } else if (wpe.statusCode === 410) {
        hint = "Subscription expired. Subscribe again.";
      } else if (wpe.statusCode === 413) {
        hint = "Payload exceeds 4 KB.";
      } else if (wpe.statusCode === 429) {
        hint = "Too many requests — slow down.";
      }

      return json(
        {
          ok: false,
          upstream: {
            status: wpe.statusCode,
            reason,
            body: wpe.body,
          },
          hint,
        },
        502,
      );
    }

    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
}
