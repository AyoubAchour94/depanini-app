import { TOW_REQUEST_STATUSES, towRequestStatusSchema } from '@depanini/shared';
import { useSearchParams } from 'react-router';

import { useTrips } from '../../api/lookups';
import { useTranslation } from '../../i18n';
import { useEnumLabel } from '../../i18n/enums';
import { Input, Select } from '../../ui/Input';
import { PagedList } from '../../ui/PagedList';
import { SearchForm } from '../../ui/SearchForm';
import { TripsTable } from './TripsTable';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Trips, filtered by status and date range, searched by id, receipt, customer or driver. */
export function TripsPage() {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = towRequestStatusSchema.safeParse(params.get('status'));
  const from = DAY.test(params.get('from') ?? '') ? params.get('from')! : undefined;
  const to = DAY.test(params.get('to') ?? '') ? params.get('to')! : undefined;
  const trips = useTrips({ q, status: status.success ? status.data : undefined, from, to });
  const rows = trips.data?.pages.flatMap((page) => page.items) ?? [];

  /** Sets (or clears) one filter, keeping the others. */
  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next);
  }

  return (
    <>
      <h1>{t('trips:title')}</h1>
      <div className="row row--end" style={{ marginBottom: 'var(--space-4)' }}>
        <SearchForm
          label={t('trips:searchLabel')}
          value={q}
          onSearch={(value) => setFilter('q', value)}
        />
        <Select
          label={t('common:status')}
          value={status.success ? status.data : ''}
          onChange={(event) => setFilter('status', event.target.value)}
        >
          <option value="">{t('common:all')}</option>
          {TOW_REQUEST_STATUSES.map((value) => (
            <option key={value} value={value}>
              {label('tripStatus', value)}
            </option>
          ))}
        </Select>
        <Input
          label={t('trips:from')}
          type="date"
          value={from ?? ''}
          onChange={(event) => setFilter('from', event.target.value)}
        />
        <Input
          label={t('trips:to')}
          type="date"
          value={to ?? ''}
          onChange={(event) => setFilter('to', event.target.value)}
        />
      </div>
      <PagedList query={trips} failure={t('trips:loadFailed')}>
        <TripsTable caption={t('trips:title')} rows={rows} />
      </PagedList>
    </>
  );
}
