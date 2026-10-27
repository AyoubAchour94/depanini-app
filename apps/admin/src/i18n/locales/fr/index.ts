import type { Messages } from '..';
import audit from './audit.json';
import auth from './auth.json';
import common from './common.json';
import drivers from './drivers.json';
import enums from './enums.json';
import nav from './nav.json';
import queues from './queues.json';
import trips from './trips.json';
import users from './users.json';

/** French, the default language. Typed against `en`, so a missing or extra key fails the build. */
export const fr: Messages = { common, enums, nav, auth, drivers, queues, trips, users, audit };
