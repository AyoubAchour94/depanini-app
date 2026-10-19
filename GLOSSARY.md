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
The status of a tow request after the customer accepts an offer. It names the driver and the agreed fare, never expires, and either side can still cancel it until towing starts (see **Cancel reason**). Accepting rejects every other pending offer on the request. It stays assigned through the **trip stages** until the driver drops off the vehicle.

**Job**:
A tow request that is assigned to a driver, as that driver sees it, with the customer's name and phone. A driver has at most one job at a time.

**Trip stage**:
Where an assigned tow request is in its trip: **accepted**, **en route**, **arrived**, **towing**, in that order. Only the assigned driver moves it, forward and one step at a time, and each step is timestamped. Dropping off is not a stage: it completes the request.

**En route**:
The trip stage after the driver taps "Start driving". The customer sees the truck move on the map, with an ETA to the pickup computed as road distance (straight line times 1.3) at 40 km/h.

**Arrived**:
The trip stage once the driver is at the pickup. A customer can still cancel, but now needs a cancel reason.

**Towing**:
The trip stage once the vehicle is loaded. The customer sees an ETA to the drop-off. Nobody can cancel any more; the driver completes the trip instead.

**Completed**:
The status of a tow request after the driver drops off the vehicle, when the stage was towing. Both sides see a short trip summary: route, agreed fare and times.

**Cancel reason**:
Why someone cancels an assigned request, stored with who cancelled (customer or driver); there are no fees. A customer cancels freely until the driver has arrived (and an open request freely at any time); once arrived, a customer must give a reason: driver late, problem solved, found other help, or other. A driver always gives a reason until towing starts: vehicle not there, customer unreachable, unsafe, truck problem, or other.

### Payment and history

**Payment**:
The record that a completed tow request was paid. It is cash only, for the agreed fare in whole dinars (the agreed fare is final: no tips or extras), and has a status of driver confirmed, customer confirmed or disputed. It is created in the same transaction that completes the request.

**Cash received**:
The driver's single confirmation at drop-off ("Dropped off · cash received X TND") that they were paid the agreed fare. It completes the request and records the payment.

**Receipt**:
The proof of a completed trip, shown in-app to both the customer and the driver, with a Share action. It shows the date, pickup and drop-off, distance, vehicle and problem, agreed fare, payment method, stage times, and the driver's name and truck type and the customer's name. It never shows a phone number or a plate number. Only the two parties can read it, and only once the request is completed.

**Receipt number**:
The receipt's unique, sequential identifier, like `DPN-2026-000123`: the year of completion in Africa/Tunis, then a six-digit sequence number.

**Disputed payment**:
A payment the customer reported a problem with, with a short note (1 to 500 characters), kept for support. Answering is optional for the customer: without an answer the payment stays driver confirmed. A dispute never blocks the driver.

**Earnings**:
A driver's totals for today, this week and this month: the count of completed trips and the sum of their agreed fares, in whole dinars. Periods follow the Africa/Tunis time zone.

### Ratings and notifications

**Rating**:
What the customer and the driver each give the other once after a completed trip: 1 to 5 stars, optional tags and an optional comment (up to 300 characters). There is one rating per side per trip. It is possible for 7 days after completion and cannot be edited afterwards. A rating of 1 or 2 stars needs at least one tag. Comments are private and only support reads them. Drivers see the customer's rating, and customers see the driver's.

**Rating tag**:
A fixed reason attached to a rating, stored as a snake-case id; the app shows the label. Customers tag drivers with on time, careful with the vehicle, friendly, fair price, late, rough handling or rude. Drivers tag customers with clear location, ready on time, friendly, wrong location, made me wait or rude. A rating has at most 5 distinct tags.

**Rating summary**:
Someone's average stars (one decimal) and number of ratings, shown on offer cards and nearby requests. Below 3 ratings the average is not sent and the app shows "New".

**Push notification**:
A message the API sends to a user's phone through FCM when the app is not open, for example a new offer or a trip change. It carries a kind and the request id so a tap opens the right screen. Nobody gets one while their app has a live connection. Delivery is best effort.

**Device token**:
The native FCM or APNs address of one app install, registered with the API by the signed-in user together with the platform and which app (customer or driver) it is. Pushes go to the user's tokens.

### Trust and admin

**Verification**:
The document check a driver passes before going online. Its status is unsubmitted, pending, approved or rejected. Only an approved driver can go online, receive nearby requests or send offers; profile editing and history stay available. A rejection carries a reason the driver sees, and the driver can upload again and resubmit. The driver gets a push and an in-app status when it is decided.

**Driver document**:
One uploaded page of a required proof: the driver's licence, the vehicle registration (carte grise), the insurance certificate or the national ID (CIN). Each is a JPEG, PNG or PDF of up to 5 MB, and a document may have several pages. Files are stored in the database for the MVP, behind a file store, and are readable only by their owner and by admins.

**Report**:
A problem raised by the customer or the driver about a completed or cancelled trip, within 14 days of its end. It has a category (safety, vehicle damage, overcharged, no-show, behaviour or other) and a required note of up to 1000 characters. Each person can have one open report per trip, and sees its status and the resolution note.

**Admin**:
A team member who can sign in to the admin web app. The role is the Firebase custom claim `admin`, set by a script on the emulator or by the owner on a real account. Admins review drivers, look up users and trips, and resolve reports and payment disputes.

**Audit log**:
The record of every admin action (approving or rejecting a driver, resolving a report or a dispute): who did it, when, on what, and the details. It is append-only.
