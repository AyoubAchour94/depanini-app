// Grants (or with --revoke, removes) the `admin` custom claim on a Firebase Auth account,
// which the API's AdminGuard requires on every /admin route. See README "Admin accounts".
//
//   pnpm admin:grant <email> [--revoke] [--project <id>] [--yes-real-project]
//
// It runs against the Auth emulator when FIREBASE_AUTH_EMULATOR_HOST is set, and refuses
// any real project unless --yes-real-project is passed (then it needs credentials:
// GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default login`).
// The account must sign in again (or refresh its ID token) to see the change.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// firebase-admin is a dependency of the API.
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));

/** The project the emulator runs (`pnpm emulators`) and the API's default. */
export const DEFAULT_PROJECT_ID = 'depanini-dev';

/**
 * Where a grant would go: `'emulator'` when an emulator host is set, `'real'` only when
 * the caller said so with `--yes-real-project`. Throws otherwise, so a missing emulator
 * variable never silently changes a real account.
 */
export function grantTarget({ emulatorHost, yesRealProject = false }) {
  if (emulatorHost) return 'emulator';
  if (yesRealProject) return 'real';
  throw new Error(
    'FIREBASE_AUTH_EMULATOR_HOST is not set, so this would change a REAL Firebase project. ' +
      'Set it (e.g. 127.0.0.1:9099) to use the emulator, or pass --yes-real-project if you mean it.',
  );
}

/** Reads `<email> [--revoke] [--project <id>] [--yes-real-project]`. */
export function parseArgs(argv) {
  const options = { email: undefined, revoke: false, projectId: undefined, yesRealProject: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--revoke') options.revoke = true;
    else if (arg === '--yes-real-project') options.yesRealProject = true;
    else if (arg === '--project') options.projectId = argv[(i += 1)];
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else if (options.email === undefined) options.email = arg;
    else throw new Error(`Unexpected argument ${arg}`);
  }
  if (!options.email) throw new Error('Usage: pnpm admin:grant <email> [--revoke]');
  if (options.projectId === undefined && argv.includes('--project')) {
    throw new Error('--project needs a project id');
  }
  return options;
}

/**
 * Sets `admin: true` on the account with this email (or removes it with `revoke`), keeping
 * its other custom claims. `emulatorHost` defaults to `FIREBASE_AUTH_EMULATOR_HOST`; see
 * {@link grantTarget} for the safety check. Returns the account's uid and new claims.
 */
export async function grantAdmin(
  email,
  {
    revoke = false,
    projectId = process.env.FIREBASE_PROJECT_ID ?? DEFAULT_PROJECT_ID,
    emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST,
    yesRealProject = false,
  } = {},
) {
  const target = grantTarget({ emulatorHost, yesRealProject });
  // firebase-admin reads the emulator host from the environment.
  if (target === 'emulator') process.env.FIREBASE_AUTH_EMULATOR_HOST = emulatorHost;

  const { initializeApp, deleteApp, applicationDefault } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const app = initializeApp(
    target === 'emulator' ? { projectId } : { projectId, credential: applicationDefault() },
    `admin-grant-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  try {
    const auth = getAuth(app);
    const user = await auth.getUserByEmail(email);
    const { admin: _, ...others } = user.customClaims ?? {};
    const claims = revoke ? others : { ...others, admin: true };
    await auth.setCustomUserClaims(user.uid, claims);
    return { uid: user.uid, claims, target, projectId };
  } finally {
    await deleteApp(app);
  }
}

async function main() {
  const { email, ...options } = parseArgs(process.argv.slice(2));
  const { uid, target, projectId } = await grantAdmin(email, options);
  const what = options.revoke ? 'Removed admin from' : 'Granted admin to';
  console.log(`${what} ${email} (${uid}) in ${projectId} (${target}).`);
  console.log('The account must sign in again (or refresh its ID token) to see the change.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
