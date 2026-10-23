"use client";

import type { LogLine } from "./PushLab";
import { toast } from "sonner";

export default function PageLog({ entries }: { entries: LogLine[] }) {
  const handleCopyLog = async () => {
    if (entries.length === 0) return;
    const text = entries
      .map((e) => `[${new Date(e.ts).toLocaleTimeString()}] ${e.text}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Page log copied to clipboard");
    } catch {
      window.prompt("Copy:", text);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Client Activity Trace ({entries.length})
        </span>
        {entries.length > 0 && (
          <button
            onClick={handleCopyLog}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium select-none"
          >
            Copy log
          </button>
        )}
      </div>

      <div className="rounded-xl bg-zinc-950 text-zinc-200 border border-zinc-800 p-3 max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed shadow-inner">
        {entries.length === 0 ? (
          <span className="text-zinc-500 italic">No activity entries yet.</span>
        ) : (
          entries.map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-zinc-500 shrink-0 select-none">
                {new Date(line.ts).toLocaleTimeString()}
              </span>
              <span
                className={
                  line.text.startsWith("✖")
                    ? "text-red-400 font-medium"
                    : line.text.startsWith("✔")
                      ? "text-emerald-400 font-medium"
                      : line.text.startsWith("▶")
                        ? "text-sky-300 font-medium"
                        : "text-zinc-300"
                }
              >
                {line.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
