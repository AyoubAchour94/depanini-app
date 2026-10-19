/** Who is signed in, with what the ID token claims say. */
export interface AuthSession {
  email: string | null;
  /** The `admin: true` custom claim. */
  isAdmin: boolean;
}

/** What the app needs from Firebase Auth (a seam, so tests use a fake). */
export interface AuthService {
  /** Calls back now and on every change: the session, or `null` when signed out. */
  subscribe(listener: (session: AuthSession | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** The current ID token, refreshed when it is about to expire. */
  getToken(): Promise<string | null>;
}
