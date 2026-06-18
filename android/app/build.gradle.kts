plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // NOTE: `flutterfire configure` will add the Google Services plugin line here
    // automatically the first time you run it, e.g.:
    //   id("com.google.gms.google-services")
    // Do NOT add it manually — let FlutterFire manage it so versions stay in sync.
}

android {
    namespace = "com.depanini.depanini"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Base application ID. Each product flavor overrides this with its own
        // unique ID (com.depanini.app / com.depanini.driver) below.
        applicationId = "com.depanini.depanini"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // ---------------------------------------------------------------------------
    // PRODUCT FLAVORS
    // ---------------------------------------------------------------------------
    // Two flavors that ship as two separate apps on the Play Store. They share
    // ~80% of the Dart codebase but have different application IDs, display
    // names, and Firebase config files.
    //
    //   flutter run   --flavor user   -t lib/main_user.dart
    //   flutter run   --flavor driver -t lib/main_driver.dart
    //   flutter build --flavor user   -t lib/main_user.dart  ...
    //
    // Firebase config (`google-services.json`) is resolved PER FLAVOR. Place
    // each flavor's file at:
    //   android/app/src/user/google-services.json
    //   android/app/src/driver/google-services.json
    // (These are git-ignored; see the *.example templates checked into the repo.)
    // ---------------------------------------------------------------------------
    flavorDimensions += "app"
    productFlavors {
        create("user") {
            dimension = "app"
            applicationId = "com.depanini.app"
            // App display name comes from android/app/src/user/res/values/strings.xml
            // (@string/app_name). Using per-flavor string resources instead of
            // resValue() keeps the AGP `resValues` build feature off.
        }
        create("driver") {
            dimension = "app"
            applicationId = "com.depanini.driver"
            // App display name: android/app/src/driver/res/values/strings.xml
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the Play Store release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
