# features/map

Map & routing feature (shared by both flavors).

**Phase 1 (now):** contains only `map_test_screen.dart` — a placeholder that
renders a Mapbox map centered on Tunis to validate the maps SDK + token wiring.
It is the temporary home screen for both flavors.

**Later phases** will add:
- Live location tracking and the user's/driver's marker.
- Mapbox **Directions API** integration for route + ETA between user and driver.
- Map controllers/providers and reusable map widgets (move generic ones to
  `lib/shared/widgets/`).

Map configuration (tile URL, token from env, Tunis center) lives in
`lib/core/maps/map_config.dart`.
