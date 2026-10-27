# Redesign A: map-first sheet (light) with a C-style dark mode

The approved round-2 mockups of the redesign (#122). Build against these.

- `boards/`: the customer and driver boards (PNG).
- `screens/<app>-<scheme>/`: each screen as HTML and a 2x PNG, for the customer and driver apps in light and dark.
- `dir-a2.cjs`: the generator. Its `LIGHT` and `DARK` objects hold every exact colour value; `apps/mobile/src/theme/tokens.ts` is copied from them. Where the tokens differ from the mockups on purpose (for contrast), a comment in `tokens.ts` says so. The generator needs a `lib.cjs` that is not kept here, so it cannot be re-run; it is a reference.
- `slices/<issue>/`: the screenshots each redesign slice attached to its PR.
- `final/`: the visual-QA boards (#142). `customer-light.png`, `customer-dark.png`, `driver-light.png` and `driver-dark.png` show every screen of the app at 390x844, and the individual shots are in `final/customer/` and `final/driver/`. `final/small/` is the same at 360x640. They were taken without map tiles (a plain themed background), so the maps are retaken with a real Mapbox token before sign-off. To retake them, start the stack the screenshot specs need (see the header of `e2e/web/request-flow-screenshots.spec.ts`), then run `pnpm design:boards` (add `--small` for 360x640, `--with-map` when the apps have a real Mapbox token, `--assemble-only` to rebuild the boards from the shots on disk, `--locale=fr` to show the apps in French, written to `docs/design/i18n/fr/`). The script is `scripts/design/final-boards.mjs`.

Tokens: `apps/mobile/src/theme/tokens.ts`. Preview of every primitive: `/dev/ui` in a dev build.
