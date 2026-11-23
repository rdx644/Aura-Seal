'use client';

import { useState, type FormEvent } from 'react';
import { CertificatePreview } from './CertificatePreview';
import { BatchStatus } from './BatchStatus';
import { api } from './client';
import { labels, messages, type Claim, type Event, type Import, type Proposal } from '@/lib/contracts';
import { themeLabels } from '@/packages/certificate/art';

type Recent = { id: string; eventId: string; title: string; accepted: number; rejected: number; batchId: string | null };
type User = { organization: string; role: 'issuer' | 'reviewer' };

export function Workspace({ user, initialEvents, initialImports }: { user: User; initialEvents: Event[]; initialImports: Recent[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [history, setHistory] = useState(initialImports);
  const [eventId, setEventId] = useState(initialEvents[0]?.id ?? '');
  const [current, setCurrent] = useState<Import | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [showEvent, setShowEvent] = useState(!initialEvents.length);

  const event = events.find(event => event.id === (current?.eventId ?? eventId));
  const result = current?.rows[selected];
  const proposed = current?.proposal;
  const decision = result ? proposed?.plan[result.tier] ?? {
    theme: result.tier === 'winner' ? 'ember' as const : result.tier === 'finalist' ? 'bloom' as const : 'linen' as const,
    message: messages[0],
  } : null;
  const claim: Claim | undefined = event && result && decision ? {
    title: event.title, issuer: event.issuer, date: event.date, location: event.location, demo: event.demo,
    displayName: result.displayName, tier: result.tier, rank: result.rank, decision, templateVersion: 1,
  } : undefined;

  async function operate(label: string, operation: () => Promise<void>) {
    setError('');
    setBusy(label);
    try { await operation(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(''); }
  }

  async function create(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    const fields = new FormData(form.currentTarget);
    await operate('Creating event…', async () => {
      const { event } = await api<{ event: Event }>('events', {
        title: fields.get('title'), issuer: fields.get('issuer'), date: fields.get('date'),
        location: fields.get('location') || undefined, demo: fields.has('demo'), disclose: fields.has('disclose'),
      });
      setEvents(previous => [event, ...previous]);
      setEventId(event.id);
      setCurrent(null);
      setShowEvent(false);
    });
  }

  async function upload(form: FormEvent<HTMLFormElement>) {
    form.preventDefault();
    const source = form.currentTarget;
    const data = new FormData(source);
    await operate('Validating results…', async () => {
      const { import: report } = await api<{ import: Import }>('imports', data);
      const title = events.find(item => item.id === report.eventId)?.title ?? 'Untitled event';
      setHistory(list => [{ id: report.id, eventId: report.eventId, title, accepted: report.rows.length, rejected: report.errors.length, batchId: null }, ...list]);
      setCurrent(report);
      setSelected(0);
      setConfirmed(false);
      source.reset();
    });
  }

  function openImport(id: string) {
    void operate('Opening import…', async () => {
      const { import: report } = await api<{ import: Import }>('imports/' + id);
      setCurrent(report);
      setEventId(report.eventId);
      setSelected(0);
      setConfirmed(false);
    });
  }

  function plan() {
    if (!current) return;
    void operate('Preparing proposal…', async () => {
      const { proposal } = await api<{ proposal: Proposal }>('imports/' + current.id + '/proposal', {});
      setCurrent({ ...current, proposal });
    });
  }

  function approve() {
    if (!current || !confirmed) return;
    void operate('Issuing approved records…', async () => {
      const { id } = await api<{ id: string }>('issuance-batches', { importId: current.id, approved: true });
      setCurrent({ ...current, batchId: id });
      setHistory(list => list.map(item => item.id === current.id ? { ...item, batchId: id } : item));
    });
  }

  return <main id="main" className="shell workspace">
    <div className="workspace-heading">
      <div><p className="eyebrow"><span /> {user.organization}</p><h1>Issuance studio</h1></div>
      <button className="button secondary" disabled={!!busy} onClick={() => void operate('Signing out…', async () => {
        await api('session/logout', {}); window.location.reload();
      })}>Sign out</button>
    </div>
    <div className="workspace-grid">
      <aside className="workspace-side">
        <section className="panel admin-panel">
          <div className="panel-heading"><h2>Event</h2>{events.length > 0 && <button type="button" className="text-button" onClick={() => setShowEvent(!showEvent)}>{showEvent ? 'Cancel' : 'New event'}</button>}</div>
          {showEvent ? <form className="form-stack" onSubmit={create}>
            <label>Event name <input name="title" required maxLength={100} placeholder="Nova Build Sprint" /></label>
            <label>Issuer display name <input name="issuer" required maxLength={80} value={user.organization} readOnly /></label>
            <label>Event date <input type="date" name="date" required /></label>
            <label>Location <input name="location" maxLength={80} placeholder="Optional" /></label>
            <label className="check"><input type="checkbox" name="demo" defaultChecked /> Fictional concept demo</label>
            <label className="check"><input type="checkbox" name="disclose" required /> I’m authorized to publish recipient names and approved results on verification pages.</label>
            <button className="button primary" disabled={!!busy}>Create event</button>
          </form> : <label>Select event <select value={eventId} onChange={change => { setEventId(change.target.value); setCurrent(null); }} disabled={!!busy}>
            {events.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>}
        </section>
        <section className="panel admin-panel">
          <div className="panel-heading"><h2>Import results</h2><a className="text-button" href="/demo-results.csv" download>Sample CSV</a></div>
          <form className="form-stack" onSubmit={upload}>
            <input type="hidden" name="eventId" value={eventId} />
            <label>Results file <input type="file" name="file" accept=".csv,.xlsx" required disabled={!eventId || !!busy} /></label>
            <p className="small">CSV or XLSX · 1 MB · up to 500 rows</p>
            <button className="button primary" disabled={!eventId || !!busy}>Validate results</button>
          </form>
        </section>
        {history.length > 0 && <section className="panel admin-panel">
          <h2>Recent imports</h2>
          <ul className="recent-list">{history.map(item => <li key={item.id}>
            <button type="button" disabled={!!busy} aria-pressed={item.id === current?.id} onClick={() => openImport(item.id)}>
              <span>{item.title}</span><small>{item.batchId ? 'Issued batch' : item.accepted + ' valid · ' + item.rejected + ' rejected'}</small>
            </button>
          </li>)}</ul>
        </section>}
      </aside>
      <div className="workspace-content">
        {busy && <p className="notice" role="status">{busy}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {!current ? <section className="panel admin-panel start-panel">
          <h2>Review a results import</h2>
          <p>Select an event and upload results to check the approved fields and preview each certificate.</p>
          <div className="preview-steps"><span>Validate results</span><span>Preview proposal</span><span>Approve issuance</span></div>
        </section> : <>
          <section className="panel admin-panel review">
            <div className="panel-heading"><h2>Validated results</h2><div className="counts"><span>{current.rows.length} valid</span><span>{current.errors.length} rejected</span></div></div>
            {current.errors.length > 0 && <details className="row-errors" open={current.rows.length === 0}>
              <summary>Review rejected rows</summary><ul>{current.errors.map(error => <li key={error.row}>Row {error.row} · {error.message}</li>)}</ul>
            </details>}
            {claim && <>
              <label>Preview recipient <select value={selected} onChange={change => setSelected(Number(change.target.value))}>
                {current.rows.map((row, index) => <option value={index} key={row.participantRef}>{row.displayName} · {labels[row.tier]}</option>)}
              </select></label>
              <CertificatePreview claim={claim} autoPlay={false} />
              {decision && <p className="small">Template · {themeLabels[decision.theme]}</p>}
            </>}
          </section>
          {current.rows.length > 0 && <section className="panel admin-panel">
            <div className="panel-heading"><h2>Agent proposal</h2>{proposed && <span className="counts"><span>{proposed.source === 'openai' ? 'OpenAI' : 'Approved fallback'}</span></span>}</div>
            {!proposed ? <><p>Choose a theme and approved achievement copy for each tier.</p>
              <button className="button primary" onClick={plan} disabled={!!busy}>Generate proposal</button></> : <>
              <ol className="trace">{proposed.trace.map(step => <li key={step.step}><strong>{step.step.replaceAll('_', ' ')}</strong><span>{step.outcome}</span></li>)}</ol>
              {!current.batchId && user.role === 'issuer' && <div className="approval">
                <label className="check"><input type="checkbox" checked={confirmed} onChange={change => setConfirmed(change.target.checked)} /> I approve issuance of {current.rows.length} validated results and public verification for those credentials.</label>
                <button className="button primary" disabled={!confirmed || !!busy} onClick={approve}>Approve and issue</button>
              </div>}
            </>}
          </section>}
          {current.batchId && <BatchStatus key={current.batchId} id={current.batchId} issuer={user.role === 'issuer'} />}
        </>}
      </div>
    </div>
  </main>;
}
