/// Typed access to environment configuration injected at build time.
///
/// Values come from `--dart-define` / `--dart-define-from-file` (see
/// `config/dart_define.example.json`). Using compile-time constants means
/// secrets are NOT hard-coded in source and NOT committed to git — they are
/// supplied by the local dart_define.json file or by CodeMagic env vars.
///
/// Example (local):
///   flutter run --flavor user \
///     --dart-define-from-file=config/dart_define.json \
///     -t lib/main_user.dart
class Env {
  const Env._();

  /// Mapbox public access token (`pk....`). Used for map tiles and the
  /// Directions API. Empty if not provided — check [hasMapboxToken] first.
  static const String mapboxAccessToken =
      String.fromEnvironment('MAPBOX_ACCESS_TOKEN');

  /// Logical environment name: "dev", "staging", or "prod". Defaults to "dev".
  static const String environment =
      String.fromEnvironment('ENVIRONMENT', defaultValue: 'dev');

  /// Whether a non-empty Mapbox token was supplied at build time.
  static bool get hasMapboxToken => mapboxAccessToken.isNotEmpty;

  static bool get isDev => environment == 'dev';
  static bool get isProd => environment == 'prod';
}
