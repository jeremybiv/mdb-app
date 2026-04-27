import { useState } from 'react';

export function DebugPanel({ data }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((o) => !o)}
        className="text-xs font-mono text-muted hover:text-dim flex items-center gap-1">
        <span>{open ? '▼' : '▶'}</span> Debug API ({data.source ?? '—'})
      </button>
      {open && (
        <pre className="mt-2 text-[10px] font-mono text-dim bg-ink border border-border rounded-md p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
