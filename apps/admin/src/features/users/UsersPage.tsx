import { Link, useSearchParams } from 'react-router';

import { useUsers } from '../../api/lookups';
import { useTranslation } from '../../i18n';
import { useEnumLabel } from '../../i18n/enums';
import { PagedList } from '../../ui/PagedList';
import { SearchForm } from '../../ui/SearchForm';
import { Table } from '../../ui/Table';
import { formatDate } from '../drivers/labels';

/** Accounts, found by the start of an email or phone number. */
export function UsersPage() {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const users = useUsers(q);
  const rows = users.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <h1>{t('users:title')}</h1>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <SearchForm
          label={t('users:searchLabel')}
          value={q}
          onSearch={(value) => setParams(value ? { q: value } : {})}
        />
      </div>
      <PagedList query={users} failure={t('users:loadFailed')}>
        <Table
          caption={t('users:title')}
          rows={rows}
          rowKey={(user) => user.id}
          empty={t('users:empty')}
          columns={[
            {
              header: t('users:columns.name'),
              cell: (user) => (
                <Link to={`/users/${user.id}`}>
                  {user.customerName ?? user.driverName ?? t('users:noProfile')}
                </Link>
              ),
            },
            { header: t('users:columns.email'), cell: (user) => user.email ?? '-' },
            { header: t('users:columns.phone'), cell: (user) => user.phone ?? '-' },
            {
              header: t('users:columns.roles'),
              cell: (user) =>
                [
                  user.customerName ? label('party', 'customer') : null,
                  user.driverName ? label('party', 'driver') : null,
                ]
                  .filter(Boolean)
                  .join(', ') || '-',
            },
            { header: t('users:columns.joined'), cell: (user) => formatDate(user.createdAt) },
          ]}
        />
      </PagedList>
    </>
  );
}
