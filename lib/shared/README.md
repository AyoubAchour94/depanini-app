# shared

Cross-feature, flavor-agnostic building blocks reused across `features/`.

- `widgets/` — presentation-only reusable widgets (buttons, loaders, map
  widgets shared by user & driver, empty/error states).
- `models/` — domain models used by more than one feature (e.g. `LatLng`
  wrappers, `Money`, shared enums).

Rule of thumb: if two features both need it and it has no feature-specific
logic, it belongs here. Anything that touches Firebase/platform SDKs directly
belongs in `core/` (infrastructure) or a feature's `data/` layer instead.
