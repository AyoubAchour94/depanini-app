# Depanini

On-demand towing marketplace for Tunisia (Uber/Bolt-style). One Flutter
codebase, **two flavors** that ship as two separate apps:


| Flavor   | App name        | Bundle ID             | Audience          |
| -------- | --------------- | --------------------- | ----------------- |
| `user`   | Depanini        | `com.depanini.app`    | Customers         |
| `driver` | Depanini Driver | `com.depanini.driver` | Tow-truck drivers |


> **Phase 1 = scaffolding only.** No feature logic yet. Both flavors currently
> open a placeholder map of Tunis to prove the toolchain is wired up.

**Stack:** Flutter (stable) · Firebase (Auth/Firestore/Functions/Messaging/
Storage) · Mapbox (`flutter_map` + Directions API) · CodeMagic CI/CD.

---

## 1. Project structure

```
apps/
├── lib/
│   ├── main_user.dart          # entry point → USER flavor
│   ├── main_driver.dart        # entry point → DRIVER flavor
│   ├── app.dart                # shared MaterialApp shell (both flavors)
│   ├── flavors/                # flavor config, feature flags
│   │   ├── flavor.dart           # enum Flavor { user, driver }
│   │   ├── flavor_config.dart    # appName, bundleId, brandColor, features
│   │   └── feature_flags.dart    # isDriverApp, ...
│   ├── core/                   # infrastructure (no business logic)
│   │   ├── constants/            # app_constants.dart (Tunis coords)
│   │   ├── theme/                # app_theme.dart (Material 3, per-flavor seed)
│   │   ├── env/                  # env.dart (reads --dart-define)
│   │   ├── firebase/             # firebase_initializer.dart
│   │   ├── maps/                 # map_config.dart (Mapbox, token from env)
│   │   ├── error/                # app_exception.dart
│   │   └── utils/                # (empty – helpers later)
│   ├── features/               # one folder per feature (READMEs inside)
│   │   ├── auth/  trips/  profile/   # placeholders for later phases
│   │   └── map/                  # map_test_screen.dart (Phase 1 placeholder)
│   └── shared/                 # cross-feature widgets/ + models/
├── functions/                  # Cloud Functions (TS) — healthCheck stub
├── config/                     # dart_define.example.json (env template)
├── android/                    # product flavors in app/build.gradle.kts
├── ios/                        # flavor xcconfigs in ios/Flutter/
├── codemagic.yaml              # CI/CD: 4 workflows
├── firebase.json / .firebaserc # Firebase CLI config
├── README.md                   # ← you are here
└── CI.md                       # CI/CD deep-dive
```

---

## 2. First-time local setup

### Prerequisites

- Flutter (stable) + Dart — `flutter doctor` should be green
- For iOS: a Mac with Xcode + CocoaPods
- Node.js 22 + Firebase CLI (`npm i -g firebase-tools`) for Cloud Functions
- FlutterFire CLI: `dart pub global activate flutterfire_cli`

### Steps

```bash
# 1. Install Dart/Flutter packages
flutter pub get

# 2. Create your local env file (NOT committed) from the template
cp config/dart_define.example.json config/dart_define.json
#    → edit config/dart_define.json and paste your Mapbox PUBLIC token (pk....)

# 3. Generate Firebase config (see §3) — run flutterfire configure

# 4. Run a flavor (see §4)
```

---

## 3. Firebase config (FlutterFire)

Firebase config files contain project keys and are **git-ignored**. You
generate them with the FlutterFire CLI. Because each flavor has its **own
bundle ID**, register both apps. Run `flutterfire configure` **once per
flavor**, pointing each at a separate generated options file:

```bash
# USER app (com.depanini.app)
flutterfire configure \
  --project=depanini-dev \
  --android-package-name=com.depanini.app \
  --ios-bundle-id=com.depanini.app \
  --out=lib/firebase_options_user.dart \
  --android-out=android/app/src/user/google-services.json \
  --ios-out=ios/config/user/GoogleService-Info.plist

# DRIVER app (com.depanini.driver)
flutterfire configure \
  --project=depanini-dev \
  --android-package-name=com.depanini.driver \
  --ios-bundle-id=com.depanini.driver \
  --out=lib/firebase_options_driver.dart \
  --android-out=android/app/src/driver/google-services.json \
  --ios-out=ios/config/driver/GoogleService-Info.plist
```

This produces (all git-ignored):

- `android/app/src/<flavor>/google-services.json` — picked up automatically by
the Gradle plugin for that flavor.
- `ios/config/<flavor>/GoogleService-Info.plist` — copied into the iOS bundle
by a build phase (see §6 "Firebase per flavor").
- `lib/firebase_options_<flavor>.dart` — Dart options.

**One-line swap to explicit options:** in `main_user.dart` /
`main_driver.dart`, change:

```dart
final firebaseInit = await FirebaseInitializer.initialize();
// →
final firebaseInit = await FirebaseInitializer.initialize(
  options: DefaultFirebaseOptions.currentPlatform, // from firebase_options_<flavor>.dart
);
```

Until you do this, Firebase reads the native config files directly (which is
why §6's iOS copy step matters). `FirebaseInitializer` never throws — if config
is missing the app still launches and shows a small "Firebase not configured"
banner in debug.

> FlutterFire will also add the Google Services Gradle plugin to
> `android/app/build.gradle.kts` automatically — don't add it by hand.

---

## 4. Running each flavor

```bash
# USER app
flutter run --flavor user \
  --dart-define-from-file=config/dart_define.json \
  -t lib/main_user.dart

# DRIVER app
flutter run --flavor driver \
  --dart-define-from-file=config/dart_define.json \
  -t lib/main_driver.dart
```

Build artifacts:

```bash
flutter build apk --flavor user   -t lib/main_user.dart   --dart-define-from-file=config/dart_define.json
flutter build ipa --flavor driver -t lib/main_driver.dart --dart-define-from-file=config/dart_define.json
```

VS Code users: add launch configs with `"args": ["--flavor","user","--dart-define-from-file","config/dart_define.json"]`
and `"program": "lib/main_user.dart"`.

---

## 5. Secrets & environment variables


| Where     | How secrets are provided                                              |
| --------- | --------------------------------------------------------------------- |
| **Local** | `config/dart_define.json` (git-ignored) via `--dart-define-from-file` |
| **CI**    | CodeMagic env vars → passed as `--dart-define=KEY=$KEY` (see CI.md)   |


Read in Dart through `lib/core/env/env.dart` (`Env.mapboxAccessToken`, …).

**Never committed** (see `.gitignore`): `google-services.json`,
`GoogleService-Info.plist`, `config/dart_define.json`, `.env*`, keystores,
`lib/firebase_options*.dart`. Committed **templates** end in `.example`.

---

## 6. Native platform configuration

### Android (both flavors)

`android/app/src/main/AndroidManifest.xml` already declares:

- `INTERNET` (Mapbox tiles, Directions, Firebase)
- `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION`

Product flavors live in `android/app/build.gradle.kts` (`user` / `driver`,
each with its own `applicationId` and `app_name`).

> **Mapbox note:** `flutter_map` uses Mapbox **raster tiles over HTTPS**, so no
> native Mapbox SDK key in Gradle is required — the token is the
> `MAPBOX_ACCESS_TOKEN` passed via `--dart-define`. (If you later switch to the
> native vector `mapbox_maps_flutter` SDK you'll also add a secret
> `MAPBOX_DOWNLOADS_TOKEN` to `~/.gradle/gradle.properties` — not needed now.)

### iOS (both targets) — location permissions

`ios/Runner/Info.plist` includes **descriptive** usage strings (iOS crashes
without these the moment location is requested — important for physical-device
testing):

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`

The display name is `$(APP_DISPLAY_NAME)` (set per flavor by the xcconfigs).

### iOS flavors (manual, Mac + Xcode — required)

Flutter resolves `--flavor user` to an Xcode **scheme** named `user`. These
must be created in Xcode (CI can't create them). One-time setup:

1. Open `ios/Runner.xcworkspace` in Xcode.
2. **Project → Info → Configurations:** duplicate each of Debug/Profile/Release
  into `Debug-user`, `Profile-user`, `Release-user`, `Debug-driver`,
   `Profile-driver`, `Release-driver`.
3. Set each new config's xcconfig file (Project → click the config) to include
  the matching flavor file: `ios/Flutter/flavor-user.xcconfig` for the
   `*-user` configs, `flavor-driver.xcconfig` for the `*-driver` configs.
   These set `PRODUCT_BUNDLE_IDENTIFIER` and `APP_DISPLAY_NAME`.
4. **Product → Scheme → Manage Schemes:** duplicate `Runner` into two shared
  schemes named exactly `**user`** and `**driver**`. For each, map Run/Profile/
   Archive/Release to the matching `*-<flavor>` configurations and tick
   "Shared".

#### Firebase per flavor (iOS)

Because each flavor needs a different `GoogleService-Info.plist`, do **not**
drop it into `ios/Runner/`. Instead add a **Run Script build phase** (before
"Compile Sources") that copies the right one:

```bash
# Selects ios/config/user or ios/config/driver based on the bundle id.
case "$PRODUCT_BUNDLE_IDENTIFIER" in
  com.depanini.app)    FLAVOR=user ;;
  com.depanini.driver) FLAVOR=driver ;;
  *) echo "Unknown bundle id $PRODUCT_BUNDLE_IDENTIFIER"; exit 1 ;;
esac
cp "${SRCROOT}/config/${FLAVOR}/GoogleService-Info.plist" \
   "${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/GoogleService-Info.plist"
```

### Where to paste your Mapbox token

Nowhere in native config. Put it in `config/dart_define.json`
(`MAPBOX_ACCESS_TOKEN`) locally, and in the CodeMagic `MAPBOX_ACCESS_TOKEN` env
var for CI.

---

## 7. Cloud Functions

See `functions/README.md`. Quick smoke test of the deploy pipeline:

```bash
cd functions && npm install && npm run build
firebase deploy --only functions      # deploys healthCheck
```

---

## 8. CI/CD

Four CodeMagic workflows triggered by pushing to `develop`. Full details,
the env-var checklist, and where artifacts land are in **[CI.md](./CI.md)**.

---

## 9. Quality gates

```bash
flutter analyze    # static analysis (must be clean)
flutter test       # unit + widget tests
```

Both are run automatically in every CI workflow.