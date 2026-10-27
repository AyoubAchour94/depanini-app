import type { ReactNode } from 'react';

import { useTranslation } from '../i18n';
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
  /** Shown when loading fails, already translated. */
  failure: string;
  children: ReactNode;
}

/** Loading and error states around a list, and the "Load more" button under it. */
export function PagedList({ query, failure, children }: Props) {
  const { t } = useTranslation();
  return (
    <>
      {query.isPending ? <p className="muted">{t('common:loading')}</p> : null}
      {query.isError ? (
        <p role="alert" className="error">
          {failure}
        </p>
      ) : null}
      {!query.isPending && !query.isError ? children : null}
      {query.hasNextPage ? (
        <p>
          <Button onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {t('common:loadMore')}
          </Button>
        </p>
      ) : null}
    </>
  );
}
