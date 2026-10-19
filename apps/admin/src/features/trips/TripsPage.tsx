import { TOW_REQUEST_STATUSES, towRequestStatusSchema } from '@depanini/shared';
import { useSearchParams } from 'react-router';

import { useTrips } from '../../api/lookups';
import { Input, Select } from '../../ui/Input';
import { PagedList } from '../../ui/PagedList';
import { SearchForm } from '../../ui/SearchForm';
import { humanize } from '../drivers/labels';
import { TripsTable } from './TripsTable';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Trips, filtered by status and date range, searched by id, receipt, customer or driver. */
export function TripsPage() {
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
      <h1>Trips</h1>
      <div className="row row--end" style={{ marginBottom: 'var(--space-4)' }}>
        <SearchForm
          label="Trip id, receipt, customer or driver"
          value={q}
          onSearch={(value) => setFilter('q', value)}
        />
        <Select
          label="Status"
          value={status.success ? status.data : ''}
          onChange={(event) => setFilter('status', event.target.value)}
        >
          <option value="">All</option>
          {TOW_REQUEST_STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </Select>
        <Input
          label="From"
          type="date"
          value={from ?? ''}
          onChange={(event) => setFilter('from', event.target.value)}
        />
        <Input
          label="To"
          type="date"
          value={to ?? ''}
          onChange={(event) => setFilter('to', event.target.value)}
        />
      </div>
      <PagedList query={trips} failure="Could not load the trips.">
        <TripsTable caption="Trips" rows={rows} />
      </PagedList>
    </>
  );
}
