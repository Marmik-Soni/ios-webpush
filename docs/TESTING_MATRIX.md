# Push Lab Testing Matrix & Protocol

A rigorous verification protocol for validating Web Push capabilities on Apple devices across different contexts and application states.

---

## 1. The Core Testing Matrix

Work through each cell in the matrix below. Check off whether the push notification banner appears and whether the Delivery Log captures the arrival:

| Context                           | Application State                                   | Classic SW Push  | Declarative Push |
| :-------------------------------- | :-------------------------------------------------- | :--------------: | :--------------: |
| **Safari Tab** (Negative Control) | Foreground                                          | ❌ Expected Fail | ❌ Expected Fail |
| **Home Screen App** (PWA)         | **Foreground** (Active on screen)                   |        ☐         |        ☐         |
| **Home Screen App** (PWA)         | **Background** (App minimized, home screen visible) |        ☐         |        ☐         |
| **Home Screen App** (PWA)         | **Locked** (Display powered off)                    |        ☐         |        ☐         |
| **Home Screen App** (PWA)         | **Swiped Away** (Force closed from App Switcher)    |        ☐         |        ☐         |

---

## 2. Step-by-Step Test Scenarios

### Test A: Negative Control (Safari Tab)

1. Open the deployed application in a regular **Safari tab**.
2. Observe the **Capability Matrix**:
   - `PushManager` should report `false` or `undefined`.
   - `window.pushManager` should report `undefined`.
3. Tap **"Request permission + subscribe (classic)"**:
   - The button should run without crashing.
   - The **Page Log** must record the exact exception thrown by Safari (e.g. `TypeError: Cannot read properties of undefined (reading 'subscribe')`).
4. **Expected Outcome:** Confirm that Safari tabs cannot subscribe or receive push notifications.

---

### Test B: Foreground Delivery (Home Screen Web App)

1. Install Push Lab to Home Screen (_Share &rarr; Add to Home Screen_).
2. Launch from the **Home Screen icon**.
3. Tap **"Request permission + subscribe (classic)"** and accept the system prompt.
4. In the **Send Push** card, enter your `TESTER_KEY`.
5. Tap **"Send now"**.
6. **Expected Outcome:**
   - Server returns `201 Created`.
   - A notification banner appears at the top of the screen.
   - The **Delivery Log** updates immediately showing `push` and `shown` with latency in milliseconds.

---

### Test C: Background Delivery (App Minimized)

1. In the **Send Push** card, tap **"Send in 10 s"** (or use the 5s / 30s preset).
2. Observe the **Cooldown Banner** and live button countdown (`⏱️ 10s remaining…`).
3. Swipe up to return to the Home Screen (minimizing Push Lab).
4. Wait for the countdown to elapse.
5. **Expected Outcome:**
   - The push banner drops down over the iOS home screen.
   - Reopen Push Lab; the **Delivery Log** will have recorded the arrival while in the background.

---

### Test D: Locked Screen Delivery

1. In **Send Push**, tap **"Send in 10 s"**.
2. Notice the live countdown countdown in the active Cooldown Banner.
3. **Immediately press the device lock/power button** to turn the screen black.
4. Wait 10 seconds.
5. **Expected Outcome:**
   - The phone screen lights up and displays the notification directly on the Lock Screen.
   - The Service Worker wakes up and records the event in IndexedDB.
   - Reopening Push Lab shows the delivery receipt in the **Delivery Log** tab.

---

### Test E: Declarative Push Without JavaScript

This test proves that **Declarative Web Push (iOS 18.4+)** operates purely at the OS level without executing any web application code.

1. In Push Lab, tap **"Subscribe via window.pushManager (declarative)"**.
2. Turn **OFF** the toggle: _"Auto-register service worker on load"_.
3. Tap **"Unregister service worker"** under Maintenance controls.
4. Confirm in the header that Service Worker state is **None** or **Unregistered**.
5. In **Send Push**, select **Declarative** mode.
6. Choose **"Send in 10 s"** and immediately lock the phone.
7. **Expected Outcome:**
   - The notification banner appears on the Lock Screen!
   - Unlock and open Push Lab.
   - **The Delivery Log will be empty**, proving that the operating system rendered the notification without waking any Service Worker or executing JavaScript.

---

## 3. Diagnostic Report Export

Push Lab includes a **"Copy report"** button that captures complete device diagnostic state into structured JSON.

### Sample Report Format:

```json
{
  "device": {
    "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)... Version/26.0 ...",
    "platform": "iPhone",
    "screen": "402x874@3",
    "modelCandidates": ["iPhone 16 Pro", "iPhone 17", "iPhone 17 Pro"],
    "iosVersion": "26.0",
    "iosVersionSource": "Version/ token",
    "isSecureContext": true,
    "context": "Home Screen web app",
    "manual": {
      "model": "iPhone 17 Pro",
      "iosVersion": "26.1",
      "notes": "Testing on cellular network"
    }
  },
  "capabilities": {
    "serviceWorker": true,
    "pushManager": true,
    "windowPushManager": true,
    "notification": true,
    "permission": "granted",
    "setAppBadge": true
  },
  "serviceWorker": {
    "version": "1.0.0",
    "state": "activated"
  },
  "subscription": {
    "endpointHost": "web.push.apple.com",
    "vapidKeyMatch": true
  },
  "sendResults": [...],
  "deliveryLog": [...],
  "pageLog": [...],
  "generatedAt": "2026-10-22T06:15:00.000Z"
}
```

Use this JSON dump to record and compare test results across different hardware models and iOS updates.
