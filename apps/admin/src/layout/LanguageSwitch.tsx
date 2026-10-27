import { isLanguageCode, LANGUAGES, useTranslation } from '../i18n';
import { useLanguageSetting } from '../i18n/language';
import { Select } from '../ui/Input';

/** Picks the language of the app; the choice is remembered in this browser. */
export function LanguageSwitch() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageSetting();
  return (
    <Select
      label={t('common:language')}
      value={language}
      onChange={(event) => {
        if (isLanguageCode(event.target.value)) setLanguage(event.target.value);
      }}
    >
      {LANGUAGES.map((item) => (
        // Each language is named in its own language, whichever one is active.
        <option key={item.code} value={item.code} lang={item.code}>
          {item.label}
        </option>
      ))}
    </Select>
  );
}
