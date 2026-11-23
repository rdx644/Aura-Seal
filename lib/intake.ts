import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Organizer } from './auth';
import type { Event, EventFields, Import, ImportError, Proposal, Result } from './contracts';
import { transaction } from './db';
import { Problem } from './problem';

export async function audit(db: PoolClient, user: Organizer, entityId: string, action: string, details: object = {}) {
  await db.query('insert into audit_events (org_id,organizer_id,entity_id,action,details) values ($1,$2,$3,$4,$5)',
    [user.org_id, user.id, entityId, action, details]);
}

export async function eventsFor(user: Organizer): Promise<Event[]> {
  return transaction(user.org_id, async db => {
    const { rows } = await db.query<{ id: string; fields: EventFields }>('select id,fields from events where org_id=$1 order by created_at desc limit 100', [user.org_id]);
    return rows.map(({ id, fields }) => ({ id, ...fields }));
  });
}

export async function createEvent(user: Organizer, fields: EventFields) {
  if (fields.issuer !== user.organization) throw new Problem(422, 'Issuer name must match your provisioned organization');
  return transaction(user.org_id, async db => {
    const id = randomUUID();
    await db.query('insert into events (id,org_id,fields) values ($1,$2,$3)', [id, user.org_id, fields]);
    await audit(db, user, id, 'event_created', { publicDisclosureAccepted: true });
    return { id, ...fields };
  });
}

export async function storeImport(user: Organizer, eventId: string, rows: Result[], errors: ImportError[]) {
  return transaction(user.org_id, async db => {
    const event = await db.query('select id from events where id=$1 and org_id=$2', [eventId, user.org_id]);
    if (!event.rowCount) return null;
    const id = randomUUID();
    await db.query('insert into imports (id,org_id,event_id,rows,errors) values ($1,$2,$3,$4,$5)',
      [id, user.org_id, eventId, JSON.stringify(rows), JSON.stringify(errors)]);
    await audit(db, user, id, 'import_validated', { accepted: rows.length, rejected: errors.length });
    return { id, eventId, rows, errors, proposal: null, batchId: null };
  });
}

export async function loadImport(db: PoolClient, user: Organizer, id: string, lock = false) {
  type Record = { id: string; event_id: string; rows: Result[]; errors: ImportError[]; proposal: Proposal | null; fields: EventFields; batch_id: string | null };
  const { rows } = await db.query<Record>(
    'select i.id,i.event_id,i.rows,i.errors,i.proposal,e.fields,i.batch_id from imports i join events e on (e.org_id,e.id)=(i.org_id,i.event_id) where i.id=$1 and i.org_id=$2' + (lock ? ' for update of i' : ''),
    [id, user.org_id],
  );
  const record = rows[0];
  if (!record) return null;
  const value: Import = { id: record.id, eventId: record.event_id, rows: record.rows, errors: record.errors, proposal: record.proposal, batchId: record.batch_id };
  return { value, event: record.fields };
}

export async function recentImports(user: Organizer) {
  return transaction(user.org_id, async db => {
    const { rows } = await db.query<{ id: string; eventId: string; title: string; accepted: number; rejected: number; batchId: string | null }>(
      'select i.id,i.event_id as "eventId",e.fields->>\'title\' as title,jsonb_array_length(i.rows) as accepted,jsonb_array_length(i.errors) as rejected,i.batch_id as "batchId" from imports i join events e on (e.org_id,e.id)=(i.org_id,i.event_id) where i.org_id=$1 order by i.created_at desc limit 100',
      [user.org_id],
    );
    return rows;
  });
}
