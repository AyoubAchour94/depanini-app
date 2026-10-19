import { MAX_RESOLUTION_NOTE_LENGTH, resolveInputSchema } from '@depanini/shared';
import { type UseMutationResult } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';

import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextArea } from '../../ui/Input';

interface Props {
  title: string;
  /** What the note is for, e.g. "Resolution note (kept on the report)". */
  noteLabel: string;
  resolve: UseMutationResult<unknown, Error, { note: string }>;
  onClose: () => void;
}

/** Resolving needs a note: the confirm button stays refused until there is one. */
export function ResolveDialog({ title, noteLabel, resolve, onClose }: Props) {
  const [note, setNote] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = resolveInputSchema.safeParse({ note });
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? 'Write a note');
      return;
    }
    setInvalid(null);
    resolve.mutate(parsed.data, { onSuccess: onClose });
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <form className="stack" onSubmit={submit} noValidate>
        <TextArea
          label={noteLabel}
          value={note}
          maxLength={MAX_RESOLUTION_NOTE_LENGTH + 100}
          onChange={(event) => setNote(event.target.value)}
          error={invalid}
        />
        {resolve.error ? (
          <p role="alert" className="error">
            {resolve.error.message}
          </p>
        ) : null}
        <div className="dialog__actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={resolve.isPending}>
            Confirm resolution
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
