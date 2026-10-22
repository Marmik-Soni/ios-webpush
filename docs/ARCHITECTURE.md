# Push Lab Architecture & Design

Technical documentation describing the internal design, component hierarchy, security model, and data flows of the Push Lab utility.

---

## 1. System Architecture Overview

Push Lab is a specialized diagnostics utility built on **Next.js (App Router)**, **TypeScript**, and **Tailwind CSS**. It is structured to provide an honest, unopinionated test bed for Apple's Web Push implementations.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (iOS Device)                           │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                         PushLab Page                           │   │
│   │                                                                │   │
│   │  [EnvironmentSection]  [CapabilityMatrix]  [SubscriptionSection]│   │
│   │  [ManualFields]        [SendPush]          [DeliveryLog]       │   │
│   │  [PageLog]             [CopyReport]                            │   │
│   └────────────────────────────────┬───────────────────────────────┘   │
│                                    │                                   │
│        Direct User Tap             │ POST /api/push                    │
│        (requestPermission,         │ (headers: x-tester-key)           │
│         subscribe)                 │                                   │
│                                    ▼                                   │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                   NEXT.JS BACKEND RUNTIME                      │   │
│   │                                                                │   │
│   │   1. Timing-safe Auth check (TESTER_KEY)                       │   │
│   │   2. Dynamic VAPID configuration (setVapidDetails)             │   │
│   │   3. Host Allowlisting (*.push.apple.com)                      │   │
│   │   4. Server-Side Delay (await sleep(delaySeconds))             │   │
│   │   5. Dispatch RFC 8030 Payload via web-push                    │   │
│   └────────────────────────────────┬───────────────────────────────┘   │
└────────────────────────────────────┼───────────────────────────────────┘
                                     │
                                     │ HTTPS / RFC 8030 Push
                                     ▼
                  ┌─────────────────────────────────────┐
                  │      Apple Push Notification svc    │
                  │        (web.push.apple.com)         │
                  └──────────────────┬──────────────────┘
                                     │
                             APNs Push Delivery
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        RECEIVING DEVICE (PWA)                          │
│                                                                        │
│               ┌────────────────────────────────────────┐               │
│               │             iOS Push Engine            │               │
│               └────┬──────────────────────────────┬────┘               │
│                    │                              │                    │
│     (Classic SW)   │                              │ (Declarative)      │
│                    ▼                              ▼                    │
│          ┌──────────────────┐           ┌──────────────────┐           │
│          │   public/sw.js   │           │ Native OS Banner │           │
│          └─────────┬────────┘           └──────────────────┘           │
│                    │                                                   │
│     1. showNotification()                                              │
│     2. Log to IndexedDB (pushlab)                                      │
│     3. postMessage("sw-event")                                         │
│                    │                                                   │
│                    ▼                                                   │
│          ┌──────────────────┐                                          │
│          │ Notification UI  │                                          │
│          └──────────────────┘                                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Structure

The frontend consists of focused, decoupled React client components:

| Component                                                                                         | Responsibility                                                                                                                                           |
| :------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`PushLab.tsx`](file:///c:/MarmikSoni/ios-webpush/components/PushLab.tsx)                         | Root controller orchestrating component layout, Service Worker initialization, broadcast listeners, and report generation.                               |
| [`EnvironmentSection.tsx`](file:///c:/MarmikSoni/ios-webpush/components/EnvironmentSection.tsx)   | Displays runtime context (PWA vs Browser tab), iOS version with detection source, screen resolution, and candidate device models.                        |
| [`CapabilityMatrix.tsx`](file:///c:/MarmikSoni/ios-webpush/components/CapabilityMatrix.tsx)       | Verifies individual API availability (`isSecureContext`, `serviceWorker`, `PushManager`, `Notification`, `window.pushManager`, `navigator.setAppBadge`). |
| [`SubscriptionSection.tsx`](file:///c:/MarmikSoni/ios-webpush/components/SubscriptionSection.tsx) | Displays active push subscription details, endpoint hostname validation, VAPID key mismatch warnings, and copy actions.                                  |
| [`SendPush.tsx`](file:///c:/MarmikSoni/ios-webpush/components/SendPush.tsx)                       | Configures test push dispatches (title, body, mode, delay, TTL, urgency, topic, badge) and handles POST requests to `/api/push`.                         |
| [`DeliveryLog.tsx`](file:///c:/MarmikSoni/ios-webpush/components/DeliveryLog.tsx)                 | Queries the Service Worker's IndexedDB store to render real-time logs of delivered notifications and latency measurements.                               |
| [`PageLog.tsx`](file:///c:/MarmikSoni/ios-webpush/components/PageLog.tsx)                         | On-screen console stream capturing user interaction steps, API calls, and diagnostic flags.                                                              |
| [`ManualFields.tsx`](file:///c:/MarmikSoni/ios-webpush/components/ManualFields.tsx)               | Provides manual input fields for device model, true iOS version, and tester notes, persisted in `localStorage`.                                          |

---

## 3. Service Worker Design (`public/sw.js`)

The Service Worker operates as a resilient, zero-build script focused strictly on push handling and local event logging:

1. **Immediate Notification Presentation:**
   - Apple penalizes delayed notifications with subscription revocation.
   - The Service Worker calls `self.registration.showNotification(...)` **before** performing any asynchronous storage writes to ensure the visual notification appears instantly.
2. **Defensive Parsing:**
   - Evaluates `event.data.json()` within a `try/catch` block, followed by `event.data.text()`, falling back to a safe default alert. It will **never throw** an uncaught error before presenting the notification.
3. **Dual Payload Parsing:**
   - **Declarative format (`web_push === 8030`):** Reads configuration from the `notification` object and badges from `app_badge`.
   - **Legacy format:** Reads top-level fields (`title`, `body`, `url`, `sentAt`, `id`, `badge`).
4. **IndexedDB Event Persistence:**
   - Maintains an IndexedDB database named `pushlab` with an `events` object store.
   - Automatically records timestamped entries for `push`, `shown`, `show-failed`, and `click`.
   - Capped at 200 entries to prevent memory growth.
5. **Client Notification Broadcast:**
   - Fires `postMessage({ type: "sw-event" })` to all open window clients so the [`DeliveryLog`](file:///c:/MarmikSoni/ios-webpush/components/DeliveryLog.tsx) component refreshes without manual reloading.

---

## 4. Server-Side Push Endpoint (`app/api/push/route.ts`)

The push dispatch route enforces strict security and error handling policies:

1. **Authentication (`TESTER_KEY`):**
   - Validates the `x-tester-key` request header against `process.env.TESTER_KEY` using `crypto.timingSafeEqual` to prevent timing attacks.
   - Rejects unauthenticated requests with HTTP `401 Unauthorized`.
2. **Open Relay Protection:**
   - The endpoint will **only** dispatch pushes to allowlisted push service hostnames:
     - `push.apple.com` and `*.push.apple.com` (Apple APNs)
     - `fcm.googleapis.com` (Google FCM)
     - `updates.push.services.mozilla.com` (Mozilla Autopush)
     - `*.notify.windows.com` (Microsoft WNS)
3. **Runtime VAPID Configuration:**
   - `webpush.setVapidDetails` is invoked **inside the POST handler** rather than at module initialization. This allows Next.js static builds (`next build`) to succeed even when environment variables are not yet present.
4. **Server-Side Delayed Push:**
   - If `delaySeconds` is provided (0–30s), the server pauses using an asynchronous timer before invoking APNs. Client-side timers cannot be trusted on iOS because mobile browsers pause execution as soon as the screen is locked or the app is minimized.
5. **Detailed Upstream Passthrough:**
   - On delivery failure, the route extracts the exact status, body, and error code returned by Apple and returns an HTTP `502 Bad Gateway` with actionable diagnostic hints.

---

## 5. Client State & LocalStorage Schema

All client-side state keys are namespaced with the `pushlab.` prefix:

| Key                         | Type      | Description                                                                                             |
| :-------------------------- | :-------- | :------------------------------------------------------------------------------------------------------ |
| `pushlab.autoRegister`      | `boolean` | Stores preference for auto-registering the Service Worker on load.                                      |
| `pushlab.testerKey`         | `string`  | The saved `TESTER_KEY` used for authenticating test pushes.                                             |
| `pushlab.vapidKeyUsed`      | `string`  | The VAPID public key present when the current subscription was created (used to detect key mismatches). |
| `pushlab.manual.model`      | `string`  | User-entered hardware model override.                                                                   |
| `pushlab.manual.iosVersion` | `string`  | User-entered OS version override.                                                                       |
| `pushlab.manual.notes`      | `string`  | User notes for the diagnostic session.                                                                  |
| `pushlab.sendDefaults.*`    | `object`  | Last used payload configurations.                                                                       |
