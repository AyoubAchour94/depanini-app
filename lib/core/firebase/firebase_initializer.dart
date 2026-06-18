import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Result of attempting to initialize Firebase. Lets the app start gracefully
/// even if Firebase isn't configured yet (e.g. before `flutterfire configure`
/// has been run, or if config files are missing on a fresh checkout).
@immutable
class FirebaseInitResult {
  const FirebaseInitResult._({required this.isSuccess, this.error, this.stackTrace});

  const FirebaseInitResult.success() : this._(isSuccess: true);

  const FirebaseInitResult.failure(Object error, StackTrace stackTrace)
      : this._(isSuccess: false, error: error, stackTrace: stackTrace);

  final bool isSuccess;
  final Object? error;
  final StackTrace? stackTrace;
}

/// Initializes Firebase for the app and never throws — failures are returned
/// so the caller can decide whether to show a non-blocking notice or hard-fail.
class FirebaseInitializer {
  const FirebaseInitializer._();

  /// Initialize the default [FirebaseApp].
  ///
  /// ONE-LINE SWAP for explicit, per-flavor config:
  /// after running `flutterfire configure` (which generates
  /// `lib/firebase_options.dart`, or a per-flavor file you point it at), pass:
  ///
  ///   FirebaseInitializer.initialize(
  ///     options: DefaultFirebaseOptions.currentPlatform,
  ///   );
  ///
  /// Until then, [options] is null and Firebase reads native config from the
  /// platform files (`google-services.json` / `GoogleService-Info.plist`).
  static Future<FirebaseInitResult> initialize({FirebaseOptions? options}) async {
    try {
      // Avoid the "duplicate app" error on hot-restart / repeated init.
      if (Firebase.apps.isNotEmpty) {
        return const FirebaseInitResult.success();
      }
      await Firebase.initializeApp(options: options);
      return const FirebaseInitResult.success();
    } catch (error, stackTrace) {
      // Graceful: log in debug, surface the result to the caller. We do NOT
      // rethrow so a misconfigured Firebase never crashes app startup.
      if (kDebugMode) {
        debugPrint('⚠️  Firebase initialization failed: $error');
        debugPrint('    (This is expected until `flutterfire configure` has '
            'been run and the config files are in place.)');
      }
      return FirebaseInitResult.failure(error, stackTrace);
    }
  }
}
