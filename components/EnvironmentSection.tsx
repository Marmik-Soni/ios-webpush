"use client";

import type { EnvironmentInfo, ModelResult } from "@/lib/device";
import { useState } from "react";
import { toast } from "sonner";

export default function EnvironmentSection({
  env,
  apple,
  ctx,
  iosVer,
  model,
}: {
  env: EnvironmentInfo;
  apple: boolean;
  ctx: string;
  iosVer: { value: string; source: string } | null;
  model: ModelResult | null;
}) {
  const [uaOpen, setUaOpen] = useState(false);

  const handleCopyUA = async () => {
    try {
      await navigator.clipboard.writeText(env.userAgent);
      toast.success("User Agent copied to clipboard");
    } catch {
      window.prompt("Copy:", env.userAgent);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden bg-white shadow-2xs">
        <Row
          label="Context"
          value={ctx}
          badge={ctx === "Standalone (Home Screen)" ? "pwa" : "browser"}
        />
        <Row
          label="Platform"
          value={
            apple
              ? /iPad/.test(env.userAgent) ||
                (env.platform === "MacIntel" && env.maxTouchPoints > 1)
                ? "iPad"
                : "iPhone"
              : env.platform
          }
        />
        <Row label="iOS Version" value={iosVer ? `${iosVer.value} (${iosVer.source})` : "n/a"} />
        <Row
          label="Model"
          value={
            model
              ? model.candidates.length > 0
                ? `${model.candidates.join(" / ")}`
                : `Unknown (${model.key})`
              : "detecting…"
          }
          subtext={model?.confidence ? `confidence: ${model.confidence}` : undefined}
        />
        <Row
          label="Screen Resolution"
          value={`${env.screenWidth}×${env.screenHeight} @${env.devicePixelRatio}x`}
        />
        <Row label="Viewport Dimensions" value={`${env.innerWidth}×${env.innerHeight}`} />
        <Row
          label="Secure Context"
          value={env.isSecureContext ? "Yes (HTTPS)" : "No"}
          ok={env.isSecureContext}
        />
        <Row
          label="navigator.standalone"
          value={
            env.navigatorStandalone === undefined ? "undefined" : String(env.navigatorStandalone)
          }
          ok={env.navigatorStandalone === true}
        />
        <Row
          label="display-mode: standalone"
          value={env.displayModeStandalone ? "Yes" : "No"}
          ok={env.displayModeStandalone}
        />
      </div>

      {model && model.confidence !== "unique" && (
        <p className="text-xs text-zinc-500 px-1">
          💡 Note: Display Zoom or custom scaling changes screen dimensions. Model identification is
          best-effort.
        </p>
      )}

      <div>
        <button
          onClick={() => setUaOpen(!uaOpen)}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          {uaOpen ? "▼ Hide raw user agent" : "▶ View raw user agent string"}
        </button>

        {uaOpen && (
          <div className="mt-2 space-y-2 rounded-xl bg-zinc-50 border border-zinc-200 p-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                User-Agent String
              </span>
              <button
                onClick={handleCopyUA}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Copy
              </button>
            </div>
            <pre className="text-xs text-zinc-800 font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
              {env.userAgent}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  ok,
  badge,
  subtext,
}: {
  label: string;
  value: string;
  ok?: boolean;
  badge?: "pwa" | "browser";
  subtext?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-xs">
      <span className="text-zinc-500 shrink-0 font-medium">{label}</span>
      <div className="flex items-center gap-2 text-right">
        {badge && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              badge === "pwa" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {badge === "pwa" ? "Home Screen PWA" : "Browser Tab"}
          </span>
        )}
        {ok !== undefined && <span className="text-xs">{ok ? "✅" : "❌"}</span>}
        <div>
          <span className="font-mono text-zinc-900 text-[12px]">{value}</span>
          {subtext && <div className="text-[10px] text-zinc-400 font-sans">{subtext}</div>}
        </div>
      </div>
    </div>
  );
}
