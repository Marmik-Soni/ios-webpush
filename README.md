# Push Lab

An iOS/iPadOS Web Push diagnostic tool built with Next.js, TypeScript, and Tailwind CSS. It shows exactly what Web Push can and cannot do on a given iPhone or iPad in two runtime contexts: a normal Safari browser tab and the site installed on the Home Screen as a standalone web app.

> **Note:** This is an honest diagnostic utility, not a production consumer application. It is designed to capture ground truth behavior, raw exceptions, and APNs responses directly on Apple mobile hardware.

---

## Documentation Index

Explore our comprehensive technical documentation in the [`docs/`](docs/) directory:

- 📖 **[iOS & iPadOS Web Push Guide](docs/IOS_WEB_PUSH_GUIDE.md)**: Deep dive into Apple's Web Push architecture, APNs integration, the "no silent push" mandate, user gesture requirements, declarative push (iOS 18.4+), iOS 26+ UA freeze, and isolated storage sandboxes.
- 🏗️ **[Architecture & Design](docs/ARCHITECTURE.md)**: Component hierarchy, Service Worker lifecycle, defensive push parsing, IndexedDB event persistence, and timing-safe `/api/push` security.
- 🧪 **[Testing Matrix & Protocol](docs/TESTING_MATRIX.md)**: Full verification protocol covering Safari tabs vs. Home Screen web apps across foreground, background, locked screen, and swiped-away states, plus the "Declarative without JavaScript" test.
- 🛠️ **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)**: APNs HTTP status resolution (`403 BadJwtToken`, `403 VapidPkHashMismatch`, `410 Gone`, `413 Payload Too Large`), iOS Focus modes, Low Power Mode, and reset procedures.
- 🚀 **[Deployment & Hosting](docs/DEPLOYMENT.md)**: Vercel deployment checklist, HTTPS tunnels (ngrok/Cloudflare), stable origin rules, and dynamic PWA icons.

---

## Quick Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Generate VAPID Keypair

```bash
pnpm exec web-push generate-vapid-keys
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env.local` (or configure in your Vercel project dashboard):

```bash
cp .env.example .env.local
```

Set the values in `.env.local`:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your-generated-public-key>
VAPID_PRIVATE_KEY=<your-generated-private-key>
VAPID_SUBJECT=mailto:you@your-real-domain.com
TESTER_KEY=any-long-random-string-used-as-password
ALLOWED_DEV_ORIGINS=
```

---

## Running Locally & Production

```bash
# Start Next.js development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run all code hygiene checks (Prettier, ESLint, TypeScript)
pnpm format:check
pnpm lint
pnpm typecheck

# Export full codebase and verify code hygiene
pnpm codebase
```

---

## Hosting on Vercel

1. Push your repo to GitHub and import into Vercel.
2. In Vercel Project Settings &rarr; **Environment Variables**, add:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (`mailto:you@yourdomain.com` with no spaces or angle brackets)
   - `TESTER_KEY` (shared secret entered in the UI)
3. Deploy!
4. **Use your stable production domain** (`https://your-app.vercel.app` or custom domain). Do not test on temporary preview URLs, as iOS push subscriptions and Home Screen installs are strictly bound to the origin.

---

## Core Testing Matrix

Tick off each combination during on-device testing:

| Context                           | Application State                        | Classic SW Push  | Declarative Push |
| :-------------------------------- | :--------------------------------------- | :--------------: | :--------------: |
| **Safari Tab** (Negative Control) | Foreground                               | ❌ Expected Fail | ❌ Expected Fail |
| **Home Screen App** (PWA)         | **Foreground** (Active on screen)        |        ☐         |        ☐         |
| **Home Screen App** (PWA)         | **Background** (App minimized)           |        ☐         |        ☐         |
| **Home Screen App** (PWA)         | **Locked** (Display off)                 |        ☐         |        ☐         |
| **Home Screen App** (PWA)         | **Swiped Away** (Killed in App Switcher) |        ☐         |        ☐         |

### Declarative Without JavaScript Test (iOS 18.4+)

1. In Push Lab, tap **"Subscribe via window.pushManager (declarative)"**.
2. Turn off **"Auto-register service worker on load"**.
3. Tap **"Unregister service worker"** under Maintenance controls.
4. Send a **Declarative** push with a **10 s delay**.
5. Lock the phone immediately.
6. **Result:** The notification banner still appears on your Lock Screen. Open Push Lab—the Delivery Log remains empty because no JavaScript or Service Worker was executed!

---

## Troubleshooting Quick Reference

| Symptom                             | Cause & Solution                                                                                                                                               |
| :---------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **403 `BadJwtToken`**               | `VAPID_SUBJECT` must be a valid `mailto:` or `https://` URL with no spaces or angle brackets.                                                                  |
| **403 `VapidPkHashMismatch`**       | Subscription was created with a different VAPID key. Tap **Reset everything** and subscribe again.                                                             |
| **410 `Gone`**                      | Push token expired or revoked. Tap **Unsubscribe** and re-subscribe.                                                                                           |
| **Nothing shows after 201 Created** | Check iPhone **Settings &rarr; Notifications &rarr; Push Lab**. Also check Focus Modes and Low Power Mode.                                                     |
| **Push APIs missing**               | Push only works when launched from the **Home Screen icon**, not in a Safari tab. On iOS 26+, ensure _Open as Web App_ was enabled when adding to Home Screen. |
| **State stuck**                     | Tap **Reset everything**, or delete the Home Screen icon and install again (each install has isolated storage).                                                |
