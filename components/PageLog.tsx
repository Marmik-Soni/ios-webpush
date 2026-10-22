"use client";

import type { LogLine } from "./PushLab";

export default function PageLog({ entries }: { entries: LogLine[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Page Log</h2>
      <div className="rounded-lg bg-zinc-900 dark:bg-zinc-950 text-zinc-200 p-3 max-h-64 overflow-y-auto font-mono text-xs leading-relaxed">
        {entries.length === 0 ? (
          <span className="text-zinc-500 italic">No log entries yet.</span>
        ) : (
          entries.map((line, i) => (
            <div key={i}>
              <span className="text-zinc-500">{new Date(line.ts).toLocaleTimeString()}</span>{" "}
              {line.text}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
