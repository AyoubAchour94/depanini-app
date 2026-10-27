import { type FormEvent, useState } from 'react';

import { useTranslation } from '../i18n';
import { Button } from './Button';
import { Input } from './Input';

interface Props {
  label: string;
  /** The search in effect. */
  value: string;
  onSearch: (value: string) => void;
}

/** A search box that searches on submit (Enter or the button), not on every key. */
export function SearchForm({ label, value, onSearch }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(text.trim());
  }
  return (
    <form className="row row--end" role="search" onSubmit={submit}>
      <Input label={label} value={text} onChange={(event) => setText(event.target.value)} />
      <Button type="submit">{t('common:search')}</Button>
    </form>
  );
}
