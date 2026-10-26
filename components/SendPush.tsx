"use client";

import { useState, useEffect, useRef } from "react";
import type { ModelResult } from "@/lib/device";
import { toast } from "sonner";

export default function SendPush({
  subscription,
  model,
  iosVer,
  ctx,
  log,
  running,
  setRunning,
  simpleMode = false,
}: {
  subscription: PushSubscription | null;
  model: ModelResult | null;
  iosVer: { value: string; source: string } | null;
  ctx: string;
  log: (text: string) => void;
  running: string | null;
  setRunning: (v: string | null) => void;
  simpleMode?: boolean;
}) {
  const modelName = model?.candidates[0] ?? "device";
  const version = iosVer?.value ?? "unknown";

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"legacy" | "declarative">("legacy");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [ttl, setTtl] = useState("3600");
  const [urgency, setUrgency] = useState("high");
  const [topic, setTopic] = useState("");
  const [badge, setBadge] = useState("");
  const [lastResponse, setLastResponse] = useState<Record<string, unknown> | null>(null);

  // Cooldown countdown state
  const [countdown, setCountdown] = useState<number | null>(null);
  const [totalDelay, setTotalDelay] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from device info after SSR
    setTitle(`Test from ${modelName}`);
    setBody(`iOS ${version}, ${ctx}`);
  }, [modelName, version, ctx]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCountdown(null);
    setTotalDelay(null);
  };

  const handleSend = async (delaySeconds: number) => {
    const label = delaySeconds > 0 ? `Send in ${delaySeconds}s` : "Send now";

    if (!subscription) {
      const msg = "No active push subscription. Please subscribe first.";
      log(`✖ ${msg}`);
      toast.error("No Active Subscription", {
        description: "Please subscribe to push notifications before dispatching a test push.",
      });
      return;
    }

    setRunning(label);
    log(`▶ ${label} (${mode})`);

    // Cooldown countdown setup
    if (delaySeconds > 0) {
      setTotalDelay(delaySeconds);
      setCountdown(delaySeconds);
      const targetTime = Date.now() + delaySeconds * 1000;

      toast.info(`Push scheduled in ${delaySeconds}s`, {
        id: "push-status",
        description: "Lock your device now to test lock-screen notification delivery.",
      });

      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
        setCountdown(remaining);
        if (remaining <= 0 && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          toast.loading("Dispatching to Apple APNs...", {
            id: "push-status",
            description: "Waiting for APNs gateway response...",
          });
        }
      }, 100);
    } else {
      toast.loading("Sending push to APNs...", {
        id: "push-status",
        description: "Connecting to push service...",
      });
    }

    const payload: Record<string, unknown> = {
      subscription: subscription.toJSON(),
      mode,
      title: title || "Test push",
      body: body || "",
      delaySeconds,
      ttl: parseInt(ttl, 10) || 3600,
      urgency,
    };
    if (topic.trim()) payload.topic = topic.trim();
    if (badge.trim()) payload.badge = parseInt(badge.trim(), 10);

    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as Record<string, unknown>;
      setLastResponse(data);

      if (data.ok) {
        const apnsIdStr = data.apnsId ? String(data.apnsId) : null;
        log(`✔ ${label}: status ${data.status as number} apnsId=${apnsIdStr ?? "n/a"}`);
        toast.success(`Push delivered to APNs (${data.status})`, {
          id: "push-status",
          description: apnsIdStr
            ? `APNs-ID: ${apnsIdStr}. Check your lock screen or Delivery Log.`
            : "Apple accepted the push notification. Check your Delivery Log.",
        });
      } else {
        const hint = data.hint ? ` — ${data.hint as string}` : "";
        const upstream = data.upstream as Record<string, unknown> | undefined;
        let errMsg = String(data.error ?? "Failed to send push");
        if (upstream) {
          errMsg = `Upstream ${upstream.status as number}: ${(upstream.reason as string) ?? (upstream.body as string)}${hint}`;
        } else if (hint) {
          errMsg += hint;
        }
        log(`✖ ${errMsg}`);
        toast.error("Push Rejected", {
          id: "push-status",
          description: errMsg,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✖ Fetch failed: ${msg}`);
      setLastResponse({ error: msg });
      toast.error("Network Error", {
        id: "push-status",
        description: `Could not contact server: ${msg}`,
      });
    } finally {
      clearTimer();
      setRunning(null);
    }
  };

  const progressPercent =
    totalDelay && countdown !== null && totalDelay > 0
      ? Math.max(0, Math.min(100, Math.round((countdown / totalDelay) * 100)))
      : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Active Cooldown Banner */}
      {countdown !== null && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm transition-all animate-in fade-in">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white font-mono font-bold text-lg shadow-sm animate-pulse">
                {countdown}s
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  {countdown > 0
                    ? `Push delivering in ${countdown} second${countdown === 1 ? "" : "s"}`
                    : "Dispatching notification to Apple APNs…"}
                </p>
                <p className="text-xs text-amber-800">
                  {countdown > 0
                    ? "Lock your screen now to test background / lock-screen delivery."
                    : "Connecting to Apple push service gateway…"}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-amber-200/80 px-2.5 py-1 text-xs font-semibold text-amber-900">
              Cooldown
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-amber-200/60">
            <div
              className="h-full bg-amber-500 transition-all duration-150 ease-out rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Form Fields */}
      <div className="space-y-3">
        {/* Title */}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white text-zinc-900 px-3.5 py-2.5 text-[16px] shadow-sm focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
          />
        </label>

        {/* Body */}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Body</span>
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white text-zinc-900 px-3.5 py-2.5 text-[16px] shadow-sm focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
          />
        </label>

        {/* Push Mode — advanced only */}
        {!simpleMode && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700">Push Mode</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "legacy" | "declarative")}
              className="rounded-xl border border-zinc-200 bg-white text-zinc-900 px-3.5 py-2.5 text-[16px] shadow-sm focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
            >
              <option value="legacy">Legacy (Service Worker push event)</option>
              <option value="declarative">Declarative (iOS 18.4+ web_push: 8030)</option>
            </select>
          </label>
        )}

        {/* Advanced headers toggle — advanced only */}
        {!simpleMode && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
            >
              <span>{advancedOpen ? "▼" : "▶"}</span>
              <span>{advancedOpen ? "Hide push headers" : "Show push headers (TTL, urgency, topic, badge)"}</span>
            </button>
          </div>
        )}

        {!simpleMode && advancedOpen && (
          <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 animate-in fade-in">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-zinc-600">TTL (seconds, 1–86400)</span>
              <input
                type="number"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-zinc-600">Urgency</span>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
              >
                <option value="very-low">very-low</option>
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-zinc-600">Topic (collapse identifier, optional)</span>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. test-topic"
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-zinc-600">Badge count (0–99, optional)</span>
              <input
                type="number"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                placeholder="e.g. 1"
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none"
              />
            </label>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => handleSend(0)}
            disabled={running !== null}
            className="flex min-h-[48px] items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition-all select-none"
          >
            {running === "Send now" ? "Sending…" : "Send now"}
          </button>

          <button
            onClick={() => handleSend(10)}
            disabled={running !== null}
            className={`flex min-h-[48px] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold border transition-all select-none active:scale-[0.98] disabled:pointer-events-none ${
              running === "Send in 10s"
                ? "bg-amber-500 text-white border-amber-600 animate-pulse"
                : "bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50 disabled:opacity-40"
            }`}
          >
            {running === "Send in 10s" ? (
              countdown !== null && countdown > 0 ? (
                <span className="font-mono font-bold">{countdown}s…</span>
              ) : (
                <span>Dispatching…</span>
              )
            ) : (
              "Send in 10s"
            )}
          </button>
        </div>

        {/* Delay presets */}
        <div className="flex items-center justify-between gap-2 px-0.5 text-xs text-zinc-400">
          <span>Other delays:</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={running !== null}
              onClick={() => handleSend(5)}
              className="rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 active:scale-95 disabled:opacity-40"
            >
              5s
            </button>
            <button
              type="button"
              disabled={running !== null}
              onClick={() => handleSend(30)}
              className="rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 active:scale-95 disabled:opacity-40"
            >
              30s
            </button>
          </div>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed px-0.5">
          The delay happens on the server before dispatching to Apple APNs. Tap &ldquo;Send in 10s&rdquo; and immediately lock your phone to verify lock-screen delivery.
        </p>
      </div>

      {/* Response Card */}
      {lastResponse && (
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Last Response</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                lastResponse.ok === true
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {lastResponse.ok === true ? "Accepted" : "Failed"}
            </span>
          </div>

          <pre className="max-h-40 overflow-y-auto overflow-x-auto rounded-lg bg-zinc-50 border border-zinc-100 p-2.5 font-mono text-[11px] text-zinc-800 whitespace-pre-wrap break-all">
            {JSON.stringify(lastResponse, null, 2)}
          </pre>

          {typeof lastResponse.hint === "string" && lastResponse.hint && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs font-medium text-amber-900">
              <span>💡</span>
              <span>{lastResponse.hint}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
