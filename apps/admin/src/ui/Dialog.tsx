import { type ReactNode, useEffect, useId, useRef } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A modal dialog: labelled by its title, closed with Escape, focus moves into it. */
export function Dialog({ title, onClose, children }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    const target = panel.current?.querySelector<HTMLElement>('textarea, input, button');
    target?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return (
    <div className="overlay">
      <div
        ref={panel}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2 id={titleId} style={{ marginTop: 0 }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
