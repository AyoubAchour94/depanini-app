import audit from './audit.json';
import auth from './auth.json';
import common from './common.json';
import drivers from './drivers.json';
import enums from './enums.json';
import nav from './nav.json';
import queues from './queues.json';
import trips from './trips.json';
import users from './users.json';

/** English, the source of the key set: every key exists here, and `fr` must have all of them. */
export const en = { common, enums, nav, auth, drivers, queues, trips, users, audit };
