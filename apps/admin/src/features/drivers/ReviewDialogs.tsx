import { MAX_REJECTION_REASON_LENGTH, reviewInputSchema } from '@depanini/shared';
import { type FormEvent, useState } from 'react';

import { useReviewDriver } from '../../api/drivers';
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
  const review = useReviewDriver(userId);
  return (
    <Dialog title={`Approve ${driverName}?`} onClose={onClose}>
      <p>They will be able to go online and take jobs.</p>
      <Failure error={review.error} />
      <div className="dialog__actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={review.isPending}
          onClick={() => review.mutate({ decision: 'approve' }, { onSuccess: onClose })}
        >
          Confirm approval
        </Button>
      </div>
    </Dialog>
  );
}

export function RejectDialog({ userId, driverName, onClose }: Props) {
  const review = useReviewDriver(userId);
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = reviewInputSchema.safeParse({ decision: 'reject', reason });
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? 'Give a reason');
      return;
    }
    setInvalid(null);
    review.mutate(parsed.data, { onSuccess: onClose });
  }

  return (
    <Dialog title={`Reject ${driverName}?`} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <TextArea
          label="Reason (shown to the driver)"
          value={reason}
          maxLength={MAX_REJECTION_REASON_LENGTH + 100}
          onChange={(event) => setReason(event.target.value)}
          error={invalid}
        />
        <Failure error={review.error} />
        <div className="dialog__actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={review.isPending}>
            Confirm rejection
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
