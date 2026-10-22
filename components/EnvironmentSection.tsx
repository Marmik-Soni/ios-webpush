"use client";

import type { EnvironmentInfo, ModelResult } from "@/lib/device";
import { useState } from "react";

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

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Environment</h2>

      <Row label="Context" value={ctx} />
      <Row
        label="Platform"
        value={
          apple
            ? /iPad/.test(env.userAgent) || (env.platform === "MacIntel" && env.maxTouchPoints > 1)
              ? "iPad"
              : "iPhone"
            : env.platform
        }
      />
      <Row label="iOS version" value={iosVer ? `${iosVer.value} (${iosVer.source})` : "n/a"} />
      <Row
        label="Model"
        value={
          model
            ? model.candidates.length > 0
              ? `${model.candidates.join(" / ")} (${model.confidence})`
              : `Unknown (${model.key})`
            : "detecting…"
        }
      />
      <Row
        label="Screen"
        value={`${env.screenWidth}×${env.screenHeight} @${env.devicePixelRatio}x`}
      />
      <Row label="Viewport" value={`${env.innerWidth}×${env.innerHeight}`} />
      <Row label="Secure context" value={env.isSecureContext ? "✅ yes" : "❌ no"} />
      <Row
        label="navigator.standalone"
        value={
          env.navigatorStandalone === undefined ? "undefined" : String(env.navigatorStandalone)
        }
      />
      <Row
        label="display-mode: standalone"
        value={env.displayModeStandalone ? "✅ yes" : "❌ no"}
      />
      {model && model.confidence !== "unique" && (
        <p className="text-xs text-zinc-500">
          Hint: Display Zoom changes screen dimensions. The model table is best-effort.
        </p>
      )}

      <button
        onClick={() => setUaOpen(!uaOpen)}
        className="text-left text-sm text-zinc-600 hover:text-zinc-900 underline underline-offset-2 transition-colors"
      >
        {uaOpen ? "Hide" : "Show"} user agent
      </button>
      {uaOpen && (
        <pre className="text-xs bg-zinc-100 border border-zinc-200 text-zinc-800 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
          {env.userAgent}
        </pre>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className="text-right font-mono text-zinc-900">{value}</span>
    </div>
  );
}
