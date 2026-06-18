# core

App infrastructure and cross-cutting concerns. No feature/business logic here.

- `constants/` — non-secret app constants (`app_constants.dart`: Tunis coords,
  default zoom).
- `theme/` — Material 3 theme (`app_theme.dart`), seeded per flavor.
- `env/` — typed environment config from `--dart-define` (`env.dart`).
- `firebase/` — Firebase bootstrap (`firebase_initializer.dart`).
- `maps/` — Mapbox config (`map_config.dart`), token sourced from env.
- `utils/` — small pure helpers (formatters, validators) — add as needed.
- `error/` — error types (`app_exception.dart`) and (later) error handling/UI.
