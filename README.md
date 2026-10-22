# Push Lab

An iOS/iPadOS Web Push diagnostic tool built with Next.js. It shows exactly what Web Push can and cannot do on a given iPhone or iPad, in two contexts: a normal Safari tab and the site installed on the Home Screen as a web app.

This is a test utility, not a product.

## Setup

```bash
# Install dependencies
pnpm install

# Generate VAPID keys
pnpm exec web-push generate-vapid-keys

# Copy .env.example to .env.local and fill in the values
cp .env.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your public key>
VAPID_PRIVATE_KEY=<your private key>
VAPID_SUBJECT=mailto:you@your-real-domain.com
TESTER_KEY=<any long random string>
ALLOWED_DEV_ORIGINS=
```

## Run

```bash
# Development
pnpm dev

# Production
pnpm build && pnpm start
```

## Hosting

Use **one stable HTTPS origin**. The Home Screen install, permission, and subscription all belong to the origin, so a new tunnel URL means reinstalling the app and resubscribing.

If you are using `next dev` through an HTTP tunnel (e.g. ngrok, Cloudflare Tunnel), set `ALLOWED_DEV_ORIGINS` in `.env.local` to the tunnel hostname(s), comma-separated:

```
ALLOWED_DEV_ORIGINS=abc123.ngrok-free.app,my-tunnel.trycloudflare.com
```

## Test Matrix

Tick off each combination:

| Context         | State       | Legacy | Declarative |
| --------------- | ----------- | ------ | ----------- |
| Safari tab      | Foreground  | ☐      | ☐           |
| Home Screen app | Foreground  | ☐      | ☐           |
| Home Screen app | Background  | ☐      | ☐           |
| Home Screen app | Locked      | ☐      | ☐           |
| Home Screen app | Swiped away | ☐      | ☐           |

### Declarative without JavaScript

1. Subscribe via `window.pushManager` (the declarative button).
2. Turn off "Auto-register service worker on load".
3. Unregister the service worker.
4. Send a **declarative** push with a 10 s delay.
5. Lock the phone immediately.
6. A banner should still appear (the OS displays it, no JS ran).
7. The Delivery log stays empty because no service worker was active.

## Troubleshooting

| Symptom                       | Fix                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 403 `BadJwtToken`             | Check `VAPID_SUBJECT` — must be a valid `mailto:` or `https://` URL with no spaces or angle brackets.                                            |
| 403 `VapidPkHashMismatch`     | The subscription was created with a different VAPID public key. Unsubscribe and subscribe again.                                                 |
| 410 Gone                      | Subscription expired. Subscribe again.                                                                                                           |
| Nothing shows after 201       | Check Settings → Notifications → Push Lab. Also check Focus mode and Low Power Mode.                                                             |
| Push APIs missing in Safari   | Push is only available from the Home Screen icon, not in a browser tab. Make sure "Open as Web App" was on when adding to Home Screen (iOS 26+). |
| State stuck / can't subscribe | Delete the Home Screen icon and add it again. Each install has separate storage.                                                                 |
