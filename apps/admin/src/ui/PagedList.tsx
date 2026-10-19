import type { ReactNode } from 'react';

import { Button } from './Button';

interface PagedQuery {
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
}

interface Props {
  query: PagedQuery;
  /** Shown when loading fails, e.g. "Could not load the users." */
  failure: string;
  children: ReactNode;
}

/** Loading and error states around a list, and the "Load more" button under it. */
export function PagedList({ query, failure, children }: Props) {
  return (
    <>
      {query.isPending ? <p className="muted">Loading…</p> : null}
      {query.isError ? (
        <p role="alert" className="error">
          {failure}
        </p>
      ) : null}
      {!query.isPending && !query.isError ? children : null}
      {query.hasNextPage ? (
        <p>
          <Button onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            Load more
          </Button>
        </p>
      ) : null}
    </>
  );
}
