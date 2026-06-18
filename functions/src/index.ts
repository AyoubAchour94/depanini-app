/**
 * Depanini Cloud Functions — Phase 1 scaffold.
 *
 * This file intentionally contains NO business logic yet. Its only job in
 * Phase 1 is to give us a single deployable function so we can validate the
 * end-to-end deploy pipeline:
 *
 *     firebase deploy --only functions
 *
 * Real features (trip matching, driver dispatch, pricing, notifications, …)
 * will be added in later phases. Keep each feature in its own module under
 * `src/` and re-export from here.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";

// Initialize the Admin SDK exactly once. When deployed, credentials are
// provided automatically by the Cloud Functions runtime.
admin.initializeApp();

// Pin a region close to Tunisia to reduce latency. `europe-west1` (Belgium)
// is the usual low-latency choice for North Africa on Google Cloud.
setGlobalOptions({ region: "europe-west1", maxInstances: 10 });

/**
 * healthCheck — an HTTPS *callable* function used only to confirm that the
 * deploy pipeline works end to end and that the app can reach Functions.
 *
 * Callable functions are invoked from Flutter via the `cloud_functions`
 * package, e.g.:
 *
 *   final callable = FirebaseFunctions.instanceFor(region: 'europe-west1')
 *       .httpsCallable('healthCheck');
 *   final result = await callable.call();
 *   print(result.data); // { status: 'ok', ... }
 *
 * Returns: { status: "ok", timestamp: <ISO8601>, region: "europe-west1" }
 */
export const healthCheck = onCall((request) => {
  // No auth requirement in Phase 1 — this is just a pipeline smoke test.
  // (In later phases, gate sensitive callables on `request.auth`.)
  try {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      region: "europe-west1",
      // Echo back whether the caller was authenticated, purely for debugging.
      authenticated: request.auth != null,
    };
  } catch (err) {
    // Surface unexpected errors as a proper callable error so the client
    // receives a structured response instead of a generic 500.
    throw new HttpsError("internal", "healthCheck failed", `${err}`);
  }
});
