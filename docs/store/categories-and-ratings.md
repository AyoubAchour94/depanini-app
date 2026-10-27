# Category and content rating

> **DRAFT for the owner to confirm.** The questionnaires are declarations the owner makes in the consoles.

## Category

| Store                    | Customer app (Depanini)                  | Driver app (Depanini Driver)    |
| ------------------------ | ---------------------------------------- | ------------------------------- |
| App Store primary        | Travel                                   | Business                        |
| App Store secondary      | Navigation                               | Navigation                      |
| Google Play app category | Auto & Vehicles (alt: Maps & Navigation) | Business (alt: Auto & Vehicles) |

Reasoning: the customer app is a roadside-assistance request tied to a map. "Auto & Vehicles" (Play) and "Travel" (App Store) fit best. The driver app is a work tool for professionals, so Business. Keep both consistent with the listing text.

Pricing: free, no in-app purchases, no ads. Payment is cash between customer and driver, outside the app; the app only records the driver's confirmation and a receipt number (`apps/api/src/db/schema.ts`, table `payments`, `method` defaults to `cash`). Because the service is physical (a tow), Apple's in-app purchase rule does not apply (guideline 3.1.3(e), goods and services consumed outside the app). Owner to confirm.

## Age rating

Same answers for both apps.

| Question (Apple age rating / IARC)                  | Answer       | Why                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Violence, sexual content, nudity, profanity, horror | None         | No such content                                                                                                                                                                                                                                                                    |
| Drugs, alcohol, tobacco, gambling, contests         | None         | None                                                                                                                                                                                                                                                                               |
| Medical or treatment information                    | None         | None                                                                                                                                                                                                                                                                               |
| Unrestricted web access                             | No           | No embedded browser; legal pages open as a link                                                                                                                                                                                                                                    |
| User-generated content / users interact             | Yes, limited | Customers and drivers exchange offers and fares, rate each other with an optional comment, and can send reports (`apps/api/src/ratings`, `apps/api/src/reports`). No public feed, no chat. Ratings comments are private to their author (see the `ratings` comment in `schema.ts`) |
| Shares user location with other users               | Yes          | The matched driver sees the customer's position; the customer sees the driver's live position during a job                                                                                                                                                                         |
| In-app purchases / digital purchases                | No           | Cash only, outside the app                                                                                                                                                                                                                                                         |
| Real-money gambling                                 | No           | None                                                                                                                                                                                                                                                                               |

Expected results: App Store **4+** (Apple may ask for a higher band if user-generated content is flagged); Google Play / IARC **Everyone** (3+) with the "users interact" and "shares location" descriptors. The privacy policy states the apps are for people 18 and over (`docs/legal/privacy-en.md`, section 8): that is a legal claim about eligibility, not the store rating. Do not enrol either app in Kids or Families programmes.

Apple guideline 1.2 (user-generated content) expects a way to report content and block abusers. The report flow exists (`apps/mobile/src/api/reports.ts`); there is no block-user feature. Listed as a risk in the checklist.
