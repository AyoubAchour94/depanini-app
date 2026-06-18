# features/auth

Authentication feature (Phase 2+). **Shared by both flavors.**

Will contain the Firebase **Phone OTP** flow:
- Phone number entry (Tunisia: +216) and OTP verification screens.
- Auth state controller/provider wrapping `firebase_auth`.
- Session bootstrap (logged-in vs logged-out routing).
- Sign-out.

Suggested layout when implemented:
```
auth/
  data/        # FirebaseAuth wrappers, repositories
  domain/      # auth models, value objects (PhoneNumber, OtpCode)
  presentation/# screens, widgets, controllers
```

Flavor note: the driver app may require an extra approval/onboarding step
after OTP — branch on `FlavorConfig.instance.isDriverApp`.
