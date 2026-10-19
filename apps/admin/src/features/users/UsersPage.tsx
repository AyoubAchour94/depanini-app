import { Link, useSearchParams } from 'react-router';

import { useUsers } from '../../api/lookups';
import { PagedList } from '../../ui/PagedList';
import { SearchForm } from '../../ui/SearchForm';
import { Table } from '../../ui/Table';
import { formatDate } from '../drivers/labels';

/** Accounts, found by the start of an email or phone number. */
export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const users = useUsers(q);
  const rows = users.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <h1>Users</h1>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <SearchForm
          label="Email or phone"
          value={q}
          onSearch={(value) => setParams(value ? { q: value } : {})}
        />
      </div>
      <PagedList query={users} failure="Could not load the users.">
        <Table
          caption="Users"
          rows={rows}
          rowKey={(user) => user.id}
          empty="No users found."
          columns={[
            {
              header: 'Name',
              cell: (user) => (
                <Link to={`/users/${user.id}`}>
                  {user.customerName ?? user.driverName ?? 'No profile'}
                </Link>
              ),
            },
            { header: 'Email', cell: (user) => user.email ?? '-' },
            { header: 'Phone', cell: (user) => user.phone ?? '-' },
            {
              header: 'Roles',
              cell: (user) =>
                [user.customerName ? 'Customer' : null, user.driverName ? 'Driver' : null]
                  .filter(Boolean)
                  .join(', ') || '-',
            },
            { header: 'Joined', cell: (user) => formatDate(user.createdAt) },
          ]}
        />
      </PagedList>
    </>
  );
}
