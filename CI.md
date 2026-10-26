# CI/CD: GitHub Actions + EAS

Workflows live in [`.github/workflows/`](./.github/workflows). Mobile builds
run on **EAS Build** (Expo's cloud) and are only queued by GitHub Actions.

| Workflow         | Trigger                | What it does                                                      |
| ---------------- | ---------------------- | ----------------------------------------------------------------- |
| `ci.yml`         | pull requests (+ called by `eas-build.yml`) | format check, lint, typecheck, tests for all packages |
| `eas-build.yml`  | manual only (`gh workflow run eas-build.yml --ref develop`) | runs `ci.yml`, then queues the 4 EAS builds below. Not on every merge: each run uses 4 builds of EAS quota |
| `api-deploy.yml` | manual only (**stub**) | builds the API image and deploys it to Cloud Run                  |

## The four mobile builds

These replace the four CodeMagic workflows one for one:

| EAS profile          | Variant | Platform | Output                                                  |
| -------------------- | ------- | -------- | ------------------------------------------------------- |
| `user-android-dev`   | user    | Android  | APK → **EAS internal distribution** (install link / QR) |
| `driver-android-dev` | driver  | Android  | APK → **EAS internal distribution**                     |
| `user-ios-dev`       | user    | iOS      | IPA → **TestFlight** via EAS Submit (internal testers)  |
| `driver-ios-dev`     | driver  | iOS      | IPA → **TestFlight** via EAS Submit                     |

Profiles are defined in [`apps/mobile/eas.json`](./apps/mobile/eas.json). Each
sets `APP_VARIANT`, which `app.config.ts` turns into the app identity. There is
no Firebase App Distribution step: testers open the build page on expo.dev (or
scan its QR code) to install the APK.

`development-user` / `development-driver` are **dev client** profiles for
local development (see README §4). CI doesn't build them.

Run one by hand:

```bash
cd apps/mobile
npx eas-cli@latest build --profile driver-android-dev --platform android
```

## One-time setup checklist

### 1. Link the EAS project (done)

```bash
cd apps/mobile && npx eas-cli@latest init
```

Already done: the project is `@ayoub1994/depanini` and its id is in `EAS_PROJECT_ID` in `app.config.ts`. Only repeat this for a new project.
Both variants share the one EAS project.

### 2. GitHub secret

| Secret       | What it is                                                                    |
| ------------ | ----------------------------------------------------------------------------- |
| `EXPO_TOKEN` | Expo access token (expo.dev → Account settings → Access tokens). Lets CI run `eas`. |

That's the only GitHub secret the mobile pipeline needs. Everything else lives in EAS.

### 3. EAS environment variables

Create these on expo.dev → Project → Environment variables (or with
`eas env:set`). The build profiles use the **`preview`** environment; the
dev client profiles use **`development`**, so set them on both.

| Name                                | Type   | Visibility | Value                                                         |
| ----------------------------------- | ------ | ---------- | ------------------------------------------------------------- |
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`   | string | plain text | Mapbox **public** token (`pk....`)                             |
| `EXPO_PUBLIC_API_URL`               | string | plain text | API base URL (the Cloud Run URL once deployed)                 |
| `EXPO_PUBLIC_ENVIRONMENT`           | string | plain text | `dev`                                                          |
| `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`      | string | **secret** | Mapbox **secret** token (`sk....`) with `DOWNLOADS:READ`       |
| `GOOGLE_SERVICES_JSON_USER`         | file   | sensitive  | user `google-services.json`                                    |
| `GOOGLE_SERVICE_INFO_PLIST_USER`    | file   | sensitive  | user `GoogleService-Info.plist`                                |
| `GOOGLE_SERVICES_JSON_DRIVER`       | file   | sensitive  | driver `google-services.json`                                  |
| `GOOGLE_SERVICE_INFO_PLIST_DRIVER`  | file   | sensitive  | driver `GoogleService-Info.plist`                              |

For file variables, EAS uploads the file and sets the variable to its path on
the build machine. `app.config.ts` reads them by these exact names. Example:

```bash
eas env:set --environment preview --name GOOGLE_SERVICES_JSON_USER \
  --type file --value ./firebase/user/google-services.json --visibility sensitive
```

> If the Firebase files are not set, builds still succeed without Firebase
> (same as locally). That's handy before Firebase is ready, but easy to miss.
> Check the "Firebase not configured" banner in debug builds.

### 4. iOS signing and TestFlight

EAS manages certificates and provisioning profiles. The first time, run an iOS
build **interactively** from your machine for each variant so EAS can create
them with your Apple account. CI runs non-interactively and reuses them.

```bash
npx eas-cli@latest build --profile user-ios-dev --platform ios
npx eas-cli@latest build --profile driver-ios-dev --platform ios
```

For `--auto-submit` to TestFlight, create both apps in App Store Connect and
put their numeric **Apple ID** (App Store Connect → App Information) into
`submit.*.ios.ascAppId` in `eas.json`, replacing the `REPLACE_WITH_…`
placeholders. Then add an App Store Connect API key to EAS
(`eas credentials` → iOS → App Store Connect API Key) so submissions don't
need your Apple password.

Internal testers (App Store Connect users with access) get builds in the
TestFlight app without Apple beta review.

### 5. Android signing

EAS generates and stores an Android keystore per application ID on the first
build. Nothing to do; back it up from `eas credentials` before going to the
Play Store.

## API deploy (production runbook)

`api-deploy.yml` is **manual-only** (`workflow_dispatch`) until the
infrastructure below exists. One run does: build and push the image, run the
database migrations, deploy to Cloud Run. If the migration fails the run stops
before anything is deployed, so the old revision keeps serving.

### Set up once

1. **Database.** Any Postgres with PostGIS reachable over the internet.
   Recommended free option: Neon (PostGIS is available; migration `0000` runs
   `CREATE EXTENSION postgis`). Copy the connection string with
   `?sslmode=require`. Prefer the provider's pooled host, and keep (Cloud Run
   max instances x `DB_POOL_MAX`) under its connection limit. Cloud SQL works
   too (no free tier), but then the runner needs a way to reach it (public IP
   with authorized networks, or the Auth Proxy), which is why the workflow does
   not assume it.
2. **Firebase.** A production project (e.g. `depanini-prod`); its id is
   `FIREBASE_PROJECT_ID`.
3. **GCP** (`europe-west1`, same project as Firebase): an Artifact Registry
   Docker repo, and the Cloud Run service `depanini-api` with the variables
   from [`apps/api/.env.production.example`](./apps/api/.env.production.example):
   `DATABASE_URL` (from Secret Manager), `FIREBASE_PROJECT_ID`, `CORS_ORIGINS`
   (the admin app origin) and `PUSH_PROVIDER` (see `docs/push.md`). `PORT` is
   injected by Cloud Run. Health check path: `/health`. The hardening variables
   (rate limits, log level, timeouts) are added by #152: see #152.
4. **Workload Identity Federation** for this GitHub repo and a deploy service
   account (roles: Cloud Run Admin, Artifact Registry Writer, Service Account
   User).
5. **GitHub.** Repository **variables**: `GCP_ARTIFACT_REPO`,
   `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`. Create an
   environment named `production` (optionally with required reviewers as an
   approval gate) and add the **secret** `DATABASE_URL` to it.
6. Optionally add a `push: branches: [develop]` trigger once a deploy has
   succeeded by hand.

### Deploy

Actions, then "API deploy", then Run workflow. Check
`https://<service-url>/health` afterwards.

### Migrations

- Run by `scripts/api-migrate.sh`, which calls
  `pnpm --filter @depanini/api db:migrate` (Drizzle) with `DATABASE_URL`; it
  logs the target without the password.
- **Safe to re-run:** Drizzle records applied files in
  `drizzle.__drizzle_migrations`, so a run on an up-to-date database changes
  nothing.
- **Forward-only:** there are no down migrations. Write each migration so the
  previous API revision still works against it (add columns as nullable or with
  defaults; remove or rename in a later release, after the old code is gone).
  That is also what makes a code rollback safe.
- Dry-run it against a throwaway database (needs `pnpm db:up`):

  ```bash
  docker exec depanini-app-db-1 psql -U depanini -d postgres -c "CREATE DATABASE migrate_dry_run"
  DATABASE_URL=postgres://depanini:depanini@localhost:5432/migrate_dry_run scripts/api-migrate.sh
  # run it again: nothing is applied the second time
  docker exec depanini-app-db-1 psql -U depanini -d postgres -c "DROP DATABASE migrate_dry_run"
  ```

### Rollback

Roll back the code by sending traffic to the previous Cloud Run revision:

```bash
gcloud run revisions list --service depanini-api --region europe-west1
gcloud run services update-traffic depanini-api --region europe-west1 \
  --to-revisions <PREVIOUS_REVISION>=100
```

(or Console, Cloud Run, the service, Revisions, "Manage traffic"). Migrations
are not undone: because they are forward-only and written to be compatible with
the previous revision, the old code keeps working. If a migration itself was
wrong, fix it with a new forward migration and deploy again; restore from the
database provider's point-in-time backup only as a last resort.

Test the image locally first:

```bash
docker build -f apps/api/Dockerfile -t depanini-api .
docker run --rm -p 8080:8080 -e PORT=8080 \
  -e DATABASE_URL=postgres://depanini:depanini@host.docker.internal:5432/depanini \
  -e FIREBASE_PROJECT_ID=depanini-dev depanini-api
curl localhost:8080/health
```

## First-build expectations

- The CI job itself takes a few minutes (install + checks); the EAS jobs only
  queue builds and finish in about a minute.
- On EAS, first builds are the slowest (no caches): expect roughly **10–20 min
  for iOS** and **8–15 min for Android**, plus queue time on the free plan.
- iOS builds fail non-interactively until step 4 (credentials) has been done once.

## Going to production later

Add `*-prod` profiles in `eas.json` (store distribution, `environment:
"production"`, Android `app-bundle`), plus `submit` profiles for the Play Store
(`track: "internal"` with a Google service-account key) and App Store. Then add
a workflow triggered on `main`. EAS Update (OTA JS updates) can also be enabled
then.

## Publish the legal pages

The privacy policy and terms (French, Arabic, English) are templates in
`docs/legal/`, published as a static site by GitHub Pages (Jekyll, config in
`docs/_config.yml`, which keeps the rest of `docs/` out of the site). Pages is
**not enabled yet**; it is a repo setting, so do it once yourself:

1. Review and complete the texts first: every `[PLACEHOLDER]` (legal entity,
   address, contact email, retention, INPDP details) and the banner at the top
   of each page ("TEMPLATE — needs the owner's review").
2. GitHub, repo Settings, Pages: Source "Deploy from a branch", branch `main`,
   folder `/docs`, Save.
3. The pages appear at `https://ayoubachour94.github.io/depanini-app/legal/`
   (for example `.../legal/privacy-en/` and `.../legal/terms-en/`).

The apps link to those two English pages by default. To use another address
(a custom domain, another language), set `EXPO_PUBLIC_PRIVACY_URL` and
`EXPO_PUBLIC_TERMS_URL` in the EAS environment (mobile) and `VITE_PRIVACY_URL`
and `VITE_TERMS_URL` where the admin is built.
