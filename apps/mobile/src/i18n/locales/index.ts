import type { LanguageCode } from '../languages';
import { ar } from './ar';
import { en } from './en';
import { fr } from './fr';

/**
 * The message files by language. `ar` has the same keys as `en`, plus the
 * Arabic plural forms (`_zero`, `_two`, `_few`, `_many`).
 */
export const resources: Record<LanguageCode, typeof en> = { en, fr, ar };

export const NAMESPACES = Object.keys(en) as (keyof typeof en)[];
