# Separate customer and driver apps from one codebase

Depanini ships two store apps, **Depanini** for customers and **Depanini Driver** for tow-truck drivers, built from the single `apps/mobile` codebase as build-time variants (`user`, `driver`). It does not ship one app with a role switch. This follows Uber, Bolt and Careem. The driver app needs background ("always") location to dispatch and track trucks, and Apple and Google accept that far more readily when location tracking is the app's core purpose than in an app most customers use once in a breakdown. The two audiences also use the apps very differently: customers occasionally and under stress, drivers all day as a work tool. Separate apps keep the customer app simple and give each audience its own store listing, ratings and release schedule.

## Considered Options

- **One app with a role switch** (inDrive's "driver mode"). It means half the builds, store listings and reviews, but every customer install would carry driver permissions and screens. inDrive's casual-driver model doesn't apply: tow operators are a small professional group.

## Consequences

- One person can be both a customer and a driver. Both apps share one Firebase project, so the same login works in each, but they have to install both apps.
- Each release means two store submissions and twice the EAS builds.
- Merging later is expensive once both apps have installed users, so revisit this before the first public release, not after.
