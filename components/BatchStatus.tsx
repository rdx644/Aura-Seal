'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from './client';
import type { JobStatus } from '@/lib/issuance';

type Item = {
  id: string; publicId: string; displayName: string; status: string; jobStatus: JobStatus; errorCode: string | null; attempts: number; created: boolean;
};
type Batch = { items: Item[]; history: { action: string; created_at: string }[] };

export function BatchStatus({ id, issuer }: { id: string; issuer: boolean }) {
  const [batch, setBatch] = useState<Batch>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<{ id: string; type: 'revoke' | 'reissue' }>();
  const refresh = useCallback(async () => {
    try {
      setBatch(await api<Batch>('issuance-batches/' + id));
    } catch (failure) { setError((failure as Error).message); }
  }, [id]);
  const pending = !batch || batch.items.some(item => item.status === 'issued' && ['working', 'queued'].includes(item.jobStatus));
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api<Batch>('issuance-batches/' + id);
        if (active) setBatch(next);
      } catch (failure) {
        if (active) setError((failure as Error).message);
      }
      if (active && pending) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [id, pending]);

  async function mutate(item: string, kind: string, body: object) {
    setBusy(true);
    setError('');
    try {
      await api('certificates/' + item + '/' + kind, body);
      setAction(undefined);
      await refresh();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action) void mutate(action.id, action.type, { reason: new FormData(event.currentTarget).get('reason') });
  }

  const ready = batch?.items.filter(item => item.status === 'issued' && item.jobStatus === 'ready').length ?? 0;
  const count = batch?.items.length ?? 0;
  return <section className="panel admin-panel">
    <div className="panel-heading"><h2>Issued batch</h2><span role="status" className="small">{batch ? ready + ' of ' + count + ' exports ready' : 'Loading progress…'}</span></div>
    {error && <p className="error" role="alert">{error}</p>}
    {batch && <>
      <progress value={ready} max={count || 1} aria-label="Ready exports" />
      <ul className="batch-list">{batch.items.map(item => <li key={item.id}>
        <div><Link href={'/v/' + item.publicId}>{item.displayName} ↗</Link>
          <small>{item.status === 'issued' ? item.jobStatus : item.status}{!item.created ? ' · Existing record' : ''}{item.errorCode ? ' · ' + item.errorCode.replaceAll('_', ' ') : ''}</small></div>
        {issuer && <div className="row-actions">
          {['failed', 'partial'].includes(item.jobStatus) && item.status === 'issued' && <button disabled={busy} className="text-button" onClick={() => void mutate(item.id, 'retry', {})}>Retry</button>}
          {item.status === 'issued' && <button disabled={busy} className="text-button" onClick={() => setAction({ id: item.id, type: 'revoke' })}>Revoke</button>}
          <button disabled={busy} className="text-button" onClick={() => setAction({ id: item.id, type: 'reissue' })}>Reissue</button>
        </div>}
        {action?.id === item.id && <form className="action-form form-stack" onSubmit={submit}>
          <label>{action.type === 'revoke' ? 'Revocation reason' : 'Reissue reason'} <input name="reason" required maxLength={200} /></label>
          <div className="row-actions"><button className="button primary" disabled={busy}>Confirm {action.type}</button><button className="button secondary" type="button" onClick={() => setAction(undefined)}>Cancel</button></div>
        </form>}
      </li>)}</ul>
      <details><summary>Audit history</summary><ul className="audit-list">
        {batch.history.map((entry, index) => <li key={entry.created_at + index}>{entry.action.replaceAll('_', ' ')} · <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></li>)}
      </ul></details>
    </>}
  </section>;
}
