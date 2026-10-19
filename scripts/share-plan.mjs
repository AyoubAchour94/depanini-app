// Pure planning for scripts/share.mjs (kept apart so it can be unit tested).

export const MODES = ['user', 'driver', 'both', 'admin'];

export const PORTS = {
  web: 8081,
  webDriver: 8082,
  webAdmin: 5173,
  api: 3000,
  emulator: 9099,
  db: 5432,
};

/**
 * The web apps a mode starts: Expo web for `user` / `driver` / `both`, the Vite admin app for
 * `admin` (not part of `both`: it is a desktop tool for the team, not a phone app).
 * A single Expo variant runs on `web` as always; `both` runs the customer on `web` and the driver on `webDriver`.
 */
export function planApps(mode) {
  if (mode === 'admin') return [{ variant: 'admin', port: PORTS.webAdmin }];
  if (mode === 'both') {
    return [
      { variant: 'user', port: PORTS.web },
      { variant: 'driver', port: PORTS.webDriver },
    ];
  }
  return [{ variant: mode, port: PORTS.web }];
}

/** CORS_ORIGINS for the API: every app's localhost origin and public URL. */
export function corsOrigins(apps, publicUrls) {
  return apps.flatMap((app) => [`http://localhost:${app.port}`, publicUrls[app.variant]]);
}
