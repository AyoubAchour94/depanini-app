import 'package:flutter/material.dart';

import 'app.dart';
import 'core/firebase/firebase_initializer.dart';
import 'firebase_options_driver.dart';
import 'flavors/flavor.dart';
import 'flavors/flavor_config.dart';

/// Entry point for the DRIVER app ("Depanini Driver", com.depanini.driver).
///
/// Run with:
///   flutter run --flavor driver \
///     --dart-define-from-file=config/dart_define.json \
///     -t lib/main_driver.dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. Resolve flavor configuration before anything else reads it.
  FlavorConfig.initialize(Flavor.driver);

  // 2. Initialize Firebase (never throws — see FirebaseInitializer).
  //    After running `flutterfire configure`, pass the generated options:
  //      options: DefaultFirebaseOptions.currentPlatform,
  final firebaseInit = await FirebaseInitializer.initialize(
    options: DefaultFirebaseOptions.currentPlatform, // from firebase_options_driver.dart
  );

  // 3. Run the shared app shell.
  runApp(DepaniniApp(firebaseInit: firebaseInit));
}
