import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import '../../scripts/config';
import type { Organizer } from '../../lib/auth';
import { importResults } from '../../lib/domain';
import { pool, transaction } from '../../lib/db';
import { createEvent, loadImport, storeImport } from '../../lib/intake';
import { approve, batchFor, proposalFor, reissue, revoke } from '../../lib/issuance';
import { verify } from '../../lib/public';
import { demoClaim } from '../../lib/demo';
import { render } from '../../workers/render/export';
import { workOnce } from '../../workers/render/queue';

if (process.env.AURASEAL_DATABASE_TEST !== '1') throw new Error('Set AURASEAL_DATABASE_TEST=1 only with a dedicated, migrated test database.');
after(() => pool().end());

async function account(role: Organizer['role'] = 'issuer'): Promise<Organizer> {
  const id = randomUUID(), orgId = randomUUID(), login = id;
  await pool().query('insert into organizations(id,name) values ($1,$2)', [orgId, id]);
  await pool().query('insert into organizer_users(id,org_id,login,password_hash,role) values ($1,$2,$3,$4,$5)', [id, orgId, login, 'unused', role]);
  return { id, org_id: orgId, login, role, organization: id };
}

const sample = (count: number) => Buffer.from([
  'participant_ref,display_name,tier,rank',
  ...Array.from({ length: count }, (_, index) => 'p-' + index + ',Demo Recipient ' + String(index + 1).padStart(2, '0') +
    (index === 0 ? ',winner,1' : index < 5 ? ',finalist,' + (index + 1) : ',participant,')),
  'broken,,participant,',
].join('\n'));

const demo = { title: demoClaim.title, issuer: demoClaim.issuer, date: demoClaim.date, demo: true };
const renderer = process.env.AURASEAL_REAL_BULK === '1' ? render : async () => ({ png: Buffer.from('fixture png'), pdf: Buffer.from('fixture pdf'), mp4: Buffer.from('fixture mp4') });

test('TEST-08 enforces tenant policy and human approval; reaches all public status transitions', async () => {
  const owner = await account(), other = await account(), reviewer = await account('reviewer');
  await assert.rejects(() => createEvent(owner, demo), { status: 422 });
  const event = await createEvent(owner, { ...demo, issuer: owner.organization });
  const { rows, errors } = await importResults('sample.csv', sample(1));
  const report = (await storeImport(owner, event.id, rows, errors))!;
  const raw = await transaction(other.org_id, db => db.query('select id from imports where id=$1', [report.id]));
  assert.equal(raw.rowCount, 0);
  assert.equal(await transaction(other.org_id, db => loadImport(db, other, report.id)), null);
  await assert.rejects(() => approve(owner, report.id), { status: 409 });
  await assert.rejects(() => approve(reviewer, report.id), { status: 403 });
  await proposalFor(owner, report.id);
  const batch = await approve(owner, report.id);
  const [certificate] = (await batchFor(owner, batch.id)).items;
  assert.equal((await verify(certificate.publicId)).status, 'valid');
  await assert.rejects(() => revoke(other, certificate.id, 'Wrong tenant'), { status: 404 });
  await revoke(owner, certificate.id, 'Synthetic revocation');
  assert.deepEqual(await verify(certificate.publicId), { status: 'revoked' });
  const next = await reissue(owner, certificate.id, 'Reissue');
  assert.equal((await reissue(owner, certificate.id, 'Repeat')).id, next.id);
  assert.equal((await verify(next.publicId)).status, 'valid');
  assert.deepEqual(await verify(certificate.publicId), { status: 'superseded' });
  assert.deepEqual(await verify('0'.repeat(32)), { status: 'invalid' });
  await revoke(owner, next.id, 'Finish isolated lifecycle fixture');
});

test('TEST-09 queues 50 approvals atomically, recovers from expiry and retry, and stores one asset per credential', { timeout: 900000 }, async () => {
  const owner = await account();
  const event = await createEvent(owner, { ...demo, issuer: owner.organization });
  const { rows, errors } = await importResults('sample.csv', sample(50));
  assert.equal(rows.length, 50);
  assert.equal(errors.length, 1);
  const report = (await storeImport(owner, event.id, rows, errors))!;
  await proposalFor(owner, report.id);
  const [batch, duplicate] = await Promise.all([approve(owner, report.id), approve(owner, report.id)]);
  assert.equal(batch.id, duplicate.id);
  const start = await batchFor(owner, batch.id);
  assert.equal(new Set(start.items.map(item => item.publicId)).size, 50);
  assert.ok(start.items.every(item => item.jobStatus === 'queued'));

  const expired = start.items[0].id;
  await transaction(owner.org_id, db => db.query("update render_jobs set status='working',attempts=1,lease_id=$2,lease_until=now()-interval '1 second',available_at=now()-interval '1 minute' where certificate_id=$1",
    [expired, randomUUID()]));
  await workOnce(async () => { throw new Error('Synthetic renderer failure'); });
  const failed = (await batchFor(owner, batch.id)).items.find(item => item.id === expired)!;
  assert.equal(failed.attempts, 2);
  assert.equal(failed.jobStatus, 'queued');
  await transaction(owner.org_id, db => db.query("update render_jobs set available_at=now()-interval '1 second' where certificate_id=$1", [expired]));

  const begin = performance.now();
  for (let index = 0; index < 50; index++) assert.ok(await workOnce(renderer));
  const end = await batchFor(owner, batch.id);
  assert.equal(end.items.length, 50);
  assert.ok(end.items.every(item => item.jobStatus === 'ready'));
  assert.equal(end.items.find(item => item.id === expired)?.attempts, 3);
  const stats = await transaction(owner.org_id, async db => (await db.query<{ assets: number; maxBytes: number }>(
    'select count(*)::int assets,max(octet_length(mp4)) "maxBytes" from render_assets where org_id=$1', [owner.org_id],
  )).rows[0]);
  assert.equal(stats.assets, 50);
  assert.ok(stats.maxBytes < 3_000_000);
  if (process.env.AURASEAL_BULK_EVIDENCE) {
    const evidence = { validRows: rows.length, invalidRows: errors.length, ready: 50, uniqueVerifications: 50,
      duplicateApprovalReusedBatch: true, leaseExpiryRecovered: true, simulatedWorkerFailureRecovered: true,
      realEncoding: process.env.AURASEAL_REAL_BULK === '1', maxBytes: stats.maxBytes, milliseconds: Math.round(performance.now() - begin) };
    await writeFile('evidence/G5/batch_run.json', JSON.stringify(evidence, null, 2) + '\n');
  }
});
