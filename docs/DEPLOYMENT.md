# Deployment & Hosting Guide

Detailed guidelines for deploying the Push Lab utility to Vercel, Node.js servers, and local HTTPS tunnels.

---

## 1. Hosting Requirements

### A. Stable Origin (Critical for iOS)

On iOS and iPadOS:

- The Home Screen PWA installation, user notification permission, and push subscription are **permanently tied to the exact origin** (e.g. `https://push.example.com`).
- If you deploy to rotating temporary URLs (such as Vercel preview URLs or temporary ngrok addresses):
  - Every time the URL changes, existing Home Screen icons will point to the old URL.
  - Subscriptions tied to the old origin will fail to receive pushes.
  - You will be forced to delete the Home Screen app and reinstall it on every commit.
- **Rule:** Always conduct iOS testing on a **stable production domain** (e.g., `https://your-project.vercel.app` or a custom domain).

### B. HTTPS Requirement

Web Push and Service Workers strictly mandate a secure context (`isSecureContext === true`). iOS Safari will not treat local LAN IP addresses (e.g. `http://192.168.1.100:3000`) as secure.

---

## 2. Deploying to Vercel (Recommended)

1. **Push your repository** to GitHub, GitLab, or Bitbucket.
2. In the [Vercel Dashboard](https://vercel.com), click **Add New Project** and select your repository.
3. Configure the following **Environment Variables** under **Settings &rarr; Environment Variables**:

| Variable                       | Target Environment   | Value / Description                                          |
| :----------------------------- | :------------------- | :----------------------------------------------------------- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Production & Preview | Base64 URL-safe VAPID public key. Required at build time.    |
| `VAPID_PRIVATE_KEY`            | Production & Preview | Base64 URL-safe VAPID private key.                           |
| `VAPID_SUBJECT`                | Production & Preview | `mailto:your-email@domain.com` or `https://yourdomain.com`.  |
| `TESTER_KEY`                   | Production & Preview | Shared secret passphrase for authenticating test dispatches. |

> [!TIP]
> `ALLOWED_DEV_ORIGINS` is **not required** on Vercel; it is strictly used during local `next dev` execution.

4. Click **Deploy**. Vercel will automatically build the Next.js application using `pnpm`.

---

## 3. Self-Hosted Node.js / Docker

To run the application on your own server or virtual machine:

### Build & Run

```bash
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Build production bundle
pnpm build

# 3. Start production server
pnpm start -p 3000
```

### Environment Configuration

Provide the variables via system environment or a `.env` file in the root directory:

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY="<public-key>"
VAPID_PRIVATE_KEY="<private-key>"
VAPID_SUBJECT="mailto:admin@example.com"
TESTER_KEY="<secret-key>"
```

### Reverse Proxy (Nginx Example)

Ensure your reverse proxy forwards host and protocol headers so that `app/api/push/route.ts` derives the correct site origin:

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

---

## 4. Local Testing via HTTPS Tunnels

If you must test changes locally on a real phone before deploying, use an HTTPS tunnel:

### Option A: ngrok

```bash
# 1. Start your local dev server
pnpm dev

# 2. In another terminal, start ngrok
ngrok http 3000
```

Add the generated hostname to `.env.local`:

```bash
ALLOWED_DEV_ORIGINS=your-id.ngrok-free.app
```

### Option B: Cloudflare Tunnel (`cloudflared`)

```bash
cloudflared tunnel --url http://localhost:3000
```

Add the `*.trycloudflare.com` domain to `ALLOWED_DEV_ORIGINS`.

---

## 5. PWA Icon & Asset Optimization

- **Full-Bleed Icons:** Apple automatically masks Home Screen icons to rounded squircles. Transparent rounded corners in PNG icons cause iOS to render unsightly black corners. Push Lab generates full-bleed square icons dynamically at [`app/icons/[size]/route.tsx`](file:///c:/MarmikSoni/ios-webpush/app/icons/[size]/route.tsx) using `@vercel/og` (`ImageResponse`).
- **Cache-Control for Service Worker:** [`next.config.ts`](file:///c:/MarmikSoni/ios-webpush/next.config.ts) sets `Cache-Control: no-cache, no-store, must-revalidate` for `/sw.js` to ensure browsers fetch Service Worker updates immediately without stale HTTP caching.
