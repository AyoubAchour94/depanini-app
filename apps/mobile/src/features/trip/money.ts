import { formatMoney } from '@/i18n/format';

/** An amount of whole dinars as shown everywhere in the app, e.g. "85 TND". */
export const formatTnd = (amount: number) => formatMoney(amount);
