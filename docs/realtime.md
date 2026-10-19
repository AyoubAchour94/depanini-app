# Realtime: `/ws`

The API pushes trip changes to the people involved over one WebSocket endpoint,
`/ws`, on the same host and port as the REST API. It only pushes: the apps still
make every change over REST, and they keep polling every 30 s as a fallback, so a
dropped socket never breaks a trip. The messages are the zod schemas in
`packages/shared/src/realtime.ts`.

Code: `apps/api/src/realtime/` (`RealtimeGateway`, `RealtimeService`, `TripEvents`).
It runs on `@nestjs/platform-ws` (`WsAdapter`), which attaches to the Fastify app's
Node HTTP server.

## Protocol

1. The client opens `ws(s)://<api>/ws`.
2. Its first message is `{"type":"auth","token":"<Firebase ID token>"}`. The token
   is checked by the same verifier as REST's `FirebaseAuthGuard`.
   - Valid: the server answers `{"type":"auth.ok"}`.
   - Invalid: `{"type":"auth.error","message":"..."}`, then close code **4401**.
   - Anything else before `auth` (bad JSON, other types) is ignored.
   - No valid `auth` within **10 s**: close code **4408**.
3. After that the server only sends. Client messages are ignored, a second `auth`
   included.
4. The server closes the socket with **4401** when the token expires (Firebase ID
   tokens last an hour). The app reconnects with a fresh token.
5. The server pings every **30 s** and drops a socket that has not answered the
   previous ping (the browser and `ws` answer pings by themselves).

On a close, the app reconnects with backoff and refetches over REST, since events
sent while it was away are lost.

## Events

| Message           | Sent to                                         | When                                                                                            |
| ----------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `request.updated` | the request's customer, and its assigned driver | accept, each trip stage, complete, cancel, the driver deleting their account mid-job            |
| `offer.updated`   | the offer's driver, and the request's customer  | create, withdraw, decline, accept, reject (on accept or cancel), withdrawn because of an accept |
| `driver.location` | the customer of the driver's assigned job       | each `PUT /driver/presence` with a location, while there is an ETA (not while `arrived`)        |
| `nearby.changed`  | online drivers near a request's pickup          | a request is created, cancelled while open, assigned (offer accepted), or expires               |

Each recipient gets the payload its own REST endpoints return, built with the same
mappers:

- `request.updated` to the customer is the request as on `GET /tow-requests/active`.
  To the assigned driver it is the job as on `GET /driver/job` while assigned, and the
  request (without the customer's contact) once it is completed or cancelled.
- `offer.updated` to the driver is the offer as on `GET /driver/offers/active`; to the
  customer it adds the driver's name and truck type, as on `GET /tow-requests/:id/offers`.
- `driver.location` carries the location and `etaMin` exactly as `GET /tow-requests/active`
  would compute them at that moment.

`nearby.changed` is a hint with no data, just `{"type":"nearby.changed"}`: the driver app
invalidates its nearby list and refetches `GET /driver/requests/nearby`; the customer app
ignores it. It goes to every driver that is `online`, has a location fresher than
`PRESENCE_STALE_MS` and is within `NEARBY_RADIUS_M` of the request's pickup (the nearby
query, reversed, in `TripEvents.nearbyChanged`), never to the request's own customer. It is
not sent when an assigned job is cancelled, since that does not change the open list.

Nobody else gets anything: other drivers who offered hear only about their own offer.

Events are published **after** the transaction that made the change has committed,
and their payloads are read back from the database at that point, so a client never
hears of a change it cannot yet see over REST. Publishing is best effort: a failure
is logged and never fails the REST call.

**Expiry:** requests and offers that expire are not published as `request.updated` /
`offer.updated` in v1. Expiry is lazy (it happens inside other calls, see
`tow-requests/expiry.ts`), so there is no single place to publish it from; the 30 s
polling picks it up. The exception is `nearby.changed`: `expireStaleRequests` returns the
ids of the requests it actually flipped, and the calling service publishes the hint for
those (best effort), so a request that expired is not published twice.

## Single instance only

`RealtimeService` keeps the open sockets in memory, keyed by user id. An event reaches
only the sockets connected to the API instance that handled the REST call, so this
works while the API runs as **one instance**. Running several (Cloud Run scaling out)
needs a pub/sub between instances, e.g. Redis or Postgres `LISTEN/NOTIFY`: each
instance publishes there and delivers to its own sockets. That is planned for Phase 9,
with the production deploy. Until then, keep the API service at one instance.
