import type { LanguageCode } from '../languages';
import { en } from './en';

/**
 * The message files by language. `fr` and `ar` drop in here as they are
 * written; until then they fall back to `en` message by message.
 */
export const resources: Partial<Record<LanguageCode, typeof en>> = { en };

export const NAMESPACES = Object.keys(en) as (keyof typeof en)[];
