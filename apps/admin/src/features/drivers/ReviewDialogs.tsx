import { MAX_REJECTION_REASON_LENGTH, reviewInputSchema } from '@depanini/shared';
import { type FormEvent, useState } from 'react';

import { useReviewDriver } from '../../api/drivers';
import { useTranslation } from '../../i18n';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextArea } from '../../ui/Input';

interface Props {
  userId: string;
  driverName: string;
  onClose: () => void;
}

function Failure({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="error">
      {error.message}
    </p>
  ) : null;
}

export function ApproveDialog({ userId, driverName, onClose }: Props) {
  const { t } = useTranslation();
  const review = useReviewDriver(userId);
  return (
    <Dialog title={t('drivers:approve.title', { name: driverName })} onClose={onClose}>
      <p>{t('drivers:approve.body')}</p>
      <Failure error={review.error} />
      <div className="dialog__actions">
        <Button onClick={onClose}>{t('common:cancel')}</Button>
        <Button
          variant="primary"
          disabled={review.isPending}
          onClick={() => review.mutate({ decision: 'approve' }, { onSuccess: onClose })}
        >
          {t('drivers:approve.confirm')}
        </Button>
      </div>
    </Dialog>
  );
}

export function RejectDialog({ userId, driverName, onClose }: Props) {
  const { t } = useTranslation();
  const review = useReviewDriver(userId);
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = reviewInputSchema.safeParse({ decision: 'reject', reason });
    if (!parsed.success) {
      // The schema's texts are English; say it in the active language instead.
      setInvalid(
        reason.trim() ? t('drivers:reject.reasonTooLong') : t('drivers:reject.reasonRequired'),
      );
      return;
    }
    setInvalid(null);
    review.mutate(parsed.data, { onSuccess: onClose });
  }

  return (
    <Dialog title={t('drivers:reject.title', { name: driverName })} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <TextArea
          label={t('drivers:reject.reasonLabel')}
          value={reason}
          maxLength={MAX_REJECTION_REASON_LENGTH + 100}
          onChange={(event) => setReason(event.target.value)}
          error={invalid}
        />
        <Failure error={review.error} />
        <div className="dialog__actions">
          <Button onClick={onClose}>{t('common:cancel')}</Button>
          <Button type="submit" variant="danger" disabled={review.isPending}>
            {t('drivers:reject.confirm')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
