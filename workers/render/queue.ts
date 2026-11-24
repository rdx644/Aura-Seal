import { randomUUID } from 'node:crypto';
import type { Claim } from '../../lib/contracts';
import { transaction } from '../../lib/db';
import { verificationUrl } from '../../lib/public';
import { render, type Exports } from './export';

const maxAttempts = 3;
type Job = { certificate_id: string; org_id: string; lease_id: string; attempts: number; verification_id: string; claims: Claim };

async function claim() {
  return transaction('system', async db => {
    await db.query(
      "update render_jobs set status='failed',error_code='lease_expired',lease_id=null,lease_until=null where status='working' and lease_until<=now() and attempts >= $1",
      [maxAttempts],
    );
    const { rows } = await db.query<Job>(String.raw`
      with candidate as (
        select j.certificate_id from render_jobs j join certificates c on c.id=j.certificate_id
        where (j.status='queued' and j.available_at<=now() or j.status='working' and j.lease_until<=now())
          and j.attempts<$2 and c.status='issued'
        order by j.available_at,j.certificate_id
        for update of j skip locked limit 1
      )
      update render_jobs j set status='working',lease_id=$1,lease_until=now()+interval '6 minutes',attempts=j.attempts+1
      from candidate k join certificates c on c.id=k.certificate_id
      where j.certificate_id=k.certificate_id
      returning j.certificate_id,j.org_id,j.lease_id,j.attempts,c.verification_id,c.claims
    `, [randomUUID(), maxAttempts]);
    return rows[0];
  });
}

async function finish(job: Job, assets: Exports | null) {
  return transaction('system', async db => {
    const completed = assets ? (assets.mp4 ? 'ready' : 'partial') : job.attempts < maxAttempts ? 'queued' : 'failed';
    const error = assets?.mp4 ? null : assets ? 'video_unavailable' : 'render_failed';
    const updated = await db.query(
      "update render_jobs set status=$3,error_code=$4,lease_id=null,lease_until=null,available_at=now()+$5*interval '1 second' where certificate_id=$1 and lease_id=$2 and status='working'",
      [job.certificate_id, job.lease_id, completed, error, 2 ** job.attempts],
    );
    if (!updated.rowCount) return 'lease_lost';
    if (assets) {
      await db.query(
        'insert into render_assets (certificate_id,org_id,png,pdf,mp4) values ($1,$2,$3,$4,$5) on conflict (certificate_id) do update set png=excluded.png,pdf=excluded.pdf,mp4=excluded.mp4',
        [job.certificate_id, job.org_id, assets.png, assets.pdf, assets.mp4],
      );
    }
    return completed;
  });
}

export async function workOnce(renderer = render) {
  const job = await claim();
  if (!job) return false;
  let assets: Exports | null;
  try {
    assets = await renderer({ claim: job.claims, url: verificationUrl(job.verification_id) }, { terminal: job.attempts >= maxAttempts });
  } catch {
    assets = null;
  }
  const status = await finish(job, assets);
  console.log(JSON.stringify({ event: 'render_job', certificateId: job.certificate_id, attempt: job.attempts, status }));
  return true;
}
