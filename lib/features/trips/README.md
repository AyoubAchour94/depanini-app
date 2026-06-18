# features/trips

The towing trip / request lifecycle (Phase 3+). **Core domain, shared by both
flavors but with different presentation per flavor.**

Will contain:
- The `Trip` model and its Firestore mapping (status: requested → matched →
  enroute → arrived → completed / cancelled).
- Trip repository (Firestore reads/writes, real-time listeners).
- **User flavor:** request a tow, watch the assigned driver approach, ETA.
- **Driver flavor:** receive/accept requests, update status, navigate.

Suggested layout:
```
trips/
  data/        # Firestore repository, DTOs
  domain/      # Trip model, status enum, pricing
  presentation/# request flow (user) / job flow (driver)
```
