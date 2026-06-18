import 'package:flutter/material.dart';

import 'feature_flags.dart';
import 'flavor.dart';

/// Per-flavor configuration: app name, bundle id, brand color, and feature
/// flags. Initialized exactly once from `main_user.dart` / `main_driver.dart`
/// and then read globally via [FlavorConfig.instance].
///
/// Keeping all flavor differences in this one place means the rest of the app
/// never hard-codes "user" vs "driver" — it asks [FlavorConfig].
class FlavorConfig {
  FlavorConfig._({
    required this.flavor,
    required this.appName,
    required this.bundleId,
    required this.brandColor,
    required this.features,
  });

  final Flavor flavor;
  final String appName;
  final String bundleId;

  /// Seed color for the Material 3 theme — gives each app a distinct identity
  /// (blue for the user app, amber for the driver app).
  final Color brandColor;

  final FeatureFlags features;

  static FlavorConfig? _instance;

  /// The active flavor config. Throws (in debug) if accessed before
  /// [initialize] has run in the flavor entry point.
  static FlavorConfig get instance {
    assert(
      _instance != null,
      'FlavorConfig.initialize() must be called in main_user.dart / '
      'main_driver.dart before FlavorConfig.instance is used.',
    );
    return _instance!;
  }

  /// Whether [initialize] has already run. Useful in tests.
  static bool get isInitialized => _instance != null;

  /// Builds and stores the config for [flavor]. Call once at startup.
  static FlavorConfig initialize(Flavor flavor) {
    final config = switch (flavor) {
      Flavor.user => FlavorConfig._(
          flavor: Flavor.user,
          appName: 'Depanini',
          bundleId: 'com.depanini.app',
          brandColor: const Color(0xFF1565C0), // blue
          features: const FeatureFlags(isDriverApp: false),
        ),
      Flavor.driver => FlavorConfig._(
          flavor: Flavor.driver,
          appName: 'Depanini Driver',
          bundleId: 'com.depanini.driver',
          brandColor: const Color(0xFFF9A825), // amber
          features: const FeatureFlags(isDriverApp: true),
        ),
    };
    _instance = config;
    return config;
  }

  /// Test-only hook to reset the singleton between tests.
  @visibleForTesting
  static void reset() => _instance = null;

  bool get isDriverApp => features.isDriverApp;
  bool get isUserApp => !features.isDriverApp;
}
