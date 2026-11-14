import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { discardOutboxItem, listOutbox, retrySync } from '@/cloud/sync';
import { explainSyncError, syncItemName } from '@/cloud/syncErrors';
import { timeAgo } from '@/utils';

/** Shows what is waiting to upload, why it is stuck in plain words, and lets the user retry or remove it. */
export function WaitingUploads() {
  const cloud = useApp((s) => s.cloud);
  const toast = useApp((s) => s.toast);
  const [items, setItems] = useState<Awaited<ReturnType<typeof listOutbox>>>([]);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => void listOutbox().then(setItems), []);
  useEffect(refresh, [refresh, cloud.pending, cloud.state]);
  const advice = explainSyncError(cloud.error);

  return (
    <section id="waiting-uploads" aria-labelledby="wu-h" className="mb-4 rounded-xl border border-act/40 bg-act/10 p-4">
      <h3 id="wu-h" className="flex items-center gap-2 font-semibold">
        <CloudOff className="h-4 w-4 text-act" aria-hidden /> {items.length ? `${items.length} item${items.length === 1 ? '' : 's'} waiting to upload` : 'Sync problem'}
      </h3>
      {advice && (
        <div className="mt-2 text-sm">
          <p className="font-semibold">{advice.title}</p>
          <p className="muted">{advice.fix}</p>
          <details className="mt-1 text-xs">
            <summary className="muted cursor-pointer">Technical details</summary>
            <code className="mt-1 block whitespace-pre-wrap break-words text-slate-300">{cloud.error}</code>
          </details>
        </div>
      )}
      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.seq} className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{syncItemName(it.table)}</span>
                <span className="muted block text-xs">
                  Waiting since {timeAgo(it.createdAt)}
                  {it.tries ? ` · refused ${it.tries} time${it.tries === 1 ? '' : 's'}` : ''}
                </span>
              </span>
              <button
                className="btn-ghost h-11 shrink-0"
                aria-label={`Remove waiting ${syncItemName(it.table)} from the upload list`}
                onClick={async () => {
                  if (!confirm('Remove this item from the upload list? It stays on this device, but Mission Control will not receive it.')) return;
                  await discardOutboxItem(it.seq);
                  refresh();
                  toast({ title: 'Removed from the upload list', body: 'The record is still saved on this device.', level: 'info' });
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        className="btn-primary mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await retrySync();
          setBusy(false);
          refresh();
        }}
      >
        <RefreshCw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden /> Try again now
      </button>
    </section>
  );
}
