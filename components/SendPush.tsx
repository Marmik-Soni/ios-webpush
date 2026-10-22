"use client";

import { useState, useEffect } from "react";
import type { ModelResult } from "@/lib/device";
import { getStored, setStored } from "@/lib/push-client";

export default function SendPush({
  subscription,
  model,
  iosVer,
  ctx,
  log,
  running,
  setRunning,
}: {
  subscription: PushSubscription | null;
  model: ModelResult | null;
  iosVer: { value: string; source: string } | null;
  ctx: string;
  log: (text: string) => void;
  running: string | null;
  setRunning: (v: string | null) => void;
}) {
  const modelName = model?.candidates[0] ?? "device";
  const version = iosVer?.value ?? "unknown";

  const [testerKey, setTesterKey] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"legacy" | "declarative">("legacy");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [ttl, setTtl] = useState("3600");
  const [urgency, setUrgency] = useState("high");
  const [topic, setTopic] = useState("");
  const [badge, setBadge] = useState("");
  const [lastResponse, setLastResponse] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after SSR
    setTesterKey(getStored("testerKey") ?? "");
    setTitle(`Test from ${modelName}`);
    setBody(`iOS ${version}, ${ctx}`);
  }, [modelName, version, ctx]);

  const handleSend = async (delaySeconds: number) => {
    const label = delaySeconds > 0 ? `Send in ${delaySeconds}s` : "Send now";
    setRunning(label);
    log(`▶ ${label} (${mode})`);

    if (!subscription) {
      log("✖ No active subscription");
      setRunning(null);
      return;
    }

    const key = testerKey.trim();
    if (!key) {
      log("✖ Tester key is empty");
      setRunning(null);
      return;
    }
    setStored("testerKey", key);

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
          "x-tester-key": key,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as Record<string, unknown>;
      setLastResponse(data);

      if (data.ok) {
        log(`✔ ${label}: status ${data.status as number} apnsId=${String(data.apnsId ?? "n/a")}`);
      } else {
        const hint = data.hint ? ` — ${data.hint as string}` : "";
        const upstream = data.upstream as Record<string, unknown> | undefined;
        if (upstream) {
          log(
            `✖ Upstream ${upstream.status as number}: ${(upstream.reason as string) ?? (upstream.body as string)}${hint}`,
          );
        } else {
          log(`✖ ${data.error as string}${hint}`);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✖ Fetch failed: ${msg}`);
      setLastResponse({ error: msg });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 pt-3 border-t border-zinc-200">
      <h3 className="text-base font-semibold text-zinc-900">Send Test Push</h3>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 font-medium">Tester key</span>
        <input
          type="password"
          value={testerKey}
          onChange={(e) => {
            setTesterKey(e.target.value);
            setStored("testerKey", e.target.value);
          }}
          placeholder="Your TESTER_KEY value"
          className="rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none px-3 py-2 text-[16px] placeholder:text-zinc-400"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 font-medium">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none px-3 py-2 text-[16px]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 font-medium">Body</span>
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none px-3 py-2 text-[16px]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 font-medium">Mode</span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "legacy" | "declarative")}
          className="rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none px-3 py-2 text-[16px]"
        >
          <option value="legacy">Legacy (SW-based)</option>
          <option value="declarative">Declarative (iOS 18.4+)</option>
        </select>
      </label>

      <button
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="text-left text-sm text-zinc-600 hover:text-zinc-900 underline underline-offset-2 transition-colors"
      >
        {advancedOpen ? "Hide" : "Show"} advanced fields
      </button>

      {advancedOpen && (
        <div className="flex flex-col gap-2 pl-2 border-l-2 border-zinc-200">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 font-medium">TTL (seconds, 1-86400)</span>
            <input
              type="number"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none px-3 py-2 text-[16px]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 font-medium">Urgency</span>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none px-3 py-2 text-[16px]"
            >
              <option value="very-low">very-low</option>
              <option value="low">low</option>
              <option value="normal">normal</option>
              <option value="high">high</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 font-medium">Topic (optional, 1-32 chars)</span>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none px-3 py-2 text-[16px]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 font-medium">Badge (optional, 0-99)</span>
            <input
              type="number"
              value={badge}
              onChange={(e) => setBadge(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none px-3 py-2 text-[16px]"
            />
          </label>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => handleSend(0)}
          className="flex-1 min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm active:scale-[0.98] transition-colors select-none"
        >
          {running === "Send now" ? "sending…" : "Send now"}
        </button>
        <button
          onClick={() => handleSend(10)}
          className="flex-1 min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 active:scale-[0.98] transition-colors select-none"
        >
          {running === "Send in 10s" ? "sending…" : "Send in 10 s"}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        &ldquo;Send in 10 s&rdquo;: the delay happens on the server. Lock the phone after tapping to
        test background delivery.
      </p>

      {lastResponse && (
        <div className="flex flex-col gap-2">
          <pre className="text-xs bg-zinc-50 border border-zinc-200 text-zinc-800 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto font-mono">
            {JSON.stringify(lastResponse, null, 2)}
          </pre>
          {lastResponse.ok === true && (
            <p className="text-xs text-zinc-500">
              201 means Apple accepted the push, not that it was displayed. The Delivery log is the
              evidence.
            </p>
          )}
          {typeof lastResponse.hint === "string" && lastResponse.hint && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg font-medium">
              💡 {lastResponse.hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
