# Depanini Cloud Functions

TypeScript (Node.js 22) Cloud Functions for the Depanini towing marketplace.

> **Phase 1 status:** scaffold only. The only function here is `healthCheck`,
> an HTTPS callable used to validate that the deploy pipeline works end to end.
> No business logic (matching, dispatch, pricing) is implemented yet.

## Prerequisites

- Node.js 22 (matches the `engines.node` field in `package.json`)
- Firebase CLI: `npm i -g firebase-tools`
- You must be logged in: `firebase login`
- The Firebase project must be selected (see root `.firebaserc` / `firebase use`)

## Install & build

```bash
cd functions
npm install
npm run build        # compiles src/*.ts -> lib/*.js
```

## Run locally (emulator)

```bash
npm run serve        # builds, then starts the Functions emulator
# or an interactive shell:
npm run shell
```

In the Functions shell you can smoke-test the callable:

```
healthCheck({})
# => { status: 'ok', timestamp: '...', region: 'europe-west1', authenticated: false }
```

## Deploy

```bash
firebase deploy --only functions
```

This is the smoke test for the whole pipeline. A successful deploy of
`healthCheck` confirms billing, IAM, and the Functions build are all wired up.

## Calling `healthCheck` from Flutter

```dart
final callable = FirebaseFunctions
    .instanceFor(region: 'europe-west1')
    .httpsCallable('healthCheck');
final result = await callable.call();
debugPrint(result.data.toString()); // {status: ok, ...}
```

## Region

Functions are pinned to `europe-west1` (Belgium) — the usual low-latency
Google Cloud region for North Africa. Change it in `src/index.ts`
(`setGlobalOptions`) if you pick a different region.
