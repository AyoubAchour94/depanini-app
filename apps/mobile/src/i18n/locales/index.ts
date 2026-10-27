import type { LanguageCode } from '../languages';
import { en } from './en';
import { fr } from './fr';

/**
 * The message files by language. `ar` drops in here as it is written; until
 * then it falls back to `fr` message by message.
 */
export const resources: Partial<Record<LanguageCode, typeof en>> = { en, fr };

export const NAMESPACES = Object.keys(en) as (keyof typeof en)[];
