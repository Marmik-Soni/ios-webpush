"use client";

import { useState, useEffect } from "react";
import { getStored, setStored } from "@/lib/push-client";
import { toast } from "sonner";

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

  const handleClear = () => {
    setModel("");
    setIosVersion("");
    setNotes("");
    save("manual.model", "");
    save("manual.iosVersion", "");
    save("manual.notes", "");
    toast.success("Manual fields cleared");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Device Overrides & Notes
        </span>
        {(model || iosVersion || notes) && (
          <button
            onClick={handleClear}
            className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        Persisted in device localStorage. Included when you copy the diagnostic report.
      </p>

      <div className="space-y-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Actual Device Model</span>
          <input
            type="text"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              save("manual.model", e.target.value);
            }}
            placeholder="e.g. iPhone 15 Pro, iPad Air M2"
            className="rounded-xl border border-zinc-200 bg-white text-zinc-900 px-3.5 py-2.5 text-[16px] shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none placeholder:text-zinc-400"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">
            Actual iOS Version (Settings → General → About)
          </span>
          <input
            type="text"
            value={iosVersion}
            onChange={(e) => {
              setIosVersion(e.target.value);
              save("manual.iosVersion", e.target.value);
            }}
            placeholder="e.g. 18.4.1"
            className="rounded-xl border border-zinc-200 bg-white text-zinc-900 px-3.5 py-2.5 text-[16px] shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none placeholder:text-zinc-400"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-zinc-700">Tester Notes & Observations</span>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              save("manual.notes", e.target.value);
            }}
            rows={2}
            placeholder="e.g. Background push received while on Wi-Fi within 2 seconds…"
            className="rounded-xl border border-zinc-200 bg-white text-zinc-900 px-3.5 py-2.5 text-[16px] shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none placeholder:text-zinc-400 resize-y"
          />
        </label>
      </div>
    </div>
  );
}
