"use client";

import { useState, useEffect } from "react";
import { getStored, setStored } from "@/lib/push-client";

export default function ManualFields() {
  const [model, setModel] = useState("");
  const [iosVersion, setIosVersion] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after SSR
    setModel(getStored("manual.model") ?? "");
    setIosVersion(getStored("manual.iosVersion") ?? "");
    setNotes(getStored("manual.notes") ?? "");
  }, []);

  const save = (key: string, value: string) => {
    setStored(key, value);
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Manual Fields</h2>
      <p className="text-xs text-zinc-400">
        Persisted in localStorage. Each Home Screen install has separate storage.
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">Actual model</span>
        <input
          type="text"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            save("manual.model", e.target.value);
          }}
          placeholder="e.g. iPhone 15 Pro"
          className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-[16px] placeholder:text-zinc-400"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">
          Actual iOS version (Settings → General → About)
        </span>
        <input
          type="text"
          value={iosVersion}
          onChange={(e) => {
            setIosVersion(e.target.value);
            save("manual.iosVersion", e.target.value);
          }}
          placeholder="e.g. 18.4.1"
          className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-[16px] placeholder:text-zinc-400"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            save("manual.notes", e.target.value);
          }}
          rows={2}
          placeholder="Any extra observations…"
          className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-transparent px-3 py-2 text-[16px] placeholder:text-zinc-400 resize-y"
        />
      </label>
    </section>
  );
}
