import type { DriverDocument } from '@depanini/shared';
import { useEffect, useState } from 'react';

import { useApi } from '../../api/ApiProvider';
import { KIND_LABEL } from './labels';

type FileState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; url: string };

/**
 * One uploaded page, shown inline: an image in `<img>`, a PDF in `<iframe>`. The bytes
 * come from `/admin/files/:id` with the auth header (which `src` cannot send), so they
 * are fetched as a blob and shown through an object URL, released on unmount.
 */
export function DocumentViewer({ document }: { document: DriverDocument }) {
  const api = useApi();
  const [file, setFile] = useState<FileState>({ status: 'loading' });
  const label = `${KIND_LABEL[document.kind]}, page ${document.page}`;

  useEffect(() => {
    let objectUrl: string | undefined;
    let active = true;
    api.blob(`/admin/files/${document.id}`).then(
      (blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setFile({ status: 'ready', url: objectUrl });
      },
      () => {
        if (active) setFile({ status: 'failed' });
      },
    );
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, document.id]);

  if (file.status === 'failed') {
    return (
      <p role="alert" className="error">
        Could not load {label}.
      </p>
    );
  }
  if (file.status === 'loading') return <p className="muted">Loading {label}…</p>;
  return document.contentType === 'application/pdf' ? (
    <iframe className="document__file" src={file.url} title={label} />
  ) : (
    <img className="document__file" src={file.url} alt={label} />
  );
}
