import {
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from 'react';

interface FieldProps {
  label: string;
  error?: string | null;
}

function Field({
  label,
  error,
  id,
  children,
}: FieldProps & { id: string; children: (describedBy: string | undefined) => ReactNode }) {
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children(error ? errorId : undefined)}
      {error ? (
        <span id={errorId} role="alert" className="error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** A labelled text input; `error` is announced and linked to the input. */
export function Input({
  label,
  error,
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field label={label} error={error} id={id}>
      {(describedBy) => (
        <input
          id={id}
          className="input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  error,
  ...rest
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Field label={label} error={error} id={id}>
      {(describedBy) => (
        <textarea
          id={id}
          className="input"
          rows={4}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </Field>
  );
}

export function Select({
  label,
  children,
  ...rest
}: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Field label={label} id={id}>
      {() => (
        <select id={id} className="input" {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}
