# iOS & iPadOS Web Push Guide

A comprehensive technical reference detailing the quirks, constraints, and architecture of Web Push on Apple mobile devices (iOS and iPadOS).

---

## 1. Operating System & Browser Requirements

| Feature                                         |     iOS 16.4 – 16.7     |                 iOS 17.0+                 | iOS 18.4+  |         iOS 26+         |
| :---------------------------------------------- | :---------------------: | :---------------------------------------: | :--------: | :---------------------: |
| **Classic Web Push (Service Worker)**           | Supported (Safari only) | Supported (Safari & third-party browsers) | Supported  |        Supported        |
| **Declarative Web Push (`window.pushManager`)** |           ❌            |                    ❌                     | Supported  |        Supported        |
| **Add to Home Screen from Chrome/Edge/Firefox** |    ❌ (Safari only)     |                 Supported                 | Supported  |        Supported        |
| **"Open as Web App" Toggle**                    |           N/A           |                    N/A                    |    N/A     | Supported (Default: On) |
| **Safari Tab Push Support**                     |       ❌ Blocked        |                ❌ Blocked                 | ❌ Blocked |       ❌ Blocked        |

> [!IMPORTANT]
> **Web Push on iOS strictly requires installing the web app to the Home Screen.** Safari tabs, Chrome tabs, and embedded WebViews do **not** support push notifications or provide access to `PushManager`.

---

## 2. Core Constraints of Apple Web Push

### A. The "No Silent Push" Mandate

- Safari on iOS does **not** allow background/silent pushes.
- Every push event received by a Service Worker **must immediately display a user-visible notification** via `self.registration.showNotification(...)` inside `event.waitUntil(...)`.
- **Penalty:** If a Service Worker handles a push event and fails to display a notification promptly, Apple permanently revokes the push subscription.
- **Declarative Push Exemption:** Declarative Web Push (`web_push: 8030`) is exempt from this penalty because the operating system displays the notification directly without waiting for JavaScript.

### B. User Gesture & Activation Rules

- Requesting notification permissions (`Notification.requestPermission()`) and subscribing (`subscribe()`) **must be triggered directly by an explicit user gesture** (a tap or click).
- Do **not** await async fetches, timers, or `navigator.serviceWorker.ready` before calling `requestPermission()`. Doing so drops the user activation flag (`navigator.userActivation.isActive`), causing iOS to silently reject or drop the prompt.

### C. Separate Storage Sandbox

- Each Home Screen web app install has an **isolated sandbox**.
- `localStorage`, `IndexedDB`, cookies, Service Worker registrations, and push subscriptions in a Home Screen app are **completely independent** from Safari browser tabs and from other Home Screen icons of the same domain.
- State, logins, or subscriptions created in Safari tabs do not transfer to the installed app.

### D. iOS 26+ "Open as Web App" Toggle

- In iOS 26+, when a user taps _Share &rarr; Add to Home Screen_, Apple displays a toggle: **"Open as Web App"** (enabled by default).
- If the user turns this toggle **off**, the icon behaves as a legacy Safari bookmark rather than a standalone PWA. Bookmarks do not have standalone capability and **cannot receive push notifications**.

---

## 3. Dual Push Modes: Classic vs. Declarative

Apple supports two distinct push architectures on modern iOS:

```
                  ┌──────────────────────────────────────────────┐
                  │                 APNs Server                  │
                  └──────────────────────┬───────────────────────┘
                                         │
                   RFC 8030 Push Payload (Encrypted)
                                         │
                                         ▼
                             ┌───────────────────────┐
                             │       iOS Device      │
                             └───────────┬───────────┘
                                         │
                  ┌──────────────────────┴──────────────────────┐
                  │                                             │
      Legacy Payload Shape                          Declarative Payload Shape
   {"title": "...", "body": "..."}              {"web_push": 8030, "notification": {...}}
                  │                                             │
                  ▼                                             ▼
       ┌───────────────────────┐                     ┌───────────────────────┐
       │ Service Worker Active │                     │  Operating System UI  │
       │     (JavaScript)      │                     │     (No JS Needed)    │
       └──────────┬────────────┘                     └──────────┬────────────┘
                  │                                             │
                  ▼                                             ▼
        Displays Notification                         Displays Notification
          & Logs to IDB                                   Immediately
```

### 1. Classic Web Push (Service Worker)

- **Subscription API:** `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
- **Execution:** Wakes up the Service Worker script (`sw.js`).
- **Payload:** Arbitrary JSON payload.
- **Handling:** JavaScript parses the payload, optionally updates app badges (`navigator.setAppBadge`), logs events to IndexedDB, and calls `showNotification()`.
- **Requirement:** Service Worker must be registered and active.

### 2. Declarative Web Push (iOS 18.4+)

- **Subscription API:** `window.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
- **Execution:** Managed natively by iOS. **No Service Worker required.**
- **Payload Structure:**
  ```json
  {
    "web_push": 8030,
    "notification": {
      "title": "New Alert",
      "body": "This notification was rendered without executing any JavaScript.",
      "navigate": "https://example.com/alerts/123",
      "silent": false,
      "data": {
        "id": "item-99"
      }
    },
    "app_badge": "3"
  }
  ```
- **Fallback / Interception:** If a Service Worker is active, it still receives the push event and can show an updated notification. However, if the Service Worker is unregistered or terminated, the OS will still render the notification.

---

## 4. Device & OS Detection Quirks

### A. Safari iOS 26+ User-Agent Freeze

Starting in iOS 26, Safari permanently froze the OS token in the user agent string to prevent browser fingerprinting:

```
# Real iPhone on iOS 26 reports:
Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1
```

- The `iPhone OS 18_6` token is **frozen** and misleading.
- The **true version** is carried in the `Version/` token (`Version/26.0`).
- **Algorithm:**
  1. Inspect `Version/(\d+(?:\.\d+)?)` first. If present, use this as the primary OS version.
  2. Fall back to `OS (\d+)_(\d+)` for third-party browsers (Chrome/Firefox for iOS do not freeze the OS token).

### B. iPadOS Desktop Mode

- Since iPadOS 13, Safari on iPad defaults to "Request Desktop Website", sending a Mac user agent:
  ```
  Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15
  ```
- To detect iPads reliably:
  ```ts
  const isIPad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  ```

### C. WebGL GPU Fingerprinting Disabled

- Since iOS 12.2, Apple disabled specific GPU string reporting in WebGL.
- Calling `gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)` returns a generic `"Apple GPU"` across all iPhone and iPad models.
- **Model determination:** Modern web applications cannot read the exact hardware model name or device name. The only available heuristic is screen resolution + device pixel ratio (DPR), which must be treated as a list of candidate models.

---

## 5. Apple Push Notification service (APNs) Delivery Details

1. **APNs Hostnames:** Apple routes web push traffic through `*.push.apple.com`. Outbound network firewalls must permit HTTPS traffic to this domain.
2. **Payload Size Limit:** 4,096 bytes (4 KB), including encryption overhead. Unencrypted JSON payloads should be kept under **3,990 bytes**.
3. **TTL (Time to Live):** Positive integer in seconds. Apple stores undelivered messages for up to 30 days.
4. **Urgency Levels:**
   - `high`: Attempts immediate delivery; may wake device.
   - `normal`, `low`, `very-low`: May be throttled or batched depending on device battery and power state.
5. **Topic Coalescing:** Up to 32 URL-safe base64 characters. Newer pushes with the same topic overwrite pending undelivered pushes.
6. **201 Status Code:** Returning HTTP `201 Created` indicates APNs **accepted** the message for delivery. It does **not** prove that the message was displayed on the screen (the device may be offline, in Focus mode, or silenced). The on-device Service Worker delivery log is the only definitive proof of arrival.
