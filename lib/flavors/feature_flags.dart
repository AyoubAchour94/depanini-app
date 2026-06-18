/// Compile-time feature flags that differ between the two flavors.
///
/// Add new flags here as features diverge between the user and driver apps
/// (e.g. `canAcceptTrips`, `showsEarnings`). Keep them boolean and resolved at
/// flavor-initialization time so feature code can branch on
/// `FlavorConfig.instance.features.<flag>` without scattering flavor checks.
class FeatureFlags {
  const FeatureFlags({
    required this.isDriverApp,
  });

  /// True for the driver app, false for the user app. The single most
  /// important flag — most flavor branching ultimately derives from this.
  final bool isDriverApp;
}
