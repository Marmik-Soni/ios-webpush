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
import DeliveryLog from "./DeliveryLog";
import PageLog from "./PageLog";
import SendPush from "./SendPush";

export interface LogLine {
  ts: number;
  text: string;
}

export type ActiveTab = "send" | "diagnostics" | "logs";

export default function PushLab() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("send");
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
        toast.success("Subscribed to Web Push! (Classic)");
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

  const handleCopyReport = async () => {
    const report = {
      device: {
        userAgent: env?.userAgent,
        platform: env?.platform,
        isAppleMobile: apple,
        context: ctx,
        iosVersion: iosVer,
        model: model,
        manual: {
          model: getStored("manual.model"),
          iosVersion: getStored("manual.iosVersion"),
          notes: getStored("manual.notes"),
        },
      },
      capabilities: {
        isSecureContext: env?.isSecureContext,
        serviceWorker: "serviceWorker" in navigator,
        PushManager: "PushManager" in window,
        Notification: typeof Notification !== "undefined",
        notificationPermission:
          typeof Notification !== "undefined" ? Notification.permission : "unavailable",
        windowPushManager: typeof window !== "undefined" && !!window.pushManager,
        setAppBadge: typeof navigator !== "undefined" && !!navigator.setAppBadge,
        navigatorStandalone: env?.navigatorStandalone,
        displayModeStandalone: env?.displayModeStandalone,
      },
      sw: { version: swVersion, state: swState, scope: swScope, scriptURL: swScriptURL },
      permission,
      subscription: subscription
        ? {
            endpointHost: new URL(subscription.endpoint).hostname,
            vapidKeyMatch:
              getStored("vapidKeyUsed") === (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""),
          }
        : null,
      swLog: swLog.slice(0, 50),
      pageLog: pageLog.slice(0, 100).map((l) => l.text),
      generatedAt: new Date().toISOString(),
    };
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      log("✔ Report copied to clipboard");
      toast.success("Diagnostic report copied to clipboard");
    } catch {
      log("✖ Clipboard failed — see page log");
      toast.error("Clipboard copy failed");
    }
  };

  if (!env) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm font-medium text-zinc-500">Detecting device environment…</p>
        </div>
      </main>
    );
  }

  const isStandalone = ctx === "Standalone (Home Screen)";
  const isSubscribed = !!subscription;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-5 flex flex-col gap-5">
      {/* App Header */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
              <span className="text-xl">🔔</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
                Push Lab
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200/50">
                  iOS Web Push
                </span>
              </h1>
              <p className="text-xs text-zinc-500">
                {model?.candidates[0] ?? "Device"} · iOS {iosVer?.value ?? "16.4+"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 active:scale-95 transition-all select-none"
            >
              <span>📋</span>
              <span>Report</span>
            </button>
          </div>
        </div>

        {/* Live Status Strip */}
        <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-white border border-zinc-200/80 p-2 shadow-2xs text-center">
          <div className="flex flex-col items-center justify-center py-1">
            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
              Mode
            </span>
            <span
              className={`text-xs font-bold ${
                isStandalone ? "text-emerald-600" : "text-amber-600"
              }`}
            >
              {isStandalone ? "PWA" : "Browser"}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-1 border-l border-zinc-100">
            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
              Perm
            </span>
            <span
              className={`text-xs font-bold ${
                permission === "granted"
                  ? "text-emerald-600"
                  : permission === "denied"
                    ? "text-red-600"
                    : "text-zinc-500"
              }`}
            >
              {permission}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-1 border-l border-zinc-100">
            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
              Worker
            </span>
            <span
              className={`text-xs font-bold ${
                swState === "activated" ? "text-emerald-600" : "text-zinc-600"
              }`}
            >
              {swState === "activated" ? (swVersion ?? "active") : swState}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center py-1 border-l border-zinc-100">
            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
              Push
            </span>
            <span
              className={`text-xs font-bold ${isSubscribed ? "text-emerald-600" : "text-zinc-400"}`}
            >
              {isSubscribed ? "Active" : "None"}
            </span>
          </div>
        </div>
      </header>

      {/* Segmented iOS Tabs */}
      <nav className="flex rounded-xl bg-zinc-200/70 p-1 shadow-inner select-none">
        <button
          onClick={() => setActiveTab("send")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
            activeTab === "send"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          ⚡ Send & Test
        </button>

        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
            activeTab === "diagnostics"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          📊 Diagnostics
        </button>

        <button
          onClick={() => setActiveTab("logs")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all relative ${
            activeTab === "logs"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          📋 Logs
          {swLog.length > 0 && (
            <span className="ml-1.5 rounded-full bg-indigo-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
              {swLog.length}
            </span>
          )}
        </button>
      </nav>

      {/* TAB 1: Send & Test */}
      {activeTab === "send" && (
        <div className="flex flex-col gap-5 animate-in fade-in duration-150">
          {/* Subscription State Card */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-900">Subscription Status</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  isSubscribed ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {isSubscribed ? "● Subscribed" : "○ Not Subscribed"}
              </span>
            </div>

            <SubscriptionSection subscription={subscription} permission={permission} />

            {/* Quick Subscription Actions */}
            <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100">
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
          </div>

          {/* Send Test Push Form */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs flex flex-col gap-3">
            <h2 className="text-sm font-bold text-zinc-900">Send Test Push</h2>
            <SendPush
              subscription={subscription}
              model={model}
              iosVer={iosVer}
              ctx={ctx}
              log={log}
              running={running}
              setRunning={setRunning}
            />
          </div>

          {/* Local Native Hardware Tests */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs flex flex-col gap-3">
            <h2 className="text-sm font-bold text-zinc-900">Hardware & OS Tests</h2>
            <p className="text-xs text-zinc-500">
              Verify local notification permissions and native app icon badges without invoking
              network APNs.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <Btn label="Local Alert" running={running} onClick={handleLocalNotification} />
              <Btn label="Set Badge (3)" running={running} onClick={() => handleSetBadge(3)} />
              <Btn label="Clear Badge" running={running} onClick={handleClearBadge} />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Diagnostics */}
      {activeTab === "diagnostics" && (
        <div className="flex flex-col gap-5 animate-in fade-in duration-150">
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs flex flex-col gap-3">
            <h2 className="text-sm font-bold text-zinc-900">System Environment</h2>
            <EnvironmentSection env={env} apple={apple} ctx={ctx} iosVer={iosVer} model={model} />
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs flex flex-col gap-3">
            <h2 className="text-sm font-bold text-zinc-900">API Capability Matrix</h2>
            <CapabilityMatrix env={env} apple={apple} ctx={ctx} />
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs flex flex-col gap-3">
            <h2 className="text-sm font-bold text-zinc-900">Device Overrides</h2>
            <ManualFields />
          </div>
        </div>
      )}

      {/* TAB 3: Logs */}
      {activeTab === "logs" && (
        <div className="flex flex-col gap-5 animate-in fade-in duration-150">
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs flex flex-col gap-3">
            <DeliveryLog
              entries={swLog}
              onRefresh={refreshSwLog}
              onClear={async () => {
                await clearSwLog();
                setSwLog([]);
              }}
            />
          </div>

          <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs flex flex-col gap-3">
            <PageLog entries={pageLog} />
          </div>

          {/* Service Worker Lifecycle & Maintenance */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs flex flex-col gap-3">
            <h2 className="text-sm font-bold text-zinc-900">Worker Lifecycle & Maintenance</h2>
            <label className="flex items-center gap-2.5 text-xs font-medium text-zinc-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRegister}
                onChange={toggleAutoRegister}
                className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
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
          </div>
        </div>
      )}
    </main>
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
    "min-h-[44px] rounded-xl px-3 py-2 text-xs font-semibold transition-all active:scale-[0.98] select-none shadow-2xs flex items-center justify-center text-center";
  const colors =
    variant === "danger"
      ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
      : primary
        ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100"
        : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200 border border-zinc-200/60";

  return (
    <button onClick={onClick} disabled={isRunning} className={`${base} ${colors}`}>
      {isRunning ? "running…" : label}
    </button>
  );
}
