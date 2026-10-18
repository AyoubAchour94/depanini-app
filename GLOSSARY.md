# Depanini

On-demand towing marketplace for Tunisia: customers with a broken-down vehicle request a tow, and tow-truck drivers take the job.

## Language

### People

**Account**:
One person's sign-in identity, shared by both apps. An account can hold a customer profile, a driver profile, or both.
_Avoid_: User (ambiguous: also the name of the customer app's build variant)

**Customer**:
A person who requests tows, using the customer app.
_Avoid_: User, client, rider

**Customer profile**:
The name and contact phone a customer gives before using the customer app. The phone is a Tunisian number, stored as `+216` followed by 8 digits, and is not verified. Until an account has one, the customer app shows onboarding.

**Driver profile**:
The name, contact phone, truck type and plate number a driver gives before using the driver app. A complete driver profile is all a driver needs; there is no approval step yet.

**Truck type**:
The kind of tow truck a driver operates: **flatbed** (the vehicle rides on the truck's bed) or **wheel-lift** (the truck lifts the vehicle by two wheels and tows it).

**Plate number**:
A truck's registration plate, stored trimmed and upper-cased. Tunisian plates come in several formats, so it isn't checked against a pattern.

**Onboarding**:
The form an app shows to a signed-in account that doesn't yet have that app's profile. In the driver app, it has two steps: personal details, then truck details.

**Driver**:
A tow-truck operator who takes tow jobs, using the driver app. Drivers onboard themselves; no approval is needed.
_Avoid_: Partner, captain, operator

### Apps

**Customer app**:
The store app named "Depanini", for customers. Its build variant is called `user`.
_Avoid_: User app

**Driver app**:
The store app named "Depanini Driver", for drivers.

### Tow requests

**Tow request**:
A customer's ask for a tow: where the vehicle is, where it should go, its vehicle type and problem type, an optional note of up to 280 characters, and the fare they propose. It starts **open** and waits for drivers until the customer cancels it or it expires 15 minutes after creation. A customer has at most one open request at a time.
_Avoid_: Order, ride, job (a job is a tow request as its assigned driver sees it)

**Pickup**:
The place where the vehicle is. Coordinates are the source of truth and must be inside Tunisia; the address text is only for display.
_Avoid_: Origin, start

**Drop-off**:
The place the vehicle should be towed to, with the same rules as the pickup.
_Avoid_: Destination

**Vehicle type**:
The kind of vehicle to tow: **car**, **suv_van** or **motorcycle**. It sets the fare rates.
_Avoid_: Truck type (that is the driver's tow truck)

**Problem type**:
What went wrong with the vehicle: **breakdown**, **accident**, **flat_tire**, **battery**, **out_of_fuel**, **stuck** or **other**.

**Suggested fare**:
The fare the API computes for a tow request, in whole dinars: a base per vehicle type plus a rate per kilometre of estimated road distance (straight line times 1.3). The API always recomputes it and never trusts a client price.

**Proposed fare**:
The fare the customer offers, in whole dinars. It starts at the suggested fare and may be changed, from 80% up to 3 times the suggestion.

### Drivers and offers

**Online**:
A driver who has switched on availability in the driver app and whose last location is under 2 minutes old. The app sends its location every 15 seconds while it is in the foreground; a driver who stops sending counts as offline.

**Nearby request**:
An open, unexpired tow request whose pickup is within 25 km of an online driver, as that driver sees it, with the distance to the pickup. It never includes the customer's contact. A driver doesn't see their own requests, nor any while they have a job.

**Offer**:
A driver's bid on a tow request: a fare in whole dinars, an ETA to the pickup (road distance at 40 km/h, rounded up to whole minutes), and a status of pending, accepted, rejected, declined, withdrawn or expired. A driver has at most one pending offer per request. It expires 3 minutes after it is made, and the driver can withdraw it before then.
_Avoid_: Bid, quote

**Counter-offer**:
An offer whose fare differs from the customer's proposed fare. It must stay within the request's fare bounds (80% to 3 times the suggested fare). Accepting the proposed fare as is is also an offer, not a counter.

**Agreed fare**:
The fare of the accepted offer, in whole dinars. It is fixed when the request is assigned.

**Assigned**:
The status of a tow request after the customer accepts an offer. It names the driver and the agreed fare, never expires, and either side can still cancel it. Accepting rejects every other pending offer on the request.

**Job**:
A tow request that is assigned to a driver, as that driver sees it, with the customer's name and phone. A driver has at most one job at a time.
