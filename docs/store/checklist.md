# Store requirements checklist

> **DRAFT.** Status is read from the code on `develop`; legal items are for the owner to confirm. Checked = verified in code, "pending" = needs work or an owner action.

## Required by both stores

- [x] **Account deletion in the app.** Account, then "Delete account" (`apps/mobile/src/features/account/DeleteAccountScreen.tsx`, `apps/mobile/src/app/delete-account.tsx`) calls `DELETE /me` (`apps/api/src/accounts/me.controller.ts`), which deletes the account and both profiles and cancels open jobs. Apple (5.1.1(v)) and Google both require this. Google also wants a web link or instructions for deletion outside the app: add one to the Play form (owner: contact email or a page).
- [ ] **Privacy policy URL** (#163). Texts exist in `docs/legal/privacy-{fr,en,ar}.md` but are marked TEMPLATE with `[PLACEHOLDERS]` (legal entity, contact email, hosting provider, retention periods, INPDP). Publish and enter the URL in both consoles and in the app's account screen. Pending owner input.
- [ ] **Terms of use** (`docs/legal/terms-*`): also templates; Apple expects a Terms/EULA link for apps with accounts.
- [ ] **Privacy forms** filled from [`privacy-forms.md`](privacy-forms.md) after the owner resolves the **(?)** items.
- [ ] **Age rating / IARC questionnaire** from [`categories-and-ratings.md`](categories-and-ratings.md).
- [ ] **Listing text and screenshots.** Text is in `listings.json`; screenshots are Part 2 (see README TODO).

## Apple

- [ ] **Sign in with Apple (#10): pending.** Apple's guideline 4.8 requires an equivalent login option only when the app offers a third-party/social sign-in. Today `apps/mobile/src/auth/firebase-auth.ts` offers email and password only, which does not trigger 4.8. If Google or another social login is added, SIWA becomes mandatory. Needs the owner's Apple Developer account.
- [x] **Location purpose strings** exist in `apps/mobile/app.config.ts`: `NSLocationWhenInUseUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription`. They explain why (nearby tow trucks, share live position). Camera and photo strings for the driver app come from the `expo-image-picker` plugin config.
- [ ] **Risk: "Always" location string without background use.** The code only requests foreground permission (`Location.requestForegroundPermissionsAsync` in `usePresence.ts` and `PickupStep.tsx`), there is no background task or `UIBackgroundModes: location`. Apple can ask why an Always string is declared, and the string says "share live position during a rescue". Recommend removing `NSLocationAlwaysAndWhenInUseUsageDescription` (app change, not in this PR) unless background tracking is planned. If it is planned, a justification and a visible reason are required (guideline 5.1.1, 2.5.4), as is Google's background-location declaration video.
- [ ] **Risk: purpose strings are English only.** Review and the French/Arabic users will see English text. Consider localized `InfoPlist.strings` (via `expo-localization`/config plugin). Not blocking.
- [ ] **Demo account for review.** Apple and Google testers cannot create a driver that an admin verifies. Provide: a customer test account, and a driver test account already verified (admin approval in the admin app), with a short note on how to see a request and an offer. Credentials go in App Store Connect "Review information" and Play "App access"; never in the repo.
- [ ] **User-generated content (1.2).** Ratings comments and reports exist; there is no block-user feature. Reviewers may ask for filtering, reporting and blocking; reporting is there (`apps/mobile/src/api/reports.ts`). Be ready to explain that comments are private to their author and handled by admins.
- [ ] **Data not used for tracking**: no `NSUserTrackingUsageDescription`, label says Tracking: No.
- [ ] **Export compliance**: standard HTTPS only; set `ITSAppUsesNonExemptEncryption` to false (not currently in `app.config.ts`), otherwise App Store Connect asks on every build. (App change.)
- [ ] **Push**: APNs key and Firebase iOS config are console actions for the owner (see `docs/push.md`).
- [ ] **Business/driver app wording**: the driver app must not be a duplicate/spam of the customer app (4.3); it serves a different audience with separate functionality, say so in review notes. Two apps from one codebase is fine.

## Google Play

- [ ] **Data safety form** from [`privacy-forms.md`](privacy-forms.md).
- [x] **Permissions** declared in `app.config.ts`: only `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` (foreground). No `ACCESS_BACKGROUND_LOCATION`, so no background-location declaration is needed. Others come from plugins (camera, notifications); check the merged manifest of the release build.
- [ ] **App access**: provide the demo accounts above (Play "App access" section).
- [ ] **Target API level and 64-bit**: handled by the Expo SDK in use; check on first upload.
- [ ] **Closed testing**: new personal developer accounts must run a closed test with testers for a minimum period before production access. Plan time for this. (Organisation accounts are exempt.) Owner to confirm current Play rules.
- [ ] **Content rating, target audience (18+ or adults, not for children), ads: none.**
- [ ] **Developer identity**: Apple/Google ask for a legal entity or individual details; Google also publishes contact details of the developer.

## Mark of legal sensitivity

Every claim in the listing text that could be read as a promise is a draft for the owner to confirm: "verified operators" (documents are checked by admins before taking jobs: true in code, but wording is marketing), "clear price agreed before departure" (offer and accept flow), "payment in cash", "available in French, Arabic and English" (Arabic arrives with #186), "delete your account at any time". Remove any that are not true at launch.
