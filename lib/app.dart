import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'core/firebase/firebase_initializer.dart';
import 'core/theme/app_theme.dart';
import 'features/map/map_test_screen.dart';
import 'flavors/flavor_config.dart';

/// The shared application shell used by BOTH flavors.
///
/// Everything flavor-specific (title, theme color, and — later — the home
/// screen and navigation flow) is resolved from [FlavorConfig]. In Phase 1
/// both flavors temporarily show [MapTestScreen]; the real user/driver home
/// screens replace it in a later phase.
class DepaniniApp extends StatelessWidget {
  const DepaniniApp({super.key, required this.firebaseInit});

  /// Outcome of Firebase initialization, so we can show a non-blocking notice
  /// in debug builds when Firebase isn't configured yet.
  final FirebaseInitResult firebaseInit;

  @override
  Widget build(BuildContext context) {
    final flavor = FlavorConfig.instance;
    return MaterialApp(
      title: flavor.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(flavor.brandColor),
      darkTheme: AppTheme.dark(flavor.brandColor),
      home: const MapTestScreen(),
      builder: (context, child) {
        final content = child ?? const SizedBox.shrink();
        // In debug, if Firebase failed to init (expected until configured),
        // overlay a small corner banner instead of crashing or hiding it.
        if (kDebugMode && !firebaseInit.isSuccess) {
          return Banner(
            message: 'Firebase not configured',
            location: BannerLocation.topStart,
            color: Colors.red.shade700,
            child: content,
          );
        }
        return content;
      },
    );
  }
}
