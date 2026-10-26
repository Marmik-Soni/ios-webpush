"use client";

import { useState, useCallback } from "react";
import { getStored } from "@/lib/push-client";
import { toast } from "sonner";
import AppleLogo from "./AppleLogo";

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
      toast.success(`Copied ${label} to clipboard`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy:", text);
    }
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden bg-white shadow-2xs">
        <Row
          label="Permission"
          value={permission}
          highlight={
            permission === "granted" ? "success" : permission === "denied" ? "danger" : "normal"
          }
        />
        {permission === "denied" && (
          <div className="p-3 bg-red-50 text-xs text-red-700">
            Permission denied. Re-enable in iOS Settings → Notifications → Push Lab.
          </div>
        )}

        {subscription ? (
          <>
            <Row
              label="Endpoint Host"
              value={
                <span className="inline-flex items-center gap-1.5 justify-end">
                  {isApple && (
                    <AppleLogo className="h-3.5 w-3.5 fill-current text-zinc-900 inline shrink-0" />
                  )}
                  <span>{endpointHost ?? "unknown"}</span>
                </span>
              }
              highlight={isApple ? "success" : "normal"}
            />
            {keysMatch !== null && (
              <Row
                label="VAPID Key Match"
                value={keysMatch ? "Matches" : "Mismatch — resubscribe"}
                highlight={keysMatch ? "success" : "danger"}
              />
            )}
          </>
        ) : (
          <div className="p-3 text-xs text-zinc-500 italic bg-zinc-50/50">
            No active subscription. Use &ldquo;Subscribe&rdquo; above to create one.
          </div>
        )}
      </div>

      {subscription && (
        <div className="flex gap-2">
          <SmallBtn
            label="Copy Endpoint"
            active={copied === "endpoint"}
            onClick={() => copyText("endpoint", subscription.endpoint)}
          />
          <SmallBtn
            label="Copy Full JSON"
            active={copied === "json"}
            onClick={() => copyText("json", JSON.stringify(subscription.toJSON(), null, 2))}
          />
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  highlight = "normal",
}: {
  label: string;
  value: React.ReactNode;
  highlight?: "normal" | "success" | "danger";
}) {
  const colorClass =
    highlight === "success"
      ? "text-emerald-700 font-semibold"
      : highlight === "danger"
        ? "text-red-700 font-semibold"
        : "text-zinc-900";

  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-xs">
      <span className="text-zinc-500 shrink-0 font-medium">{label}</span>
      <span className={`text-right font-mono text-[13px] ${colorClass}`}>{value}</span>
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
      className="flex-1 min-h-[40px] rounded-xl px-3 py-2 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200 shadow-2xs active:scale-[0.98] transition-colors select-none"
    >
      {active ? "✔ Copied!" : label}
    </button>
  );
}
