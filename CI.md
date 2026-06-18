# CI/CD — CodeMagic

All pipelines live in [`codemagic.yaml`](./codemagic.yaml). This doc explains
what each workflow does, what secrets to set, and how to go to production later.

## The four workflows

| Workflow                  | Flavor | Platform | Trigger        | Output                                  |
|---------------------------|--------|----------|----------------|-----------------------------------------|
| `user-app-android-dev`    | user   | Android  | push `develop` | APK → **Firebase App Distribution**     |
| `driver-app-android-dev`  | driver | Android  | push `develop` | APK → **Firebase App Distribution**     |
| `user-app-ios-dev`        | user   | iOS      | push `develop` | IPA → **TestFlight** (internal testers) |
| `driver-app-ios-dev`      | driver | iOS      | push `develop` | IPA → **TestFlight** (internal testers) |

Every workflow: `flutter pub get` → `flutter analyze` → `flutter test` →
inject Firebase config → build → publish. Pub/CocoaPods caches are enabled.
Tester group on Android is **`internal-testers`**; iOS goes to internal
TestFlight testers (no Apple beta review).

## Triggering

Only a **push to `develop`** runs builds (keeps `main`/every-commit quiet during
early dev). Create and push the branch:
```bash
git checkout -b develop && git push -u origin develop
```

## Environment variables (set in the CodeMagic UI)

Create a variable **group** named **`depanini_secrets`** (App settings →
Environment variables) and add the following. Mark every one **Secure**.

| Variable                          | Used by            | What it is                                                            |
|-----------------------------------|--------------------|----------------------------------------------------------------------|
| `MAPBOX_ACCESS_TOKEN`             | all 4              | Mapbox **public** token (`pk....`). Passed as `--dart-define`.        |
| `FIREBASE_SERVICE_ACCOUNT_JSON`   | Android x2         | Full service-account JSON with **Firebase App Distribution Admin**.   |
| `FIREBASE_ANDROID_APP_ID_USER`    | user-android       | Firebase Android App ID for `com.depanini.app` (`1:NNN:android:HEX`). |
| `FIREBASE_ANDROID_APP_ID_DRIVER`  | driver-android     | Firebase Android App ID for `com.depanini.driver`.                   |
| `ANDROID_GOOGLE_SERVICES_USER`    | user-android       | **base64** of the user `google-services.json`.                       |
| `ANDROID_GOOGLE_SERVICES_DRIVER`  | driver-android     | **base64** of the driver `google-services.json`.                     |
| `IOS_GOOGLE_SERVICE_INFO_USER`    | user-ios           | **base64** of the user `GoogleService-Info.plist`.                   |
| `IOS_GOOGLE_SERVICE_INFO_DRIVER`  | driver-ios         | **base64** of the driver `GoogleService-Info.plist`.                 |

> Note: `GOOGLE_MAPS_API_KEY` is **not** used — this project uses Mapbox.
> The token variable is `MAPBOX_ACCESS_TOKEN`.

Make a base64 value:
```bash
base64 -w0 android/app/src/user/google-services.json        # Linux
base64 -i  ios/config/user/GoogleService-Info.plist | pbcopy # macOS
```

## iOS code signing (App Store Connect API integration)

The iOS workflows use **automatic** signing via Apple's App Store Connect API.
You must set this up once in CodeMagic:

1. Team settings → **Integrations → App Store Connect → Connect**.
2. Add an API key (Issuer ID, Key ID, `.p8` file) from App Store Connect
   (Users and Access → Integrations → App Store Connect API).
3. **Name the integration exactly `app_store_connect`** — it must match the
   `integrations: { app_store_connect: app_store_connect }` line in
   `codemagic.yaml`.
4. `xcode-project use-profiles` (already in the scripts) fetches/applies the
   provisioning profiles at build time.

Guide: https://docs.codemagic.io/yaml-code-signing/signing-ios/

### iOS Option B — ad-hoc + Firebase App Distribution (instead of TestFlight)
If you registered your iPhone's **UDID** with Apple and prefer ad-hoc:
- change `ios_signing.distribution_type` from `app_store` to `ad_hoc`,
- remove the `app_store_connect` publishing block,
- publish via a `firebase:` block with an iOS `app_id` (like the Android jobs).
Your device UDID must be in the provisioning profile or the app won't install.
See the same guide, "Ad Hoc" section. (Default in this repo is **TestFlight**.)

## Where artifacts land
- **Android:** Firebase Console → App Distribution → `internal-testers` get an
  email/notification. APK also downloadable from the CodeMagic build page.
- **iOS:** App Store Connect → TestFlight. Internal testers (App Store Connect
  users with the Tester role) can install via the TestFlight app — no review.

## First-build expectations
- First builds are slowest: cold caches + (iOS) CocoaPods + profile fetch.
  Expect **~10–20 min** for iOS and **~6–12 min** for Android initially.
  Subsequent builds are faster thanks to the dependency cache.
- iOS will fail until the `user` and `driver` **Xcode schemes** exist
  (see README §6) and the App Store Connect integration is connected.

## Going to production later (stubs)
`codemagic.yaml` ends with **commented-out** `*-prod` workflow stubs that:
- trigger on **`main`** instead of `develop`,
- build signed **release** artifacts (Android App Bundle with a real keystore;
  iOS release),
- publish to the Play Store `internal` track / TestFlight.

To enable: uncomment, upload an Android keystore in the CodeMagic UI, add a
`google_play` service-account credential, then push to `main`.
