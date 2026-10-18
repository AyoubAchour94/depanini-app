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

**Onboarding**:
The form an app shows to a signed-in account that doesn't yet have that app's profile.

**Driver**:
A tow-truck operator who takes tow jobs, using the driver app. Drivers onboard themselves; no approval is needed.
_Avoid_: Partner, captain, operator

### Apps

**Customer app**:
The store app named "Depanini", for customers. Its build variant is called `user`.
_Avoid_: User app

**Driver app**:
The store app named "Depanini Driver", for drivers.
