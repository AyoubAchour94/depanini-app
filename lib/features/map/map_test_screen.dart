import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

import '../../core/maps/map_config.dart';
import '../../flavors/flavor_config.dart';

/// PLACEHOLDER screen for Phase 1 only.
///
/// Renders a basic Mapbox map centered on Tunis purely to validate that the
/// maps SDK and the Mapbox access token are wired up correctly. It is used as
/// the temporary home screen for BOTH flavors and will be replaced by the real
/// user/driver home screens in a later phase.
class MapTestScreen extends StatelessWidget {
  const MapTestScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final flavor = FlavorConfig.instance;
    return Scaffold(
      appBar: AppBar(
        title: Text('${flavor.appName} · Map test (Tunis)'),
      ),
      body: MapConfig.hasToken ? const _TunisMap() : const _MissingTokenView(),
    );
  }
}

class _TunisMap extends StatelessWidget {
  const _TunisMap();

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      options: const MapOptions(
        initialCenter: MapConfig.tunisCenter,
        initialZoom: MapConfig.defaultZoom,
      ),
      children: [
        TileLayer(
          urlTemplate: MapConfig.tileUrlTemplate,
          // Identifies our app to tile servers; not a flavor-specific value.
          userAgentPackageName: 'com.depanini.app',
        ),
        const MarkerLayer(
          markers: [
            Marker(
              point: MapConfig.tunisCenter,
              width: 44,
              height: 44,
              child: Icon(Icons.location_on, color: Colors.red, size: 44),
            ),
          ],
        ),
        const RichAttributionWidget(
          attributions: [
            TextSourceAttribution(MapConfig.attribution),
          ],
        ),
      ],
    );
  }
}

/// Shown when no Mapbox token was provided at build time, so the developer
/// immediately understands why the map is blank instead of seeing grey tiles.
class _MissingTokenView extends StatelessWidget {
  const _MissingTokenView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.map_outlined, size: 64),
            const SizedBox(height: 16),
            Text(
              'Mapbox token missing',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            const Text(
              'Pass MAPBOX_ACCESS_TOKEN via\n'
              '--dart-define-from-file=config/dart_define.json',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
