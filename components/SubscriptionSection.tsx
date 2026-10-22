"use client";

import { useState, useCallback } from "react";
import { getStored } from "@/lib/push-client";

export default function SubscriptionSection({
  subscription,
  permission,
}: {
  subscription: PushSubscription | null;
  permission: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const vapidKeyUsed = getStored("vapidKeyUsed");
  const currentKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const keysMatch = vapidKeyUsed ? vapidKeyUsed === currentKey : null;

  const endpointHost = subscription ? new URL(subscription.endpoint).hostname : null;
  const isApple = endpointHost?.endsWith("push.apple.com") ?? false;

  const copyText = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // fallback: prompt
      window.prompt("Copy:", text);
    }
  }, []);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Subscription</h2>

      <Row label="Permission" value={permission} />
      {permission === "denied" && (
        <p className="text-xs text-red-500">
          Permission denied. Re-enable in Settings → Notifications → Push Lab.
        </p>
      )}

      {subscription ? (
        <>
          <Row label="Endpoint" value={`${isApple ? "✅ " : ""}${endpointHost ?? "unknown"}`} />
          {keysMatch !== null && (
            <Row
              label="VAPID key match"
              value={keysMatch ? "✅ matches" : "❌ mismatch — resubscribe"}
            />
          )}
          <div className="flex gap-2 mt-1">
            <SmallBtn
              label="Copy endpoint"
              active={copied === "endpoint"}
              onClick={() => copyText("endpoint", subscription.endpoint)}
            />
            <SmallBtn
              label="Copy full JSON"
              active={copied === "json"}
              onClick={() => copyText("json", JSON.stringify(subscription.toJSON(), null, 2))}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-zinc-400">No active subscription.</p>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{label}</span>
      <span className="text-right font-mono">{value}</span>
    </div>
  );
}

function SmallBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="min-h-[44px] rounded-lg px-3 py-2 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 active:scale-[0.98] transition-colors select-none"
    >
      {active ? "Copied!" : label}
    </button>
  );
}
