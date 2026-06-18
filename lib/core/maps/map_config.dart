import 'package:latlong2/latlong.dart';

import '../constants/app_constants.dart';
import '../env/env.dart';

/// Central Mapbox configuration. The access token is read from the environment
/// ([Env.mapboxAccessToken]) — it is NEVER hard-coded here.
///
/// We use `flutter_map` (a pure-Dart, tile-based map widget) with Mapbox raster
/// tiles, plus the Mapbox Directions REST API (added in a later phase) for
/// routing/ETA.
class MapConfig {
  const MapConfig._();

  /// Mapbox public token, injected via `--dart-define`. Empty if not provided.
  static String get mapboxAccessToken => Env.mapboxAccessToken;

  /// Whether a usable token was supplied at build time.
  static bool get hasToken => Env.hasMapboxToken;

  /// Mapbox style used for raster tiles. Swap for a custom style id later.
  static const String mapboxStyleId = 'mapbox/streets-v12';

  /// Tile URL template for `flutter_map`'s `TileLayer.urlTemplate`.
  ///
  /// The `{z}/{x}/{y}` placeholders are filled by flutter_map; the access
  /// token is inlined from the environment. `@2x` requests retina tiles.
  static String get tileUrlTemplate =>
      'https://api.mapbox.com/styles/v1/$mapboxStyleId/tiles/256/{z}/{x}/{y}@2x'
      '?access_token=$mapboxAccessToken';

  /// Attribution string required by the Mapbox / OpenStreetMap terms of use.
  static const String attribution = '© Mapbox  © OpenStreetMap';

  /// Default map center: Tunis.
  static const LatLng tunisCenter = LatLng(
    AppConstants.tunisLatitude,
    AppConstants.tunisLongitude,
  );

  /// Default zoom for the placeholder screen.
  static const double defaultZoom = AppConstants.defaultMapZoom;
}
