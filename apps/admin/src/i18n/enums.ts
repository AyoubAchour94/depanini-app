import { useTranslation } from '.';

/** The groups of `locales/<lng>/enums.json`. */
export type EnumGroup =
  | 'verification'
  | 'documentKind'
  | 'truck'
  | 'vehicle'
  | 'problem'
  | 'tripStatus'
  | 'offerStatus'
  | 'paymentStatus'
  | 'paymentMethod'
  | 'party'
  | 'ratingTag'
  | 'reportCategory'
  | 'reportStatus'
  | 'auditAction'
  | 'auditTarget';

/** `flat_tire` as readable text, for a value the API sends that has no message yet. */
function humanize(value: string): string {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The label of an API enum value in the active language, e.g. `label('truck', 'flatbed')`. */
export function useEnumLabel(): (group: EnumGroup, value: string) => string {
  const { t } = useTranslation();
  return (group, value) => t(`enums:${group}.${value}`, { defaultValue: humanize(value) });
}
