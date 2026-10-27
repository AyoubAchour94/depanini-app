import { DOCUMENT_KINDS } from '@depanini/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { ApiError } from '../../api/client';
import { useDriver } from '../../api/drivers';
import { useTranslation } from '../../i18n';
import { useEnumLabel } from '../../i18n/enums';
import { Button } from '../../ui/Button';
import { DocumentViewer } from './DocumentViewer';
import { formatDate, StatusBadge } from './labels';
import { ApproveDialog, RejectDialog } from './ReviewDialogs';

export function DriverDetailPage() {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const { userId = '' } = useParams();
  const driver = useDriver(userId);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);

  if (driver.isPending) return <p className="muted">{t('common:loading')}</p>;
  if (driver.isError) {
    const notFound = driver.error instanceof ApiError && driver.error.status === 404;
    return (
      <>
        <p role="alert" className="error">
          {notFound ? t('drivers:detail.notFound') : t('drivers:detail.loadFailed')}
        </p>
        <Link to="/drivers">{t('drivers:detail.back')}</Link>
      </>
    );
  }

  const data = driver.data;
  const close = () => setDialog(null);
  return (
    <>
      <p>
        <Link to="/drivers">{t('drivers:title')}</Link>
      </p>
      <div className="row">
        <h1>{data.fullName}</h1>
        <StatusBadge status={data.verificationStatus} />
      </div>

      <dl className="details">
        <dt>{t('drivers:detail.email')}</dt>
        <dd>{data.email ?? '-'}</dd>
        <dt>{t('drivers:detail.phone')}</dt>
        <dd>{data.phone}</dd>
        <dt>{t('drivers:detail.truck')}</dt>
        <dd>{label('truck', data.truckType)}</dd>
        <dt>{t('drivers:detail.plate')}</dt>
        <dd>{data.plateNumber}</dd>
        <dt>{t('drivers:detail.submitted')}</dt>
        <dd>{formatDate(data.submittedAt)}</dd>
        {data.reviewedAt ? (
          <>
            <dt>{t('drivers:detail.reviewed')}</dt>
            <dd>{formatDate(data.reviewedAt)}</dd>
          </>
        ) : null}
        {data.rejectionReason ? (
          <>
            <dt>{t('drivers:detail.rejectionReason')}</dt>
            <dd>{data.rejectionReason}</dd>
          </>
        ) : null}
      </dl>

      {data.verificationStatus === 'pending' ? (
        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <Button variant="primary" onClick={() => setDialog('approve')}>
            {t('drivers:detail.approve')}
          </Button>
          <Button variant="danger" onClick={() => setDialog('reject')}>
            {t('drivers:detail.reject')}
          </Button>
        </div>
      ) : null}

      <h2>{t('drivers:detail.documents')}</h2>
      {data.documents.length === 0 ? (
        <p className="muted">{t('drivers:detail.noDocuments')}</p>
      ) : null}
      {DOCUMENT_KINDS.map((kind) => {
        const pages = data.documents.filter((document) => document.kind === kind);
        if (pages.length === 0) return null;
        return (
          <section key={kind} aria-label={label('documentKind', kind)}>
            <h3>{label('documentKind', kind)}</h3>
            <div className="documents">
              {pages.map((document) => (
                <DocumentViewer key={document.id} document={document} />
              ))}
            </div>
          </section>
        );
      })}

      {dialog === 'approve' ? (
        <ApproveDialog userId={userId} driverName={data.fullName} onClose={close} />
      ) : null}
      {dialog === 'reject' ? (
        <RejectDialog userId={userId} driverName={data.fullName} onClose={close} />
      ) : null}
    </>
  );
}
