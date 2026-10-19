# Push notifications

The API sends a push when something happens that a person would want to know while the
app is in the background. It is the counterpart of `/ws` (see `realtime.md`): `/ws` tells
people who have the app open, push tells the rest. The payload is `pushDataSchema` in
`packages/shared/src/push.ts`; the app reads it to open the right screen.

Code: `apps/api/src/push/` (`NotificationsService`, `DeviceTokens`, the senders).

## Device tokens

| Call                        | Body                                                      | Result                                                                        |
| --------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `PUT /me/devices`           | `{token, platform, appVariant}` (see `deviceInputSchema`) | `204`. Upserts by token: a token that moves to another account is reassigned. |
| `DELETE /me/devices/:token` | none                                                      | `204`. Removes the caller's own token only (call it on sign-out).             |

`appVariant` is `user` (the customer app) or `driver`. Deleting an account deletes its
tokens. A token the push service reports as dead (not registered, invalid) is deleted too.

## Who is pushed, and when

`TripEvents` hands every after-commit change to `NotificationsService` (so there is one
hook point). The caller passes the **event** it just committed (a stage change with its stage,
a cancel with who cancelled, an offer accepted, declined, ...), and the push is built from that
event, never from the row's state at send time, so two quick changes are two pushes in the right
order. Only the recipients (customer, assigned driver, offer's driver) and their tokens are read
back. The `/ws` events still read the latest row. Pushes are sent one after another, in the order
the events happened.

| Kind               | Recipient (app)    | When                                                                                                                                                                                                                                                     |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nearby_request`   | drivers (`driver`) | a request is created, to online drivers with a fresh location in range, not its customer; only while it is open                                                                                                                                          |
| `offer_received`   | customer (`user`)  | a driver offers                                                                                                                                                                                                                                          |
| `offer_accepted`   | driver             | the customer accepts their offer                                                                                                                                                                                                                         |
| `offer_rejected`   | driver             | the customer declines the offer, or accepts another                                                                                                                                                                                                      |
| `offer_expired`    | driver             | the offer lapsed (marked lazily, on the next read)                                                                                                                                                                                                       |
| `trip_stage`       | customer           | the driver is en route, arrived, or towing                                                                                                                                                                                                               |
| `trip_completed`   | customer           | the driver completed the trip                                                                                                                                                                                                                            |
| `payment_answered` | driver             | the customer confirmed or disputed the payment                                                                                                                                                                                                           |
| `trip_cancelled`   | driver / customer  | the customer cancelled an assigned trip / the driver did (also when their account is deleted). Also to a driver whose offer was pending when the customer cancelled the open request, with `offerId` and the body "The customer cancelled this request." |

Rules:

- **Not when it would not help.** A user with a live `/ws` socket is skipped.
- **Right app only.** Driver events go to `driver` tokens, customer events to `user` tokens, so someone
  signed in to both apps is not pushed twice.
- **Collapse keys.** `offer:<requestId>` for `nearby_request` and `offer_*`, `trip:<requestId>` for
  the rest, so a burst of offers is one notification on the device.
- **Best effort, fire and forget.** The push is started after the commit and not awaited: the request
  does not wait for the provider, and a failure is logged and never fails it. Tests can await
  `NotificationsService.flush()`; on shutdown the service flushes, waiting at most 5 s; the e2e flow
  polls the inbox instead.
- Titles and bodies are short English strings in `push/messages.ts` (localized in Phase 9).

## Providers

`PUSH_PROVIDER` picks the `PushSender` (`push/push-sender.ts`):

| Value           | Does                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `log` (default) | Logs each push and keeps the last 200 in memory. Sends nothing anywhere.                                                                                                                                                                                                                                                                                                                 |
| `fcm`           | Sends through Firebase Cloud Messaging (`sendEachForMulticast`). Android channel `default`, high priority for trip and offer pushes, APNs sound `default`, `data` as strings. Tokens FCM reports as `registration-token-not-registered` or `invalid-registration-token` are deleted. `invalid-argument` (usually a payload bug, for every token) only logs a warning with the push kind. |

### The dev push inbox

With `PUSH_INBOX=1`, `NODE_ENV` not `production` and the `log` sender, the API serves
`GET /dev/push-inbox?userId=<id>` (the user's pushes, oldest first, each with the `appVariant` of the
token that got it) and `DELETE /dev/push-inbox` (clears it). It has no sign-in. In any other
configuration it answers `404` with the same body as an unknown route (`Cannot <METHOD> <url>`). `pnpm e2e:flow` uses it and skips its push
checks when it gets a `404`.

### Switching to FCM

1. Create a service-account key for the Firebase project (Project settings, Service accounts), and for
   iOS upload an APNs key in Cloud Messaging (issue #100).
2. Set on the API: `PUSH_PROVIDER=fcm` and either `GOOGLE_APPLICATION_CREDENTIALS=/path/key.json` or
   `FIREBASE_SERVICE_ACCOUNT_JSON='{...}'`. Without one of the two the API refuses to start.
3. Build the apps with native FCM/APNs support (issue #2); they register their token with `PUT /me/devices`.

The API reuses the firebase-admin app it already creates for auth (`auth/firebase-app.ts`); only `fcm`
makes it load the service account.

## Env

| Variable                         | Default | Meaning                                         |
| -------------------------------- | ------- | ----------------------------------------------- |
| `PUSH_PROVIDER`                  | `log`   | `log` or `fcm`                                  |
| `PUSH_INBOX`                     | unset   | `1` enables the dev inbox (never in production) |
| `GOOGLE_APPLICATION_CREDENTIALS` | unset   | key file path, for `fcm`                        |
| `FIREBASE_SERVICE_ACCOUNT_JSON`  | unset   | the key as JSON, for `fcm`                      |

## Tests

`apps/api/test/push.e2e-spec.ts` covers devices, every kind with recipients, data and collapse keys,
the skip-when-live rule, variant targeting, a failing sender and the unavailable inbox, all over HTTP.
`push/fcm-push-sender.spec.ts` covers the FCM payload and token cleanup against a mocked messaging client.
`pnpm e2e:flow` checks the same against a running API (start it with `PUSH_INBOX=1`).
