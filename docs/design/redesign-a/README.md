# Redesign A: map-first sheet (light) with a C-style dark mode

The approved round-2 mockups of the redesign (#122). Build against these.

- `boards/`: the customer and driver boards (PNG).
- `screens/<app>-<scheme>/`: each screen as HTML and a 2x PNG, for the customer and driver apps in light and dark.
- `dir-a2.cjs`: the generator. Its `LIGHT` and `DARK` objects hold every exact colour value; `apps/mobile/src/theme/tokens.ts` is copied from them. Where the tokens differ from the mockups on purpose (for contrast), a comment in `tokens.ts` says so. The generator needs a `lib.cjs` that is not kept here, so it cannot be re-run; it is a reference.
- `slices/<issue>/`: the screenshots each redesign slice attached to its PR.

Tokens: `apps/mobile/src/theme/tokens.ts`. Preview of every primitive: `/dev/ui` in a dev build.
