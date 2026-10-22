# CI/CD Pipeline & Vercel Deployment

Complete guide to the Continuous Integration (CI) and Continuous Deployment (CD) architecture for the Push Lab project.

---

## 1. Pipeline Architecture Overview

The project uses a two-tier CI/CD architecture:

1. **Continuous Integration (GitHub Actions):** Gatekeeper for code quality, formatting, type safety, and build integrity on every push and pull request to `main`.
2. **Continuous Deployment (Vercel Git Integration):** Automated production deployment to Vercel upon successful commits to `main`.

```
                    ┌───────────────────────────────┐
                    │       Git Push to main        │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │   GitHub Actions CI    │      │  Vercel CD Deployment  │
       │                        │      │                        │
       │  1. Prettier Check     │      │  1. Read Env Vars      │
       │  2. ESLint Check       │      │  2. Compile Bundle     │
       │  3. TypeScript Check   │      │  3. Deploy to Stable   │
       │  4. Next.js Build      │      │     Production Domain  │
       └────────────────────────┘      └────────────────────────┘
```

---

## 2. Continuous Integration: GitHub Actions

The workflow is defined in [`.github/workflows/ci.yml`](file:///c:/MarmikSoni/ios-webpush/.github/workflows/ci.yml).

### Triggers & Concurrency

- Runs automatically on:
  - `push` to `main`
  - `pull_request` to `main`
- **Concurrency Control:** Cancels in-progress runs for the same branch or PR when new commits are pushed, saving build minutes and eliminating redundant builds:
  ```yaml
  concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: true
  ```

### Caching Strategy

- **pnpm Store Cache:** Managed by `actions/setup-node@v4` with `cache: "pnpm"`. Packages are resolved from cache rather than re-downloaded across runs.
- **Deterministic Install:** Uses `pnpm install --frozen-lockfile` to ensure exact dependency tree matching `pnpm-lock.yaml`.

### Granular Verification Stages

Each check runs as an independent step with clear output in the GitHub Actions dashboard:

| Step                   | Command             | What it validates                                                                                   |
| :--------------------- | :------------------ | :-------------------------------------------------------------------------------------------------- |
| **Code Formatting**    | `pnpm format:check` | Verifies all files follow the project's Prettier formatting rules without discrepancies.            |
| **Code Linting**       | `pnpm lint`         | Runs ESLint 9 using `eslint-config-next` with zero warnings or errors.                              |
| **Type Safety**        | `pnpm typecheck`    | Executes `tsc --noEmit` with strict TypeScript checks.                                              |
| **Build Verification** | `pnpm build`        | Executes full Next.js production build with Turbopack, checking static routes and server endpoints. |

---

## 3. Continuous Deployment: Vercel

Deployment is handled natively by Vercel's GitHub Integration:

- Whenever code is pushed to `main`, Vercel automatically builds and deploys to your **Production Domain** (e.g. `https://your-project.vercel.app`).
- Pull requests generate ephemeral **Preview Deployments**.

### Vercel Environment Variables Checklist

Configure these **4 variables** in the [Vercel Project Dashboard](https://vercel.com) under **Settings &rarr; Environment Variables**:

| Variable Name                  | Environment          | Value Description                                                                                |
| :----------------------------- | :------------------- | :----------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Production & Preview | The URL-safe base64 VAPID public key. Required at build time.                                    |
| `VAPID_PRIVATE_KEY`            | Production & Preview | The URL-safe base64 VAPID private key.                                                           |
| `VAPID_SUBJECT`                | Production & Preview | A valid contact URL, e.g. `mailto:you@yourdomain.com` _(must have no spaces or angle brackets)_. |
| `TESTER_KEY`                   | Production & Preview | Secret password/passphrase entered in the Push Lab UI to authorize test push requests.           |

> [!NOTE]
> `ALLOWED_DEV_ORIGINS` is **not needed** on Vercel; it is strictly used during local `next dev` execution.

### Stable Origin Rule for iOS Web Push

- iOS push subscriptions, notification permissions, and Home Screen installations are **strictly bound to the exact origin domain**.
- **Important:** Always test Web Push on your **stable production domain** (`https://your-project.vercel.app` or your custom domain).
- Do not test Web Push on temporary preview URLs (`https://*-git-branch-team.vercel.app`), as preview URLs change on every push, breaking the Home Screen install and invalidating tokens.

---

## 4. Local Pre-Push Verification

Before pushing to `main`, you can run the entire CI verification suite locally with a single command:

```bash
pnpm hygiene
```

This runs:

1. `pnpm format:check` (Prettier check)
2. `pnpm lint` (ESLint check)
3. `pnpm typecheck` (TypeScript check)
4. `pnpm build` (Next.js production build)

If all four pass locally, your commit is guaranteed to pass GitHub Actions CI.
