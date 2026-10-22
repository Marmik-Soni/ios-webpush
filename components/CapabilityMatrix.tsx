"use client";

import type { EnvironmentInfo } from "@/lib/device";

export default function CapabilityMatrix({
  env,
  apple,
  ctx,
}: {
  env: EnvironmentInfo;
  apple: boolean;
  ctx: string;
}) {
  const hasSW = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const hasPushManager = typeof window !== "undefined" && "PushManager" in window;
  const hasNotification = typeof Notification !== "undefined";
  const hasWindowPushManager = typeof window !== "undefined" && !!window.pushManager;
  const hasSetAppBadge = typeof navigator !== "undefined" && !!navigator.setAppBadge;

  const rows: { label: string; ok: boolean; raw: string }[] = [
    { label: "isSecureContext", ok: env.isSecureContext, raw: String(env.isSecureContext) },
    { label: "serviceWorker", ok: hasSW, raw: String(hasSW) },
    { label: "PushManager", ok: hasPushManager, raw: String(hasPushManager) },
    {
      label: "Notification",
      ok: hasNotification,
      raw: hasNotification ? `${Notification.permission}` : "unavailable",
    },
    {
      label: "window.pushManager (declarative)",
      ok: hasWindowPushManager,
      raw: String(hasWindowPushManager),
    },
    { label: "navigator.setAppBadge", ok: hasSetAppBadge, raw: String(hasSetAppBadge) },
    {
      label: "navigator.standalone",
      ok: env.navigatorStandalone === true,
      raw: env.navigatorStandalone === undefined ? "undefined" : String(env.navigatorStandalone),
    },
    {
      label: "display-mode: standalone",
      ok: env.displayModeStandalone,
      raw: String(env.displayModeStandalone),
    },
  ];

  const isBrowserTab = ctx === "Browser tab";

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Capability Matrix</h2>
      <div className="rounded-lg border border-zinc-200 divide-y divide-zinc-200 overflow-hidden bg-white">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="text-zinc-700">{r.label}</span>
            <span className="font-mono text-xs shrink-0">
              {r.ok ? "✅" : "❌"} {r.raw}
            </span>
          </div>
        ))}
      </div>

      {apple && isBrowserTab && (
        <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <p className="font-medium">Push requires a Home Screen install</p>
          <ol className="mt-1.5 ml-4 list-decimal space-y-0.5 text-xs">
            <li>Tap the Share button in Safari</li>
            <li>Choose &ldquo;Add to Home Screen&rdquo;</li>
            <li>Keep &ldquo;Open as Web App&rdquo; on (iOS 26+)</li>
            <li>Open the app from the Home Screen icon</li>
          </ol>
        </div>
      )}
    </section>
  );
}
