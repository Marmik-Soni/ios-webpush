"use client";

import type { SwLogEntry } from "@/lib/sw-log";
import { toast } from "sonner";

export default function DeliveryLog({
  entries,
  onRefresh,
  onClear,
}: {
  entries: SwLogEntry[];
  onRefresh: () => void;
  onClear: () => void;
}) {
  const handleRefresh = () => {
    onRefresh();
    toast.success("Delivery log refreshed");
  };

  const handleClear = () => {
    onClear();
    toast.success("Delivery log cleared");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Push Receipts ({entries.length})
          </span>
          {entries.length > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              Active
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="min-h-[36px] px-3 py-1 text-xs font-medium rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 active:scale-[0.98] transition-colors select-none"
          >
            ↻ Refresh
          </button>
          <button
            onClick={handleClear}
            className="min-h-[36px] px-3 py-1 text-xs font-medium rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 active:scale-[0.98] transition-colors select-none"
          >
            Clear
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">
        Recorded directly by the Service Worker inside IndexedDB. This persists pushes delivered
        while the app was locked or backgrounded.
      </p>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center">
          <p className="text-sm font-medium text-zinc-400">No delivery entries captured yet</p>
          <p className="text-xs text-zinc-400 mt-1">Send a push and lock your phone to test</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden max-h-72 overflow-y-auto bg-white shadow-2xs">
          {entries.map((e, i) => (
            <div
              key={i}
              className="px-3.5 py-2.5 text-xs font-mono flex flex-col gap-1 hover:bg-zinc-50/70 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-zinc-900 bg-zinc-100 px-1.5 py-0.5 rounded text-[11px]">
                  {e.type}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-600 text-[11px]">
                {e.detail.latencyMs !== undefined && (
                  <span className="text-emerald-700 font-semibold">
                    ⚡ {e.detail.latencyMs as number}ms latency
                  </span>
                )}
                {typeof e.detail.id === "string" && (
                  <span className="text-zinc-500">id: {e.detail.id.slice(0, 8)}…</span>
                )}
                {e.detail.error !== undefined && (
                  <span className="text-red-600 font-medium">Err: {String(e.detail.error)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
