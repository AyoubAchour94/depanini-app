# CI/CD: GitHub Actions + EAS

Workflows live in [`.github/workflows/`](./.github/workflows). Mobile builds
run on **EAS Build** (Expo's cloud) and are only queued by GitHub Actions.

| Workflow         | Trigger                | What it does                                                      |
| ---------------- | ---------------------- | ----------------------------------------------------------------- |
| `ci.yml`         | pull requests (+ called by `eas-build.yml`) | format check, lint, typecheck, tests for all packages |
| `eas-build.yml`  | push to `develop`, manual | runs `ci.yml`, then queues the 4 EAS builds below          |
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

## API deploy (stub)

`api-deploy.yml` is **manual-only** until the infrastructure exists. To turn
it on:

1. In GCP (`europe-west1`, same project as Firebase): create an Artifact
   Registry Docker repo, a Cloud SQL Postgres instance (enable PostGIS), and
   the Cloud Run service `depanini-api` with `DATABASE_URL` and
   `FIREBASE_PROJECT_ID` set (`PORT` is injected by Cloud Run).
2. Set up Workload Identity Federation for this GitHub repo and a deploy
   service account (roles: Cloud Run Admin, Artifact Registry Writer, Service
   Account User).
3. Add GitHub repository **variables**: `GCP_ARTIFACT_REPO`,
   `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`.
4. Decide how migrations run against Cloud SQL (Cloud Run job or Cloud SQL
   Auth Proxy step) and add it before the deploy step.
5. Add a `push: branches: [develop]` trigger when ready.

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
