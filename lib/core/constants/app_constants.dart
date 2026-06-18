/// App-wide constant values that are NOT secrets and NOT environment specific.
///
/// Secrets/tokens belong in [Env] (env config), not here.
class AppConstants {
  const AppConstants._();

  /// Default map center: Tunis, Tunisia.
  static const double tunisLatitude = 36.8065;
  static const double tunisLongitude = 10.1815;

  /// Default zoom level used by the placeholder map screen.
  static const double defaultMapZoom = 12.0;
}
