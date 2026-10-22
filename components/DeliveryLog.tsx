"use client";

import type { SwLogEntry } from "@/lib/sw-log";

export default function DeliveryLog({
  entries,
  onRefresh,
  onClear,
}: {
  entries: SwLogEntry[];
  onRefresh: () => void;
  onClear: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Delivery Log</h2>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="min-h-[44px] px-3 py-1 text-xs font-medium rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 active:scale-[0.98] transition-colors select-none"
          >
            Refresh
          </button>
          <button
            onClick={onClear}
            className="min-h-[44px] px-3 py-1 text-xs font-medium rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 active:scale-[0.98] transition-colors select-none"
          >
            Clear
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Written by the service worker, so it also records pushes that arrived while the app was
        locked or in the background.
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">No entries yet.</p>
      ) : (
        <div className="rounded-lg border border-zinc-200 divide-y divide-zinc-200 overflow-hidden max-h-64 overflow-y-auto bg-zinc-50/50">
          {entries.map((e, i) => (
            <div key={i} className="px-3 py-2 text-xs font-mono">
              <span className="text-zinc-500">{new Date(e.ts).toLocaleTimeString()}</span>{" "}
              <span className="font-semibold text-zinc-800">{e.type}</span>
              {e.detail.latencyMs !== undefined && (
                <span className="text-zinc-600"> ({e.detail.latencyMs as number}ms)</span>
              )}
              {typeof e.detail.id === "string" && (
                <span className="text-zinc-500"> id:{e.detail.id.slice(0, 8)}</span>
              )}
              {e.detail.error !== undefined && (
                <span className="text-red-600"> {String(e.detail.error)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
