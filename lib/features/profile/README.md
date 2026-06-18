# features/profile

User & driver profile management (Phase 2+). **Shared, with extra fields for
drivers.**

Will contain:
- View/edit profile (name, phone, photo via `firebase_storage`).
- **Driver flavor:** vehicle details, tow-truck type, documents/verification,
  availability toggle, earnings summary.

Suggested layout:
```
profile/
  data/        # Firestore + Storage repositories
  domain/      # UserProfile, DriverProfile models
  presentation/# profile screens, edit forms
```
