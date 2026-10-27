import type { LanguageCode } from '../languages';
import { en } from './en';
import { fr } from './fr';

/** The same shape as `en`, with every leaf a string. */
type Strings<T> = { [K in keyof T]: T[K] extends string ? string : Strings<T[K]> };
export type Messages = Strings<typeof en>;

/** The message files by language. */
export const resources: Record<LanguageCode, Messages> = { fr, en };

export const NAMESPACES = Object.keys(en) as (keyof typeof en)[];
