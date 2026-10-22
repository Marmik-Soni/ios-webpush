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
import EnvironmentSection from "./EnvironmentSection";
import CapabilityMatrix from "./CapabilityMatrix";
import ManualFields from "./ManualFields";
import SubscriptionSection from "./SubscriptionSection";
import DeliveryLog from "./DeliveryLog";
import PageLog from "./PageLog";
import SendPush from "./SendPush";

// ---------------------------------------------------------------------------
// Log line type
// ---------------------------------------------------------------------------
export interface LogLine {
  ts: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function PushLab() {
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

  // ---------------------------------------------------------------------------
  // Page log helper
  // ---------------------------------------------------------------------------
  const log = useCallback((text: string) => {
    setPageLog((prev) => {
      const next = [{ ts: Date.now(), text }, ...prev];
      return next.slice(0, 200);
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Refresh helpers
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Action wrappers
  // ---------------------------------------------------------------------------
  const runAction = useCallback(
    async (name: string, fn: () => Promise<void>) => {
      setRunning(name);
      log(`▶ ${name}`);
      try {
        await fn();
      } catch (e: unknown) {
        const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        log(`✖ ${name}: ${msg}`);
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
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
      }
    });

  const handleClassicSubscribe = () =>
    runAction("Subscribe (classic)", async () => {
      let reg = swRegRef.current;
      if (!reg) {
        const regRes = await registerServiceWorker();
        if (!regRes.ok) {
          log(`✖ SW register: ${regRes.error.message}`);
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
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
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
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
      }
    });

  const handleLocalNotification = () =>
    runAction("Show local notification", async () => {
      const res = await showLocalNotification();
      if (res.ok) log("✔ Local notification shown");
      else log(`✖ ${res.error.name}: ${res.error.message}`);
    });

  const handleSetBadge = () =>
    runAction("Set badge 3", async () => {
      const res = await setBadge(3);
      if (res.ok) log("✔ Badge set to 3");
      else log(`✖ ${res.error.name}: ${res.error.message}`);
    });

  const handleClearBadge = () =>
    runAction("Clear badge", async () => {
      const res = await clearBadge();
      if (res.ok) log("✔ Badge cleared");
      else log(`✖ ${res.error.name}: ${res.error.message}`);
    });

  const handleUnsubscribe = () =>
    runAction("Unsubscribe", async () => {
      const res = await unsubscribe();
      if (res.ok) {
        setSubscription(null);
        log("✔ Unsubscribed");
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
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
      } else {
        log(`✖ ${res.error.name}: ${res.error.message}`);
      }
    });

  const handleClearLogs = () =>
    runAction("Clear logs", async () => {
      await clearSwLog();
      setSwLog([]);
      setPageLog([]);
      log("✔ Logs cleared");
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
    });

  const toggleAutoRegister = () => {
    const next = !autoRegister;
    setAutoRegister(next);
    setStored("autoRegister", String(next));
    log(`Auto-register SW: ${next ? "on" : "off"}`);
  };

  // ---------------------------------------------------------------------------
  // Copy report
  // ---------------------------------------------------------------------------
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
        windowPushManager: !!window.pushManager,
        setAppBadge: !!navigator.setAppBadge,
        navigatorStandalone: env?.navigatorStandalone,
        displayModeStandalone: env?.displayModeStandalone,
      },
      sw: { version: swVersion, state: swState, scope: swScope },
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
    } catch {
      log("✖ Clipboard failed — see page log");
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!env) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">detecting…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6 flex flex-col gap-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Push Lab</h1>
        <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 space-y-0.5">
          <p>
            SW version: {swVersion ?? "—"} · State: {swState}
          </p>
          {swScope && <p className="truncate">Scope: {swScope}</p>}
          {swScriptURL && <p className="truncate">Script: {swScriptURL}</p>}
        </div>
      </header>

      {/* Environment */}
      <EnvironmentSection env={env} apple={apple} ctx={ctx} iosVer={iosVer} model={model} />

      {/* Manual fields */}
      <ManualFields />

      {/* Capability matrix */}
      <CapabilityMatrix env={env} apple={apple} ctx={ctx} />

      {/* Controls */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Controls</h2>

        {/* SW controls */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRegister}
              onChange={toggleAutoRegister}
              className="h-5 w-5 rounded"
            />
            Auto-register SW on load
          </label>
        </div>
        <Btn label="Register service worker" running={running} onClick={handleRegisterSW} />

        {/* Subscribe */}
        <Btn
          label="Request permission + subscribe (classic)"
          running={running}
          onClick={handleClassicSubscribe}
        />
        <Btn
          label="Subscribe via window.pushManager (declarative)"
          running={running}
          onClick={handleDeclarativeSubscribe}
        />

        {/* Local tests */}
        <div className="flex flex-wrap gap-2">
          <Btn
            label="Show local notification"
            running={running}
            onClick={handleLocalNotification}
          />
          <Btn label="Set badge 3" running={running} onClick={handleSetBadge} />
          <Btn label="Clear badge" running={running} onClick={handleClearBadge} />
        </div>

        {/* Send test push */}
        <SendPush
          subscription={subscription}
          model={model}
          iosVer={iosVer}
          ctx={ctx}
          log={log}
          running={running}
          setRunning={setRunning}
        />

        {/* Maintenance */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
          <Btn label="Unsubscribe" running={running} onClick={handleUnsubscribe} />
          <Btn label="Unregister SW" running={running} onClick={handleUnregisterSW} />
          <Btn label="Clear logs" running={running} onClick={handleClearLogs} />
          <Btn label="Reset everything" running={running} onClick={handleReset} variant="danger" />
        </div>
      </section>

      {/* Subscription */}
      <SubscriptionSection subscription={subscription} permission={permission} />

      {/* Delivery log */}
      <DeliveryLog
        entries={swLog}
        onRefresh={refreshSwLog}
        onClear={async () => {
          await clearSwLog();
          setSwLog([]);
        }}
      />

      {/* Page log */}
      <PageLog entries={pageLog} />

      {/* Copy report */}
      <button
        onClick={handleCopyReport}
        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 active:bg-zinc-100 dark:active:bg-zinc-700 transition-colors"
      >
        Copy report
      </button>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Shared button component
// ---------------------------------------------------------------------------
function Btn({
  label,
  running,
  onClick,
  variant,
}: {
  label: string;
  running: string | null;
  onClick: () => void;
  variant?: "danger";
}) {
  const isRunning = running === label;
  const base =
    "min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors active:scale-[0.98] select-none";
  const colors =
    variant === "danger"
      ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
      : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
  return (
    <button onClick={onClick} className={`${base} ${colors}`}>
      {isRunning ? "running…" : label}
    </button>
  );
}
