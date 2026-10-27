# Store listing kit

> **DRAFT. Everything here is a proposal for the owner to confirm.** Anything that sounds legal (privacy answers, age rating, claims about verification or deletion) must be checked by the owner, and by a lawyer where it matters, before it is entered in App Store Connect or Play Console. Nothing here has been submitted.

Part of [#164](https://github.com/AyoubAchour94/depanini-app/issues/164), under [#151](https://github.com/AyoubAchour94/depanini-app/issues/151).

| File                                                      | What                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`listings.json`](listings.json)                          | Names, subtitles, keywords, short and full descriptions: 2 apps x fr / ar / en |
| [`categories-and-ratings.md`](categories-and-ratings.md)  | Category and age-rating questionnaire answers                                  |
| [`privacy-forms.md`](privacy-forms.md)                    | Draft Play data-safety form and App Store privacy label, with code references  |
| [`checklist.md`](checklist.md)                            | Store requirements: met, pending, risks                                        |

`listings.json` is the single source for the copy (fields: `appName`/`subtitle`/`keywords` for the App Store, `title`/`shortDescription`/`fullDescription` for Google Play; the App Store description is the same as `fullDescription`).

## The two apps

Both come from `apps/mobile/app.config.ts` and `apps/mobile/src/variant/variants.json`.

| Variant | On-device name  | Bundle id / package   |
| ------- | --------------- | --------------------- |
| user    | Depanini        | `com.depanini.app`    |
| driver  | Depanini Driver | `com.depanini.driver` |

The localized store names for the driver app differ (French "Depanini Dépanneur", Arabic "Depanini سائق الجرّ"). If the owner wants the home-screen name to match, that is a separate app change (localized display name), not part of this kit.

Wording: French uses "dépanneur" for the tow operator; Arabic uses "سائق الجرّ", consistent with `apps/mobile/src/i18n/locales/ar` on the `mobile/arabic-rtl` branch (PR #186). Re-check against that file once it is merged. Arabic copy is a draft and should be read by a native speaker.

## Limits check

`scripts/store-listing.test.mjs` (run by `pnpm test:scripts`) checks every field of `listings.json` against the store limits: App Store name 30, subtitle 30, keywords 100; Play title 30, short description 80, full description 4000.

```sh
node --test scripts/store-listing.test.mjs
```

## TODO (Part 2): screenshots

Waits for the Arabic PR (#186) to merge so that `ar` screens exist. Not done yet.

Plan, from the screenshot specs:

1. The key screens already have Playwright specs in `e2e/web/*-screenshots.spec.ts` (auth and account, request flow, customer trip, driver home, driver job). `e2e/web/viewport.ts` sets the viewport and `e2e/web/shotLocale.ts` the language. Run them for `fr` and `ar` (RTL).
2. `pnpm design:boards` (`scripts/design/final-boards.mjs`) composes boards; reuse it if framed store images are wanted.
3. Add one viewport per target and capture each key screen at:
   - iPhone 6.7": 1290 x 2796 (Apple also accepts 1284 x 2778),
   - iPhone 6.5": 1242 x 2688 (or 1284 x 2778),
   - Android phone: 1080 x 1920 up to 1080 x 2400 (Play: 2 to 8 images, each side 320 to 3840 px, longer side at most 2x the shorter).
     Set Playwright `viewport` to the CSS size and `deviceScaleFactor` so that the product is the pixel size (e.g. 430 x 932 at 3x gives 1290 x 2796).
4. Output to `docs/store/screenshots/<app>/<locale>/<device>/NN-name.png`. Check Apple's size list in App Store Connect at that time; it changes.
5. Use mock data only (no real names or phone numbers).
