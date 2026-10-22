/* eslint-disable no-restricted-globals */

const SW_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// IndexedDB helper
// ---------------------------------------------------------------------------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("pushlab", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("events")) {
        db.createObjectStore("events", { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function logEvent(type, detail) {
  try {
    const db = await openDB();
    const tx = db.transaction("events", "readwrite");
    const store = tx.objectStore("events");
    store.put({ ts: Date.now(), type, detail });

    // Trim to latest 200
    const countReq = store.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - 200;
      if (excess > 0) {
        const cursor = store.openCursor();
        let deleted = 0;
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c && deleted < excess) {
            c.delete();
            deleted++;
            c.continue();
          }
        };
      }
    };
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
    db.close();
  } catch (_) {
    // Never throw from logEvent
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "GET_VERSION") {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: SW_VERSION });
    }
  }
});

// ---------------------------------------------------------------------------
// Notify all window clients
// ---------------------------------------------------------------------------
async function notifyClients() {
  try {
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.postMessage({ type: "sw-event" });
    }
  } catch (_) {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Push handler
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

async function handlePush(event) {
  const receivedAt = Date.now();
  let parsed = {};

  // Parse defensively
  if (event.data) {
    try {
      parsed = event.data.json();
    } catch (_) {
      try {
        const text = event.data.text();
        parsed = { title: text || "Push received" };
      } catch (__) {
        parsed = {};
      }
    }
  }

  // Determine payload shape
  let title, body, url, sentAt, id, badge, kind;

  if (parsed.web_push === 8030 && parsed.notification) {
    // Declarative Web Push
    kind = "declarative";
    const n = parsed.notification;
    title = n.title || "Push received";
    body = n.body || "";
    url = n.navigate || "/";
    badge = n.app_badge;
    sentAt = n.data?.sentAt;
    id = n.data?.id;
  } else {
    // Legacy
    kind = "legacy";
    title = parsed.title || "";
    body = parsed.body || "";
    url = parsed.url || "/";
    sentAt = parsed.sentAt;
    id = parsed.id;
    badge = parsed.badge;
  }

  if (!title) {
    title = "Push received (empty or invalid payload)";
  }

  const latencyMs = sentAt ? receivedAt - sentAt : null;

  await logEvent("push", { kind, id, sentAt, receivedAt, latencyMs });

  // Badge
  if (badge !== undefined && badge !== null) {
    try {
      const badgeNum = typeof badge === "string" ? parseInt(badge, 10) : Number(badge);
      if (!isNaN(badgeNum)) {
        await self.navigator.setAppBadge(badgeNum);
        await logEvent("badge-set", { value: badgeNum });
      }
    } catch (err) {
      await logEvent("badge-failed", { error: err.message || String(err) });
    }
  }

  // Show notification
  try {
    await self.registration.showNotification(title, {
      body,
      data: { url },
      tag: id || undefined,
    });
    await logEvent("shown", { title, id });
  } catch (err) {
    await logEvent("show-failed", { error: err.message || String(err) });
  }

  await notifyClients();
}

// ---------------------------------------------------------------------------
// Notification click
// ---------------------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      await logEvent("click", { url });

      // Only open same-origin URLs
      try {
        const notifUrl = new URL(url, self.location.origin);
        if (notifUrl.origin !== self.location.origin) {
          return;
        }
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          if (new URL(client.url).origin === self.location.origin) {
            client.focus();
            return;
          }
        }
        await self.clients.openWindow(notifUrl.href);
      } catch (_) {
        // best-effort
      }
    })(),
  );
});

// ---------------------------------------------------------------------------
// Subscription change
// ---------------------------------------------------------------------------
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    logEvent("pushsubscriptionchange", {
      oldEndpoint: event.oldSubscription?.endpoint,
      newEndpoint: event.newSubscription?.endpoint,
    }),
  );
});
