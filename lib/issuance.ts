import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { planCertificates } from './agent';
import type { Organizer } from './auth';
import { decisionInput, publicClaim, resultInput, type Claim, type Proposal } from './contracts';
import { transaction } from './db';
import { audit, loadImport } from './intake';
import { Problem } from './problem';

type Certificate = {
  id: string; batch_id: string; event_id: string; participant_key: string; verification_id: string;
  claims: Claim; status: 'issued' | 'revoked' | 'superseded'; issued_at: Date; superseded_by: string | null;
};
export type JobStatus = 'queued' | 'working' | 'ready' | 'failed' | 'partial';

export async function proposalFor(user: Organizer, id: string): Promise<Proposal> {
  const current = await transaction(user.org_id, async db => {
    const record = await loadImport(db, user, id, true);
    if (!record) throw new Problem(404, 'Import not found');
    if (record.value.proposal) return record.value;
    if (!record.value.rows.length) throw new Problem(409, 'Import needs at least one valid row');
    const claim = await db.query("update imports set proposal_started=now() where id=$1 and (proposal_started is null or proposal_started<now()-interval '30 seconds')", [id]);
    if (!claim.rowCount) throw new Problem(409, 'An agent proposal is already in progress');
    return record.value;
  });
  if (current.proposal) return current.proposal;
  const proposed = await planCertificates(current.rows);
  return transaction(user.org_id, async db => {
    const { rows } = await db.query<{ proposal: Proposal }>(
      'update imports set proposal=$2,proposal_started=null where id=$1 and proposal is null returning proposal', [id, proposed],
    );
    if (!rows.length) return (await loadImport(db, user, id))!.value.proposal!;
    await audit(db, user, id, 'proposal_created', { source: proposed.source, responseId: proposed.responseId, trace: proposed.trace });
    return rows[0].proposal;
  });
}

const permit = (user: Organizer) => {
  if (user.role !== 'issuer') throw new Problem(403, 'Issuer access is required');
};

async function insertCertificate(db: PoolClient, user: Organizer, data: {
  id?: string; eventId: string; batchId: string; participantKey: string; claims: Claim;
}) {
  const id = data.id ?? randomUUID();
  const publicId = randomBytes(16).toString('hex');
  const contentDigest = createHash('sha256').update(JSON.stringify(publicClaim(data.claims))).digest('hex');
  await db.query('insert into certificates (id,org_id,event_id,batch_id,participant_key,verification_id,claims,content_digest) values ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, user.org_id, data.eventId, data.batchId, data.participantKey, publicId, data.claims, contentDigest]);
  await db.query('insert into render_jobs (certificate_id,org_id) values ($1,$2)', [id, user.org_id]);
  await audit(db, user, id, 'certificate_issued', { batchId: data.batchId, digest: contentDigest });
  return { id, publicId };
}

async function lockEvent(db: PoolClient, eventId: string) {
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [eventId]);
}

export async function approve(user: Organizer, id: string) {
  permit(user);
  return transaction(user.org_id, async db => {
    const record = await loadImport(db, user, id, true);
    if (!record) throw new Problem(404, 'Import not found');
    if (record.value.batchId) return { id: record.value.batchId };
    if (!record.value.proposal || !record.value.rows.length) throw new Problem(409, 'Generate and review the proposal before issuing');
    const eventId = record.value.eventId;
    await lockEvent(db, eventId);
    const batchId = randomUUID();
    await db.query('insert into issuance_batches (id,org_id,import_id,approved_by) values ($1,$2,$3,$4)', [batchId, user.org_id, id, user.id]);
    const existing = await db.query<Certificate>("select id,participant_key,claims from certificates where event_id=$1 and status<>'superseded'", [eventId]);
    const issued = new Map(existing.rows.map(row => [row.participant_key, row]));
    for (const [index, raw] of record.value.rows.entries()) {
      const row = resultInput.parse(raw);
      const participantKey = createHash('sha256').update(row.participantRef.normalize('NFKC').toLowerCase()).digest('hex');
      const previous = issued.get(participantKey);
      const claims: Claim = { ...record.event, displayName: row.displayName, tier: row.tier, rank: row.rank,
        decision: decisionInput.parse(record.value.proposal.plan[row.tier]), templateVersion: 1 };
      if (previous && (previous.claims.displayName !== claims.displayName || previous.claims.rank !== claims.rank || previous.claims.tier !== claims.tier)) {
        throw new Problem(409, 'An existing credential has conflicting facts for a participant reference. Check the results before approving.');
      }
      const certificateId = previous?.id ?? (await insertCertificate(db, user, { eventId, batchId, participantKey, claims })).id;
      await db.query('insert into batch_items (batch_id,org_id,ordinal,certificate_id,created) values ($1,$2,$3,$4,$5)',
        [batchId, user.org_id, index, certificateId, !previous]);
    }
    await db.query('update imports set batch_id=$2 where id=$1', [id, batchId]);
    await audit(db, user, batchId, 'batch_approved', { importId: id, rows: record.value.rows.length, rejected: record.value.errors.length });
    return { id: batchId };
  });
}

export async function batchFor(user: Organizer, id: string) {
  return transaction(user.org_id, async db => {
    const batch = await db.query('select id from issuance_batches where id=$1 and org_id=$2', [id, user.org_id]);
    if (!batch.rowCount) throw new Problem(404, 'Batch not found');
    const { rows } = await db.query<{
      id: string; publicId: string; displayName: string; status: Certificate['status']; jobStatus: JobStatus; errorCode: string | null; attempts: number; created: boolean;
    }>(
      'select c.id,c.verification_id as "publicId",c.claims->>\'displayName\' as "displayName",c.status,j.status as "jobStatus",j.error_code as "errorCode",j.attempts,b.created from batch_items b join certificates c on (c.org_id,c.id)=(b.org_id,b.certificate_id) join render_jobs j on j.certificate_id=c.id where b.batch_id=$1 and b.org_id=$2 order by b.ordinal', [id, user.org_id],
    );
    const history = await db.query<{ action: string; created_at: Date; organizer_id: string | null }>(
      'select action,created_at,organizer_id from audit_events where org_id=$1 and (entity_id=$2 or entity_id in (select id from certificates where batch_id=$2 and org_id=$1 union select certificate_id from batch_items where batch_id=$2 and org_id=$1)) order by id desc limit 100',
      [user.org_id, id],
    );
    return { id, items: rows, history: history.rows };
  });
}

export async function revoke(user: Organizer, id: string, reason: string) {
  permit(user);
  return transaction(user.org_id, async db => {
    const row = (await db.query<Certificate>('select id,status from certificates where id=$1 and org_id=$2 for update', [id, user.org_id])).rows[0];
    if (!row) throw new Problem(404, 'Certificate not found');
    if (row.status === 'revoked') return { status: 'revoked' };
    if (row.status !== 'issued') throw new Problem(409, 'Only an issued certificate can be revoked');
    await db.query("update certificates set status='revoked' where id=$1", [id]);
    await audit(db, user, id, 'certificate_revoked', { reason });
    return { status: 'revoked' };
  });
}

export async function reissue(user: Organizer, id: string, reason: string) {
  permit(user);
  return transaction(user.org_id, async db => {
    const original = (await db.query<Certificate>('select event_id from certificates where id=$1 and org_id=$2', [id, user.org_id])).rows[0];
    if (!original) throw new Problem(404, 'Certificate not found');
    await lockEvent(db, original.event_id);
    const row = (await db.query<Certificate>('select * from certificates where id=$1 and org_id=$2 for update', [id, user.org_id])).rows[0];
    if (row.superseded_by) {
      const { rows } = await db.query<Certificate>('select id,verification_id from certificates where id=$1', [row.superseded_by]);
      return { id: rows[0].id, publicId: rows[0].verification_id };
    }
    const replacementId = randomUUID();
    await db.query("update certificates set status='superseded' where id=$1", [id]);
    const replacement = await insertCertificate(db, user, {
      id: replacementId, eventId: row.event_id, batchId: row.batch_id, participantKey: row.participant_key, claims: row.claims,
    });
    await db.query('update certificates set superseded_by=$2 where id=$1', [id, replacementId]);
    await db.query('update batch_items set certificate_id=$3 where org_id=$1 and certificate_id=$2', [user.org_id, id, replacementId]);
    await audit(db, user, id, 'certificate_superseded', { replacement: replacementId, reason });
    return replacement;
  });
}

export async function retry(user: Organizer, id: string) {
  permit(user);
  return transaction(user.org_id, async db => {
    const job = await db.query(
      "update render_jobs j set status='queued',attempts=0,error_code=null,available_at=now() from certificates c where c.id=j.certificate_id and c.status='issued' and j.certificate_id=$1 and j.org_id=$2 and j.status in ('failed','partial')",
      [id, user.org_id],
    );
    if (!job.rowCount) throw new Problem(409, 'The render is not eligible for retry');
    await audit(db, user, id, 'render_retry_requested');
    return { status: 'queued' };
  });
}
