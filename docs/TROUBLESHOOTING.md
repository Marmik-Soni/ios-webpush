# Web Push Troubleshooting Guide

A practical troubleshooting reference for diagnosing and resolving Web Push issues on iOS, iPadOS, and the Apple Push Notification service (APNs).

---

## 1. APNs Status Codes & Upstream Errors

When dispatching a push notification, [`app/api/push/route.ts`](file:///c:/MarmikSoni/ios-webpush/app/api/push/route.ts) connects directly to Apple's push servers (`web.push.apple.com`). Below are the exact HTTP statuses returned by Apple and how to resolve them:

### HTTP 403 `BadJwtToken`

- **Cause:** The VAPID Authorization JWT header was rejected by Apple.
- **Common triggers:**
  - `VAPID_SUBJECT` is missing, contains spaces, or has angle brackets (e.g. `Your Name <you@example.com>`).
  - `VAPID_SUBJECT` is not a valid `mailto:` or `https://` URL.
  - The JWT token expiration (`exp`) exceeds 24 hours.
  - The audience claim (`aud`) does not match the push service endpoint scheme and host.
- **Fix:** In your environment settings, ensure:
  ```bash
  VAPID_SUBJECT=mailto:valid-email@your-real-domain.com
  ```

---

### HTTP 403 `VapidPkHashMismatch`

- **Cause:** The push subscription was generated using a different VAPID public key than the one currently used by the server to sign the request.
- **Common triggers:**
  - You generated new VAPID keys, but the browser has an old subscription stored.
- **Fix:**
  1. In Push Lab, look at the **Subscription** card: the indicator will warn of a key mismatch.
  2. Tap **"Unsubscribe"** (or **"Reset everything"**).
  3. Tap **"Subscribe"** again to create a new subscription with the current public key.

---

### HTTP 410 `Gone`

- **Cause:** The subscription token has expired, or the user revoked push permission on the device.
- **Fix:**
  - The subscription is dead and cannot be reused.
  - Tap **"Unsubscribe"** and re-subscribe on the device.

---

### HTTP 413 `Payload Too Large`

- **Cause:** The encrypted payload sent to APNs exceeds the hard **4,096 byte (4 KB)** limit.
- **Fix:**
  - Keep unencrypted JSON payloads under **3,990 bytes** to leave room for RFC 8030 / RFC 8291 encryption overhead.
  - Shorten custom data attributes.

---

### HTTP 429 `Too Many Requests`

- **Cause:** Apple's servers are rate-limiting your requests.
- **Fix:**
  - Pause dispatches and implement exponential backoff.
  - Ensure you are not sending rapid burst notifications to the same topic.

---

## 2. iOS Display & Notification Issues

### Push returns 201 Created, but no notification appears on the device

> [!NOTE]
> HTTP `201 Created` indicates that **APNs accepted your message for delivery**. It does **not** prove that the message was displayed on the phone.

If the notification fails to display:

1. **Check iOS Notification Settings:**
   - Open **Settings &rarr; Notifications &rarr; Push Lab**.
   - Ensure **Allow Notifications**, **Lock Screen**, **Notification Center**, and **Banners** are toggled **ON**.
2. **Check Focus Mode:**
   - If **Do Not Disturb**, **Work**, **Personal**, or **Sleep** Focus is active, iOS suppresses alerts.
   - Either disable Focus or add Push Lab to _Allowed Apps_.
3. **Check Low Power Mode:**
   - Low Power Mode can delay background push delivery or deprioritize low-urgency pushes.
   - Use `Urgency: high` in Push Lab's advanced settings.
4. **Inspect the Delivery Log:**
   - Check the **Delivery Log** in Push Lab. If it shows an entry with `show-failed`, the Service Worker encountered an error displaying the notification.

---

### Push APIs (`PushManager`, `Notification`) missing or undefined

- **Cause:** The page is being viewed inside a standard **Safari tab** or Chrome tab.
- **Fix:** Web Push is blocked in browser tabs on iOS. You must install the site to the Home Screen:
  1. In Safari, tap the **Share** button &rarr; **Add to Home Screen**.
  2. Close Safari and tap the **Push Lab** icon on your Home Screen.

---

### iOS 26+ "Open as Web App" was turned off

- In iOS 26+, when adding a site to the Home Screen, an **"Open as Web App"** toggle appears.
- If turned off, iOS creates a Safari bookmark that opens inside Safari tabs, lacking PWA capabilities.
- **Fix:** Delete the icon, add it to the Home Screen again, and make sure **"Open as Web App"** remains **enabled**.

---

### State gets stuck or cannot subscribe

- Each Home Screen install maintains an isolated sandbox.
- If storage gets corrupted or permissions get out of sync:
  1. Tap **"Reset everything"** in the Maintenance section.
  2. If that fails, **delete the Home Screen icon** and add it again. Deleting the icon destroys the local sandbox and clears all stored state.

---

## 3. Local Development & Tunnel Issues

### "Cross-origin request blocked" in Next.js development

- **Symptom:** When accessing `next dev` over an HTTPS tunnel (e.g., ngrok or Cloudflare Tunnel), the dev server blocks requests or hot-reloading fails.
- **Fix:** Add your tunnel hostname to `ALLOWED_DEV_ORIGINS` in `.env.local`:
  ```bash
  ALLOWED_DEV_ORIGINS=your-tunnel-subdomain.ngrok-free.app
  ```

### Cannot register Service Worker on local IP (`http://192.168.x.x:3000`)

- **Symptom:** Safari gives a security or permission error when registering `sw.js`.
- **Fix:** Service Workers and Web Push **strictly require a secure context (HTTPS)**. Mobile Safari will not treat local LAN IP addresses as secure contexts. You must use `localhost` (desktop only) or an HTTPS tunnel / valid SSL domain for mobile devices.
