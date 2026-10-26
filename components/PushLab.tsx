"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { EnvironmentInfo, ModelResult } from "@/lib/device";
import {
  readEnvironment,
  isAppleMobile,
  context,
  iosVersionFromUA,
  modelCandidates,
} from "@/lib/device";
import {
  registerServiceWorker,
  unregisterServiceWorkers,
  getSubscription,
  subscribeClassic,
  subscribeDeclarative,
  unsubscribe,
  showLocalNotification,
  setBadge,
  clearBadge,
  getStored,
  setStored,
  clearAllStored,
} from "@/lib/push-client";
import { readSwLog, clearSwLog } from "@/lib/sw-log";
import type { SwLogEntry } from "@/lib/sw-log";
import { toast } from "sonner";
import EnvironmentSection from "./EnvironmentSection";
import CapabilityMatrix from "./CapabilityMatrix";
import ManualFields from "./ManualFields";
import SubscriptionSection from "./SubscriptionSection";
import SendPush from "./SendPush";
import { Apple, Share, PlusSquare } from "react-bootstrap-icons";

export interface LogLine {
  ts: number;
  text: string;
}

export type Mode = "simple" | "advanced";

export default function PushLab() {
  const [mode, setMode] = useState<Mode>("simple");
  const [env, setEnv] = useState<EnvironmentInfo | null>(null);
  const [apple, setApple] = useState(false);
  const [ctx, setCtx] = useState<string>("detecting…");
  const [iosVer, setIosVer] = useState<{ value: string; source: string } | null>(null);
  const [model, setModel] = useState<ModelResult | null>(null);

  // SW state
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  const [swVersion, setSwVersion] = useState<string | null>(null);
  const [swState, setSwState] = useState<string>("not registered");
  const [swScope, setSwScope] = useState<string | null>(null);
  const [swScriptURL, setSwScriptURL] = useState<string | null>(null);
  const [autoRegister, setAutoRegister] = useState(true);

  // Subscription
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [permission, setPermission] = useState<string>("default");

  // Logs
  const [swLog, setSwLog] = useState<SwLogEntry[]>([]);
  const [pageLog, setPageLog] = useState<LogLine[]>([]);

  // Running state for buttons
  const [running, setRunning] = useState<string | null>(null);

  // Page log helper
  const log = useCallback((text: string) => {
    setPageLog((prev) => {
      const next = [{ ts: Date.now(), text }, ...prev];
      return next.slice(0, 200);
    });
  }, []);

  // Refresh helpers
  const refreshSubscription = useCallback(async () => {
    const res = await getSubscription();
    if (res.ok) setSubscription(res.data);
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
  }, []);

  const refreshSwLog = useCallback(async () => {
    const entries = await readSwLog();
    setSwLog(entries);
  }, []);

  const refreshSwState = useCallback(() => {
    const reg = swRegRef.current;
    if (!reg) {
      setSwState("not registered");
      setSwScope(null);
      setSwScriptURL(null);
      return;
    }
    setSwScope(reg.scope);
    const sw = reg.active ?? reg.waiting ?? reg.installing;
    setSwState(sw?.state ?? "unknown");
    setSwScriptURL(sw?.scriptURL ?? null);
  }, []);

  const querySWVersion = useCallback(async () => {
    const reg = swRegRef.current;
    const sw = reg?.active;
    if (!sw) return;
    try {
      const mc = new MessageChannel();
      const p = new Promise<string>((resolve) => {
        mc.port1.onmessage = (e) => {
          const data = e.data as { version?: string };
          resolve(data.version ?? "unknown");
        };
        setTimeout(() => resolve("timeout"), 2000);
      });
      sw.postMessage({ type: "GET_VERSION" }, [mc.port2]);
      const version = await p;
      setSwVersion(version);
    } catch {
      setSwVersion("error");
    }
  }, []);

  // Init
  useEffect(() => {
    const e = readEnvironment();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate browser-only APIs after SSR
    setEnv(e);
    setApple(isAppleMobile());
    setCtx(context());
    if (isAppleMobile()) {
      setIosVer(iosVersionFromUA(e.userAgent));
    }
    setModel(modelCandidates(e.screenWidth, e.screenHeight, e.devicePixelRatio));

    // Restore preferences
    const storedAuto = getStored("autoRegister");
    if (storedAuto !== null) setAutoRegister(storedAuto !== "false");

    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }

    refreshSubscription();
    refreshSwLog();
  }, [refreshSubscription, refreshSwLog]);

  // Auto-register SW
  useEffect(() => {
    if (!autoRegister) return;
    (async () => {
      const res = await registerServiceWorker();
      if (res.ok) {
        swRegRef.current = res.data;
        refreshSwState();
        await querySWVersion();
        log("✔ Service worker registered");
      } else {
        log(`✖ SW register: ${res.error.message}`);
      }
    })();
  }, [autoRegister, log, refreshSwState, querySWVersion]);

  // Listen for SW messages
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === "sw-event") {
        refreshSwLog();
        refreshSubscription();
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [refreshSwLog, refreshSubscription]);

  // Refresh on visibility change and interval
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        refreshSwLog();
        refreshSubscription();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshSwLog();
      }
    }, 5000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(interval);
    };
  }, [refreshSwLog, refreshSubscription]);

  // Action runners with Sonner feedback
  const runAction = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      setRunning(name);
      log(`▶ ${name}`);
      try {
        await fn();
      } catch (e: unknown) {
        const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        log(`✖ ${name}: ${msg}`);
        toast.error(`${name} failed`, { description: msg });
      } finally {
        setRunning(null);
      }
    },
    [log],
  );

  const handleRegisterSW = () =>
    runAction("Register service worker", async () => {
      const res = await registerServiceWorker();
      if (res.ok) {
        swRegRef.current = res.data;
        refreshSwState();
        await querySWVersion();
        log("✔ Registered");
        toast.success("Service Worker registered");
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
        toast.error("Service Worker registration failed", { description: res.error.message });
      }
    });

  const handleClassicSubscribe = () =>
    runAction("Subscribe (classic)", async () => {
      let reg = swRegRef.current;
      if (!reg) {
        const regRes = await registerServiceWorker();
        if (!regRes.ok) {
          log(`✖ SW register: ${regRes.error.message}`);
          toast.error("Cannot subscribe", {
            description: `SW register error: ${regRes.error.message}`,
          });
          return;
        }
        reg = regRes.data;
        swRegRef.current = reg;
        refreshSwState();
      }
      const res = await subscribeClassic(reg, log);
      if (res.ok) {
        setSubscription(res.data);
        setPermission(Notification.permission);
        log("✔ Subscribed (classic)");
        toast.success("Subscribed to Web Push!");
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
        toast.error("Push subscription failed", {
          description: `${res.error.name}: ${res.error.message}`,
        });
      }
    });

  const handleDeclarativeSubscribe = () =>
    runAction("Subscribe (declarative)", async () => {
      const res = await subscribeDeclarative(log);
      if (res.ok) {
        setSubscription(res.data);
        if (typeof Notification !== "undefined") {
          setPermission(Notification.permission);
        }
        log("✔ Subscribed (declarative/window.pushManager)");
        toast.success("Subscribed via window.pushManager!");
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
        toast.error("Declarative subscription failed", {
          description: `${res.error.name}: ${res.error.message}`,
        });
      }
    });

  const handleLocalNotification = () =>
    runAction("Show local notification", async () => {
      const res = await showLocalNotification();
      if (res.ok) {
        log("✔ Local notification shown");
        toast.success("Local notification triggered");
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
        toast.error("Local notification error", { description: res.error.message });
      }
    });

  const handleSetBadge = (val = 3) =>
    runAction(`Set badge ${val}`, async () => {
      const res = await setBadge(val);
      if (res.ok) {
        log(`✔ Badge set to ${val}`);
        toast.success(`Home Screen badge set to ${val}`);
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
        toast.error("Failed to set badge", { description: res.error.message });
      }
    });

  const handleClearBadge = () =>
    runAction("Clear badge", async () => {
      const res = await clearBadge();
      if (res.ok) {
        log("✔ Badge cleared");
        toast.success("Home Screen badge cleared");
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
        toast.error("Failed to clear badge", { description: res.error.message });
      }
    });

  const handleUnsubscribe = () =>
    runAction("Unsubscribe", async () => {
      const res = await unsubscribe();
      if (res.ok) {
        setSubscription(null);
        log("✔ Unsubscribed");
        toast.success("Push subscription deleted");
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
        toast.error("Unsubscribe failed", { description: res.error.message });
      }
    });

  const handleUnregisterSW = () =>
    runAction("Unregister service worker", async () => {
      const res = await unregisterServiceWorkers();
      if (res.ok) {
        swRegRef.current = null;
        setSwVersion(null);
        setSwState("not registered");
        setSwScope(null);
        setSwScriptURL(null);
        log("✔ Unregistered");
        toast.success("Service Worker unregistered");
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
        toast.error("Unregister SW failed", { description: res.error.message });
      }
    });

  const handleClearLogs = () =>
    runAction("Clear logs", async () => {
      await clearSwLog();
      setSwLog([]);
      setPageLog([]);
      log("✔ Logs cleared");
      toast.success("All logs cleared");
    });

  const handleReset = () =>
    runAction("Reset everything", async () => {
      await unsubscribe();
      await unregisterServiceWorkers();
      await clearSwLog();
      clearAllStored();
      swRegRef.current = null;
      setSubscription(null);
      setSwVersion(null);
      setSwState("not registered");
      setSwScope(null);
      setSwScriptURL(null);
      setSwLog([]);
      setPageLog([]);
      setAutoRegister(true);
      log("✔ Reset complete");
      toast.success("Push Lab reset to clean state");
    });

  const toggleAutoRegister = () => {
    const next = !autoRegister;
    setAutoRegister(next);
    setStored("autoRegister", String(next));
    log(`Auto-register SW: ${next ? "on" : "off"}`);
    toast.info(`Auto-register SW turned ${next ? "on" : "off"}`);
  };

  const handleCopyLog = async () => {
    const swLines = swLog.map(
      (e) => `[${new Date(e.ts).toLocaleTimeString()}] [SW:${e.type}] ${JSON.stringify(e.detail)}`,
    );
    const pageLines = pageLog.map((l) => `[${new Date(l.ts).toLocaleTimeString()}] ${l.text}`);
    const text = [...swLines, ...pageLines].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      log("✔ Log copied to clipboard");
      toast.success("Log copied to clipboard");
    } catch {
      toast.error("Clipboard copy failed");
    }
  };

  if (!env) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-800 border-t-transparent" />
          <p className="text-sm text-zinc-500">Detecting environment…</p>
        </div>
      </main>
    );
  }

  const isStandalone = ctx === "Standalone (Home Screen)";
  const isSubscribed = !!subscription;
  // Show iOS "Add to Home Screen" callout only in Simple mode, on iOS, in browser tab
  const showIosCallout = mode === "simple" && apple && !isStandalone;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6 flex flex-col gap-5">
      {/* ── Header ── */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Push Lab</h1>
          <p className="text-xs text-zinc-400 mt-0.5">iOS Web Push tester</p>
        </div>

        {/* Mode toggle */}
        <button
          onClick={() => setMode(mode === "simple" ? "advanced" : "simple")}
          className="text-sm font-medium text-zinc-400 hover:text-zinc-700 transition-colors select-none"
        >
          {mode === "simple" ? "Advanced →" : "← Simple"}
        </button>
      </header>

      {/* ── Status strip ── */}
      <div className="grid grid-cols-4 gap-px rounded-2xl border border-zinc-200 bg-zinc-100 overflow-hidden text-center shadow-xs">
        <StatusCell label="Mode" value={isStandalone ? "PWA" : "Browser"} ok={isStandalone} />
        <StatusCell
          label="Perm"
          value={permission}
          ok={permission === "granted"}
          bad={permission === "denied"}
        />
        <StatusCell
          label="Worker"
          value={swState === "activated" ? (swVersion ?? "active") : swState}
          ok={swState === "activated"}
        />
        <StatusCell label="Push" value={isSubscribed ? "Active" : "None"} ok={isSubscribed} />
      </div>

      {/* ── iOS Add to Home Screen callout ── */}
      {showIosCallout && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-amber-900">
            Add to Home Screen to enable Web Push
          </p>
          <p className="text-xs text-amber-800 leading-relaxed">
            iOS Web Push only works when the app is installed as a PWA. Follow these steps in
            Safari:
          </p>
          <ol className="flex flex-col gap-2">
            <li className="flex items-start gap-2.5 text-xs text-amber-900">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-bold text-[11px]">
                1
              </span>
              <span>
                Tap the{" "}
                <span className="inline-flex items-center gap-0.5 font-semibold">
                  Share
                  <Share className="inline h-3.5 w-3.5 ml-0.5" />
                </span>{" "}
                button in the Safari toolbar (bottom centre on iPhone).
              </span>
            </li>
            <li className="flex items-start gap-2.5 text-xs text-amber-900">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-bold text-[11px]">
                2
              </span>
              <span>
                Scroll down and tap{" "}
                <span className="inline-flex items-center gap-0.5 font-semibold">
                  Add to Home Screen
                  <PlusSquare className="inline h-3.5 w-3.5 ml-0.5" />
                </span>
                .
              </span>
            </li>
            <li className="flex items-start gap-2.5 text-xs text-amber-900">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-bold text-[11px]">
                3
              </span>
              <span>
                Tap <span className="font-semibold">Add</span> then open{" "}
                <span className="font-semibold">Push Lab</span> from your Home Screen.
              </span>
            </li>
          </ol>
        </div>
      )}

      {/* ── SIMPLE MODE ── */}
      {mode === "simple" && (
        <div className="flex flex-col gap-4 animate-soft-in">
          {/* Subscribe card */}
          <Section>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Push Subscription</h2>
              {isSubscribed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  Subscribed
                </span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600">
                  Not Subscribed
                </span>
              )}
            </div>

            {isSubscribed ? (
              <div className="flex flex-col gap-3 pt-1">
                {/* APNs & Permission Information Box */}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-2xs">
                        <Apple className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-zinc-900">
                          Apple Push Notification service
                        </span>
                        <span className="text-[11px] text-zinc-500">Registered via Apple APNs</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      Active
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-200/60">
                    <span className="text-zinc-500">Permission</span>
                    <span
                      className={`font-semibold flex items-center gap-1.5 ${
                        permission === "granted"
                          ? "text-emerald-700"
                          : permission === "denied"
                            ? "text-red-600"
                            : "text-zinc-600"
                      }`}
                    >
                      {permission === "granted" && (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      )}
                      {permission === "granted"
                        ? "Permission Granted"
                        : permission === "denied"
                          ? "Permission Denied"
                          : permission}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-zinc-500 leading-relaxed px-0.5">
                  Subscribed via Apple APNs. You can now send test pushes below.
                </p>

                {/* Big Unsubscribe Button */}
                <button
                  onClick={handleUnsubscribe}
                  disabled={running !== null}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/60 hover:bg-red-100/70 text-red-600 hover:text-red-700 text-xs font-semibold active:scale-[0.98] transition-all duration-150 disabled:opacity-40 select-none shadow-2xs"
                >
                  {running === "Unsubscribe" ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                      Unsubscribing…
                    </span>
                  ) : (
                    "Unsubscribe"
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-center justify-between text-xs py-1">
                  <span className="text-zinc-500">Permission</span>
                  <span
                    className={
                      permission === "granted"
                        ? "text-emerald-700 font-semibold"
                        : permission === "denied"
                          ? "text-red-600 font-semibold"
                          : "text-zinc-600 font-medium"
                    }
                  >
                    {permission === "granted"
                      ? "Permission Granted"
                      : permission === "denied"
                        ? "Permission Denied"
                        : permission}
                  </span>
                </div>

                {permission === "denied" && (
                  <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    Notifications are blocked in iOS settings. Go to Settings → Notifications → Push
                    Lab to allow.
                  </p>
                )}

                <Btn
                  label="Subscribe to Push Notifications"
                  running={running}
                  onClick={handleClassicSubscribe}
                  primary
                />
              </div>
            )}
          </Section>

          {/* Send push card */}
          <Section>
            <SectionHeader title="Send Test Push" />
            <SendPush
              subscription={subscription}
              model={model}
              iosVer={iosVer}
              ctx={ctx}
              log={log}
              running={running}
              setRunning={setRunning}
              simpleMode
            />
          </Section>

          {/* Local tests card */}
          <Section>
            <SectionHeader title="Local Tests" />
            <p className="text-xs text-zinc-400 pb-1">
              Test notification permission and app badge without a network call.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Btn label="Local Alert" running={running} onClick={handleLocalNotification} />
              <Btn label="Badge (3)" running={running} onClick={() => handleSetBadge(3)} />
              <Btn label="Clear Badge" running={running} onClick={handleClearBadge} />
            </div>
          </Section>
        </div>
      )}

      {/* ── ADVANCED MODE ── */}
      {mode === "advanced" && (
        <div className="flex flex-col gap-4 animate-soft-in">
          {/* Subscription */}
          <Section>
            <SectionHeader
              title="Subscription"
              badge={isSubscribed ? "Subscribed" : undefined}
              badgeOk={isSubscribed}
            />
            <SubscriptionSection subscription={subscription} permission={permission} />
            <div className="border-t border-zinc-100 pt-3 flex flex-col gap-2">
              {!isSubscribed ? (
                <div className="grid grid-cols-2 gap-2">
                  <Btn
                    label="Subscribe (Classic)"
                    running={running}
                    onClick={handleClassicSubscribe}
                    primary
                  />
                  <Btn
                    label="Declarative (18.4+)"
                    running={running}
                    onClick={handleDeclarativeSubscribe}
                  />
                </div>
              ) : (
                <div className="flex gap-2">
                  <Btn
                    label="Unsubscribe"
                    running={running}
                    onClick={handleUnsubscribe}
                    variant="danger"
                  />
                  <Btn
                    label="Re-subscribe (Classic)"
                    running={running}
                    onClick={handleClassicSubscribe}
                  />
                </div>
              )}
            </div>
          </Section>

          {/* Send push */}
          <Section>
            <SectionHeader title="Send Test Push" />
            <SendPush
              subscription={subscription}
              model={model}
              iosVer={iosVer}
              ctx={ctx}
              log={log}
              running={running}
              setRunning={setRunning}
            />
          </Section>

          {/* Local tests */}
          <Section>
            <SectionHeader title="Hardware & OS Tests" />
            <p className="text-xs text-zinc-400 pb-1">
              Verify local notification permissions and native app icon badges without invoking
              APNs.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Btn label="Local Alert" running={running} onClick={handleLocalNotification} />
              <Btn label="Set Badge (3)" running={running} onClick={() => handleSetBadge(3)} />
              <Btn label="Clear Badge" running={running} onClick={handleClearBadge} />
            </div>
          </Section>

          {/* Environment */}
          <Section>
            <SectionHeader title="System Environment" />
            <EnvironmentSection env={env} apple={apple} ctx={ctx} iosVer={iosVer} model={model} />
          </Section>

          {/* Capability matrix */}
          <Section>
            <SectionHeader title="API Capabilities" />
            <CapabilityMatrix env={env} apple={apple} ctx={ctx} />
          </Section>

          {/* Device overrides */}
          <Section>
            <SectionHeader title="Device Overrides" />
            <ManualFields />
          </Section>

          {/* SW lifecycle */}
          <Section>
            <SectionHeader title="Service Worker" />
            <label className="flex items-center gap-2.5 text-xs font-medium text-zinc-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRegister}
                onChange={toggleAutoRegister}
                className="h-4 w-4 rounded text-zinc-800 focus:ring-zinc-400"
              />
              Auto-register Service Worker on page load
            </label>

            {(swScope || swScriptURL) && (
              <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-2.5 text-[11px] font-mono text-zinc-600 space-y-1">
                {swScope && <p className="truncate">Scope: {swScope}</p>}
                {swScriptURL && <p className="truncate">Script: {swScriptURL}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Btn label="Register SW" running={running} onClick={handleRegisterSW} />
              <Btn label="Unregister SW" running={running} onClick={handleUnregisterSW} />
              <Btn label="Clear All Logs" running={running} onClick={handleClearLogs} />
              <Btn
                label="Reset Everything"
                running={running}
                onClick={handleReset}
                variant="danger"
              />
            </div>
          </Section>
        </div>
      )}

      {/* ── LOGS (always visible) ── */}
      <Section>
        {/* Log header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-800">Logs</h2>
            {(swLog.length > 0 || pageLog.length > 0) && (
              <span className="rounded-full bg-zinc-100 border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                {swLog.length + pageLog.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLog}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors select-none"
            >
              Copy
            </button>
            <span className="text-zinc-200">|</span>
            <button
              onClick={handleClearLogs}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors select-none"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Combined log output */}
        <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3 max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed">
          {swLog.length === 0 && pageLog.length === 0 ? (
            <span className="text-zinc-500 italic">No log entries yet.</span>
          ) : (
            <>
              {/* SW delivery receipts */}
              {swLog.map((e, i) => (
                <div key={`sw-${i}`} className="flex gap-2 py-0.5">
                  <span className="text-zinc-500 shrink-0">
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>
                  <span className="text-sky-400 shrink-0">[SW:{e.type}]</span>
                  {e.detail.latencyMs !== undefined && (
                    <span className="text-emerald-400 font-semibold">
                      ⚡{e.detail.latencyMs as number}ms
                    </span>
                  )}
                  {typeof e.detail.id === "string" && (
                    <span className="text-zinc-400">{(e.detail.id as string).slice(0, 8)}…</span>
                  )}
                  {e.detail.error !== undefined && (
                    <span className="text-red-400">Err:{String(e.detail.error)}</span>
                  )}
                </div>
              ))}
              {/* Page activity log */}
              {pageLog.map((line, i) => (
                <div key={`pg-${i}`} className="flex gap-2 py-0.5">
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
                            ? "text-amber-300 font-medium"
                            : "text-zinc-300"
                    }
                  >
                    {line.text}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </Section>
    </main>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col gap-3 shadow-xs">
      {children}
    </div>
  );
}

function SectionHeader({
  title,
  badge,
  badgeOk,
}: {
  title: string;
  badge?: string;
  badgeOk?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
      {badge && (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            badgeOk
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200/80"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {badgeOk && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
          )}
          {badge}
        </span>
      )}
    </div>
  );
}

function StatusCell({
  label,
  value,
  ok,
  bad,
}: {
  label: string;
  value: string;
  ok?: boolean;
  bad?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-2.5 bg-white">
      <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
        {label}
      </span>
      <span
        className={`text-xs font-semibold mt-0.5 ${
          ok ? "text-emerald-600" : bad ? "text-red-600" : "text-zinc-500"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Btn({
  label,
  running,
  onClick,
  variant,
  primary,
}: {
  label: string;
  running: string | null;
  onClick: () => void;
  variant?: "danger";
  primary?: boolean;
}) {
  const isRunning = running === label;
  const base =
    "min-h-[44px] rounded-xl px-3 py-2 text-xs font-medium transition-all active:scale-[0.98] select-none flex items-center justify-center text-center border";
  const colors =
    variant === "danger"
      ? "bg-white text-red-600 border-red-200 hover:bg-red-50"
      : primary
        ? "bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800"
        : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50";

  return (
    <button
      onClick={onClick}
      disabled={isRunning || running !== null}
      className={`${base} ${colors} disabled:opacity-40`}
    >
      {isRunning ? "…" : label}
    </button>
  );
}
