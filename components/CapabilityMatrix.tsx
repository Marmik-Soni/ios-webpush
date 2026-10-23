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

  const rows: { label: string; description: string; ok: boolean; raw: string }[] = [
    {
      label: "isSecureContext",
      description: "Push APIs strictly require HTTPS / localhost",
      ok: env.isSecureContext,
      raw: String(env.isSecureContext),
    },
    {
      label: "serviceWorker",
      description: "Background worker script handling push events",
      ok: hasSW,
      raw: String(hasSW),
    },
    {
      label: "PushManager",
      description: "SW pushManager for classic subscription registration",
      ok: hasPushManager,
      raw: String(hasPushManager),
    },
    {
      label: "Notification",
      description: "Permission API for user notification prompt",
      ok: hasNotification,
      raw: hasNotification ? `${Notification.permission}` : "unavailable",
    },
    {
      label: "window.pushManager",
      description: "Declarative push subscription (iOS 18.4+)",
      ok: hasWindowPushManager,
      raw: String(hasWindowPushManager),
    },
    {
      label: "navigator.setAppBadge",
      description: "Native numeric badge count on home screen icon",
      ok: hasSetAppBadge,
      raw: String(hasSetAppBadge),
    },
    {
      label: "navigator.standalone",
      description: "Legacy iOS Safari PWA standalone indicator",
      ok: env.navigatorStandalone === true,
      raw: env.navigatorStandalone === undefined ? "undefined" : String(env.navigatorStandalone),
    },
    {
      label: "display-mode: standalone",
      description: "Standard CSS media query for installed PWA",
      ok: env.displayModeStandalone,
      raw: String(env.displayModeStandalone),
    },
  ];

  const isBrowserTab = ctx === "Browser tab";

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden bg-white shadow-2xs">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
          >
            <div className="flex flex-col">
              <span className="font-mono font-medium text-zinc-900">{r.label}</span>
              <span className="text-[11px] text-zinc-500 font-sans">{r.description}</span>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold flex items-center gap-1 ${
                r.ok
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              <span>{r.ok ? "✔" : "✖"}</span>
              <span>{r.raw}</span>
            </span>
          </div>
        ))}
      </div>

      {apple && isBrowserTab && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2 font-semibold text-sm text-amber-950">
            <span>📲</span>
            <span>Web Push requires Home Screen installation on iOS</span>
          </div>
          <p className="mt-1 text-amber-800 leading-relaxed">
            Safari running as a regular browser tab cannot receive Web Push notifications on iOS.
          </p>
          <ol className="mt-2.5 ml-4 list-decimal space-y-1 text-amber-900 font-medium">
            <li>
              Tap the <strong>Share</strong> button (box with upward arrow) in Safari.
            </li>
            <li>
              Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
            </li>
            <li>
              Confirm and open <strong>Push Lab</strong> from your Home Screen icon.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
