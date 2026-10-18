# Depanini

On-demand towing marketplace for Tunisia (Uber/Bolt-style). A TypeScript
monorepo: one React Native (Expo) codebase that ships as **two apps**, plus a
Node.js API.

| Variant  | App name        | Bundle ID             | Audience          | Brand |
| -------- | --------------- | --------------------- | ----------------- | ----- |
| `user`   | Depanini        | `com.depanini.app`    | Customers         | blue  |
| `driver` | Depanini Driver | `com.depanini.driver` | Tow-truck drivers | amber |

> **Phase 1 = scaffolding only.** No feature logic yet. Both variants open a
> placeholder map of Tunis with an API health indicator, to prove the
> toolchain is wired up end to end.
>
> The previous Flutter implementation of Phase 1 is tagged `flutter-phase1`.

**Stack:** Expo (React Native, Expo Router, TanStack Query) · NestJS on Fastify ·
PostgreSQL + PostGIS (Drizzle ORM) · Firebase (Auth, Cloud Messaging) · Mapbox
(`@rnmapbox/maps`) · EAS Build/Submit · GitHub Actions · pnpm + Turborepo.

---

## 1. Project structure

```
apps/
├── mobile/                     # Expo app, both variants
│   ├── app.config.ts             # variant → name, bundle id, Firebase files, plugins
│   ├── eas.json                  # EAS build profiles (dev clients + 4 CI builds)
│   ├── .env.example              # EXPO_PUBLIC_* template
│   ├── firebase/<variant>/       # Firebase native config (git-ignored, see §3)
│   └── src/
│       ├── app/                  # Expo Router routes; _layout.tsx guards signed-in/out screens
│       ├── variant/              # variants.json + typed accessors (replaces flavors)
│       ├── config/env.ts         # validated EXPO_PUBLIC_* values
│       ├── theme/                # light/dark palette tinted per variant
│       ├── firebase/             # init status + current ID token
│       ├── auth/                 # session (AuthProvider), Firebase Auth calls, error messages
│       ├── api/                  # API client (attaches ID token) + queries (health, me)
│       ├── ui/                   # shared form components (TextField, ChoiceField, Button)
│       └── features/             # one folder per feature (auth/, account/, profile/, map/, status/)
├── api/                        # NestJS (Fastify adapter), ESM
│   ├── src/
│   │   ├── config/               # zod-validated env, fails fast at boot
│   │   ├── db/                   # Drizzle + pg pool, schema.ts
│   │   ├── auth/                 # FirebaseAuthGuard (verifies ID tokens)
│   │   ├── accounts/             # GET /me (creates the account on first sign-in), DELETE /me, PUT /me/{customer,driver}-profile
│   │   ├── common/               # ZodValidationPipe (request bodies via shared schemas)
│   │   └── health/               # GET /health
│   ├── drizzle/                  # SQL migrations (0000 enables PostGIS)
│   ├── test/                     # e2e tests (supertest over Fastify)
│   └── Dockerfile                # Cloud Run image (build from repo root)
packages/
└── shared/                     # zod schemas + types used by app AND API
docker-compose.yml              # local Postgres + PostGIS
.github/workflows/              # CI, EAS builds, API deploy stub (see CI.md)
```

The shared package is the point of having TypeScript on both ends: the API
returns a `HealthResponse` and the app validates the response with the very
same `healthResponseSchema`.

---

## 2. First-time local setup

### Prerequisites

- **Node.js 24** (`.nvmrc`) and **pnpm** (`npm i -g pnpm`; the exact version is pinned in `package.json`)
- **Docker** (for the local database)
- For running the app on a device/emulator: **Android Studio** (SDK + emulator)
  and/or, on a Mac, **Xcode**. Not needed to build in the cloud with EAS.
- For EAS: an Expo account, then `npx eas-cli@latest login`

### Steps

```bash
# 1. Install everything (all workspaces)
pnpm install

# 2. Local env files (NOT committed) from the templates
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
#    → edit apps/mobile/.env and paste your Mapbox PUBLIC token (pk....)

# 3. Database: start Postgres+PostGIS and run migrations
pnpm db:up
pnpm --filter @depanini/api db:migrate

# 4. Firebase config files: see §3
```

The EAS project (`@ayoub1994/depanini`) is already linked via `EAS_PROJECT_ID`
in `app.config.ts`; ask the owner to add you to it on expo.dev.

---

## 3. Firebase config (per variant)

Each variant is a separate Firebase app (different bundle IDs), registered in
the `depanini-dev` project. Their native config files are **git-ignored**.
Download them with the Firebase CLI (`npm i -g firebase-tools`, `firebase login`):

```bash
cd apps/mobile

# USER app (com.depanini.app)
firebase apps:sdkconfig ANDROID 1:849858510710:android:4fe528092e458b30568457 -o firebase/user/google-services.json
firebase apps:sdkconfig IOS     1:849858510710:ios:6b8982e71464ddbf568457     -o firebase/user/GoogleService-Info.plist

# DRIVER app (com.depanini.driver)
firebase apps:sdkconfig ANDROID 1:849858510710:android:7adb45b0fedd299f568457 -o firebase/driver/google-services.json
firebase apps:sdkconfig IOS     1:849858510710:ios:0524d3b9372f46fa568457     -o firebase/driver/GoogleService-Info.plist
```

`app.config.ts` picks the files for the active variant. **When they are
missing, the app still builds and runs:** the React Native Firebase config
plugins are skipped, and in debug builds a small "Firebase not configured"
banner is shown. Same behavior as the Flutter version.

In EAS builds the files come from EAS **file** environment variables instead
(see CI.md).

---

## 4. Running

### API

```bash
pnpm db:up                                  # if not running
pnpm --filter @depanini/api start:dev       # http://localhost:3000/health
```

`GET /health` returns `{ status, timestamp, db }`: 200 when the database is
reachable, 503 (`status: "degraded"`) when it is not.

### Firebase Auth emulator (local sign-in)

Sign-in can run against a local Firebase Auth emulator instead of the real
project: no console setup, throwaway accounts, and reset emails are printed
instead of sent.

```bash
pnpm emulators                              # Auth on :9099, UI on http://127.0.0.1:4000
```

Then point both sides at it (both lines are in the `.env.example` files):

- API: `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` in `apps/api/.env`. The API
  refuses to start with it when `NODE_ENV=production`.
- Mobile: `EXPO_PUBLIC_AUTH_EMULATOR_URL` (Android emulator: `http://10.0.2.2:9099`)
  and `EXPO_PUBLIC_WEB_AUTH_EMULATOR_URL` (`http://localhost:9099`) in `apps/mobile/.env`.

Remove those lines to use the real `depanini-dev` project.

### End-to-end flow check

`pnpm e2e:flow` walks the whole customer + driver flow (profiles, estimate,
request, presence, nearby, offer, accept, job, cancel) over HTTP against a
running stack, checks each response against the `@depanini/shared` schemas and
deletes its two throwaway accounts at the end. It needs the built shared
package, Postgres, the Auth emulator and the API started with the emulator:

```bash
pnpm --filter @depanini/shared build
pnpm db:up
pnpm emulators                              # own terminal
pnpm --filter @depanini/api start:dev       # own terminal
pnpm e2e:flow                               # E2E_API_URL, E2E_AUTH_EMULATOR override the defaults
```

It prints one line per step and exits non-zero on the first failure. Add steps
to the `STEPS` list in `scripts/e2e/flow.mjs`.

### Mobile

The app uses native modules (Mapbox, Firebase), so it runs in a **development
build**, not Expo Go. Build and install one per variant once, then iterate
with the dev server:

```bash
cd apps/mobile

# Local native build (needs Android Studio / Xcode):
pnpm android:user        # or android:driver, ios:user, ios:driver

# ...or build the dev client in the cloud and install it from the link:
npx eas-cli@latest build --profile development-user --platform android

# Then, for day-to-day work, start Metro for the variant you are running:
pnpm start:user          # or start:driver
```

The variant must match on both sides: a driver dev build needs `start:driver`.
The dev server serves the app config (name, `extra.appVariant`).

### Web (quick UI checks, no emulator)

```bash
cd apps/mobile
pnpm web:user            # or web:driver → http://localhost:8081
```

When switching between `web:user` and `web:driver`, add `--clear`
(`pnpm web:driver --clear`): Metro caches the bundle with the previous variant
baked in, so you would otherwise see the wrong app.

The web build is a development convenience, not a shipped target. Native-only
pieces have web stand-ins: `TunisMap.web.tsx` (Mapbox GL JS instead of the
native SDK) and `firebase.web.ts` (Firebase JS SDK with the project's web app,
configured by `EXPO_PUBLIC_FIREBASE_WEB_CONFIG`). It calls the API at
`EXPO_PUBLIC_WEB_API_URL`; the API must allow the origin via `CORS_ORIGINS`
(already in `apps/api/.env.example`).

### Share (try the web app from a phone, anywhere)

```bash
pnpm db:up
pnpm share               # or: pnpm share driver | pnpm share both
```

Opens Cloudflare quick tunnels (needs `cloudflared`:
`winget install Cloudflare.cloudflared`, no account) to the web app, the API
and the Auth emulator, starts the API and Expo web with those public URLs, and
prints the app link. `both` shares the customer app (8081) and the driver app
(8082) at once, with a tunnel each, and prints a `Customer` and a `Driver`
link. Stop any API or Expo already running on 3000/8081 (and 8082 for `both`) first;
a running Auth emulator is reused. The URLs are random and change on every
run, and anyone with them can use the app until you press Ctrl+C. Only
emulator accounts exist there.

### Testing from outside Tunisia

Every location must be inside Tunisia, so the real GPS of a tester abroad never
works. In the driver app, development builds (and any build made with
`EXPO_PUBLIC_ENABLE_TEST_LOCATION=1`) show a **Test location** row on the home
screen: **Set on map** picks a place in Tunisia, which is then sent as the
driver's location (no location permission needed), and **Use device GPS**
switches back. On web the choice survives a reload (localStorage); on native it
lasts until the app is closed. Customers can move the pickup pin anywhere in
Tunisia; it starts in Tunis when the GPS is outside the country.

**Reaching the API from a device:** `localhost` is the device itself. Use
`http://10.0.2.2:3000` from the Android emulator, or your computer's LAN IP
from a physical device, in `EXPO_PUBLIC_API_URL`.

---

## 5. Secrets & environment variables

| Where          | Mobile                                                         | API                          |
| -------------- | -------------------------------------------------------------- | ---------------------------- |
| **Local**      | `apps/mobile/.env` + `apps/mobile/firebase/<variant>/`          | `apps/api/.env`              |
| **CI / cloud** | EAS environment variables (plain, secret and file; see CI.md)  | Cloud Run service variables  |

- Mobile values are read in `src/config/env.ts`. `EXPO_PUBLIC_*` values are
  **inlined into the app bundle**, so only public values go there (the Mapbox
  `pk.` token is public by design).
- The API validates its environment with zod at boot (`src/config/env.ts`) and
  refuses to start with a readable error if something is missing.
- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (Mapbox **secret** `sk.` token with
  `DOWNLOADS:READ`) is only needed when building native code: export it in your
  shell for local native builds; it is an EAS secret for cloud builds.

**Never committed** (see `.gitignore`): `.env` files, `google-services.json`,
`GoogleService-Info.plist`, service-account keys, keystores and signing files.
Committed templates end in `.example`.

---

## 6. Native configuration

There are no `android/` or `ios/` folders in git. Expo generates them
(Continuous Native Generation) from `app.config.ts` and config plugins at build
time (`npx expo prebuild` locally, automatically on EAS). Do not edit generated
native code by hand; change the config instead. This replaces the manual Xcode
scheme setup the Flutter flavors needed.

Already configured in `app.config.ts`:

- **Variant identity**: name, bundle ID / application ID, URL scheme, splash color.
- **Location permissions**: Android `ACCESS_FINE_LOCATION` +
  `ACCESS_COARSE_LOCATION`; iOS `NSLocationWhenInUseUsageDescription` +
  `NSLocationAlwaysAndWhenInUseUsageDescription` (iOS crashes without these
  the moment location is requested).
- **Mapbox**: `@rnmapbox/maps` plugin (native vector SDK). The public token is
  set at runtime from `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`.
- **Firebase**: `@react-native-firebase/{app,auth,messaging}` plugins, and
  `expo-build-properties` with `useFrameworks: "dynamic"` on iOS (required by
  React Native Firebase's Swift Package Manager setup).

---

## 7. Database & migrations

Drizzle ORM over `pg`, Postgres 17 + PostGIS 3.5 locally (`docker-compose.yml`).

```bash
pnpm --filter @depanini/api db:generate   # create a migration from src/db/schema.ts changes
pnpm --filter @depanini/api db:migrate    # apply pending migrations
```

The first migration enables the `postgis` extension. Tables arrive with their
features: `users` holds accounts, and `customer_profiles` and `driver_profiles`
their profiles (see `GLOSSARY.md`).

---

## 8. CI/CD

GitHub Actions + EAS. Every PR runs the quality gates. EAS builds are started by
hand at milestones (`gh workflow run eas-build.yml --ref develop`), which runs the
gates again and queues four builds (user/driver × Android/iOS). Android goes to EAS internal
distribution and iOS to TestFlight. Details, the secrets checklist, and the
API deploy stub are in **[CI.md](./CI.md)**.

---

## 9. Quality gates

```bash
pnpm lint          # ESLint (one flat config at the root)
pnpm typecheck     # tsc in every package
pnpm test          # Jest (mobile), Vitest (API unit + e2e, shared)
pnpm format:check  # Prettier
```

All of these run in CI. The API e2e tests need Postgres: run `pnpm db:up`
first. They use a separate `depanini_test` database (override with
`TEST_DATABASE_URL`), which they create and migrate themselves, so dev data is
never touched. CI runs the same PostGIS image as a service container.
Turborepo caches results, so unchanged packages are skipped.
