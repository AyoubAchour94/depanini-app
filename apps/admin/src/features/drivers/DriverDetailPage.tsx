import { DOCUMENT_KINDS } from '@depanini/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { ApiError } from '../../api/client';
import { useDriver } from '../../api/drivers';
import { Button } from '../../ui/Button';
import { DocumentViewer } from './DocumentViewer';
import { formatDate, humanize, KIND_LABEL, StatusBadge } from './labels';
import { ApproveDialog, RejectDialog } from './ReviewDialogs';

export function DriverDetailPage() {
  const { userId = '' } = useParams();
  const driver = useDriver(userId);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);

  if (driver.isPending) return <p className="muted">Loading…</p>;
  if (driver.isError) {
    const notFound = driver.error instanceof ApiError && driver.error.status === 404;
    return (
      <>
        <p role="alert" className="error">
          {notFound ? 'Driver not found.' : 'Could not load the driver.'}
        </p>
        <Link to="/drivers">Back to drivers</Link>
      </>
    );
  }

  const data = driver.data;
  const close = () => setDialog(null);
  return (
    <>
      <p>
        <Link to="/drivers">Drivers</Link>
      </p>
      <div className="row">
        <h1>{data.fullName}</h1>
        <StatusBadge status={data.verificationStatus} />
      </div>

      <dl className="details">
        <dt>Email</dt>
        <dd>{data.email ?? '-'}</dd>
        <dt>Phone</dt>
        <dd>{data.phone}</dd>
        <dt>Truck</dt>
        <dd>{humanize(data.truckType)}</dd>
        <dt>Plate</dt>
        <dd>{data.plateNumber}</dd>
        <dt>Submitted</dt>
        <dd>{formatDate(data.submittedAt)}</dd>
        {data.reviewedAt ? (
          <>
            <dt>Reviewed</dt>
            <dd>{formatDate(data.reviewedAt)}</dd>
          </>
        ) : null}
        {data.rejectionReason ? (
          <>
            <dt>Rejection reason</dt>
            <dd>{data.rejectionReason}</dd>
          </>
        ) : null}
      </dl>

      {data.verificationStatus === 'pending' ? (
        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <Button variant="primary" onClick={() => setDialog('approve')}>
            Approve
          </Button>
          <Button variant="danger" onClick={() => setDialog('reject')}>
            Reject
          </Button>
        </div>
      ) : null}

      <h2>Documents</h2>
      {data.documents.length === 0 ? <p className="muted">No documents uploaded.</p> : null}
      {DOCUMENT_KINDS.map((kind) => {
        const pages = data.documents.filter((document) => document.kind === kind);
        if (pages.length === 0) return null;
        return (
          <section key={kind} aria-label={KIND_LABEL[kind]}>
            <h3>{KIND_LABEL[kind]}</h3>
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
