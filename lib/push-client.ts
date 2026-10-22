// Client-side push helpers. Every function returns Result and never throws.

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: { name: string; message: string } };
type Result<T> = Ok<T> | Err;

function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

function err(e: unknown): Err {
  if (e instanceof Error) {
    return { ok: false, error: { name: e.name, message: e.message } };
  }
  return { ok: false, error: { name: "Error", message: String(e) } };
}

// ---------------------------------------------------------------------------
// localStorage keys (all prefixed pushlab.)
// ---------------------------------------------------------------------------
const PREFIX = "pushlab.";

export function getStored(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function setStored(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // quota or private browsing
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export function clearAllStored(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ---------------------------------------------------------------------------
// Service worker
// ---------------------------------------------------------------------------
export async function registerServiceWorker(): Promise<Result<ServiceWorkerRegistration>> {
  try {
    if (!("serviceWorker" in navigator)) {
      return err(new Error("Service workers not supported"));
    }
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    return ok(reg);
  } catch (e) {
    return err(e);
  }
}

export async function unregisterServiceWorkers(): Promise<Result<boolean>> {
  try {
    if (!("serviceWorker" in navigator)) {
      return err(new Error("Service workers not supported"));
    }
    const regs = await navigator.serviceWorker.getRegistrations();
    let any = false;
    for (const reg of regs) {
      await reg.unregister();
      any = true;
    }
    return ok(any);
  } catch (e) {
    return err(e);
  }
}

// ---------------------------------------------------------------------------
// Subscription — classic (through SW registration)
// ---------------------------------------------------------------------------
export async function getSubscription(): Promise<Result<PushSubscription | null>> {
  try {
    // Try classic first
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) return ok(sub);
    }
    // Fall back to declarative
    if (window.pushManager) {
      const sub = await window.pushManager.getSubscription();
      if (sub) return ok(sub);
    }
    return ok(null);
  } catch (e) {
    return err(e);
  }
}

export async function subscribeClassic(
  registration: ServiceWorkerRegistration,
  log?: (text: string) => void,
): Promise<Result<PushSubscription>> {
  try {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      return err(new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY not set"));
    }

    const ua = navigator.userActivation;
    log?.(`userActivation.isActive before requestPermission: ${ua?.isActive}`);

    const perm = await Notification.requestPermission();

    log?.(`userActivation.isActive before subscribe: ${ua?.isActive}`);

    if (perm !== "granted") {
      return err(new Error(`Notification permission ${perm}`));
    }

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    setStored("vapidKeyUsed", vapidKey);
    return ok(sub);
  } catch (e) {
    return err(e);
  }
}

export async function subscribeDeclarative(
  log?: (text: string) => void,
): Promise<Result<PushSubscription>> {
  try {
    if (!window.pushManager) {
      return err(new Error("window.pushManager not available"));
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      return err(new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY not set"));
    }

    const ua = navigator.userActivation;
    log?.(`userActivation.isActive before requestPermission: ${ua?.isActive}`);

    if (typeof Notification !== "undefined") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        return err(new Error(`Notification permission ${perm}`));
      }
    }

    log?.(`userActivation.isActive before subscribe: ${ua?.isActive}`);

    const sub = await window.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    setStored("vapidKeyUsed", vapidKey);
    return ok(sub);
  } catch (e) {
    return err(e);
  }
}

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------
export async function unsubscribe(): Promise<Result<boolean>> {
  try {
    const subResult = await getSubscription();
    if (!subResult.ok) return subResult;
    if (!subResult.data) return ok(false);
    const result = await subResult.data.unsubscribe();
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// ---------------------------------------------------------------------------
// Local notification (through SW registration)
// ---------------------------------------------------------------------------
export async function showLocalNotification(): Promise<Result<void>> {
  try {
    if (!("serviceWorker" in navigator)) {
      return err(new Error("Service workers not supported"));
    }
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification("Push Lab — local test", {
      body: "This notification was triggered locally, not via push.",
    });
    return ok(undefined);
  } catch (e) {
    return err(e);
  }
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
export async function setBadge(n: number): Promise<Result<void>> {
  try {
    if (!navigator.setAppBadge) {
      return err(new Error("navigator.setAppBadge not available"));
    }
    await navigator.setAppBadge(n);
    return ok(undefined);
  } catch (e) {
    return err(e);
  }
}

export async function clearBadge(): Promise<Result<void>> {
  try {
    if (!navigator.clearAppBadge) {
      return err(new Error("navigator.clearAppBadge not available"));
    }
    await navigator.clearAppBadge();
    return ok(undefined);
  } catch (e) {
    return err(e);
  }
}
