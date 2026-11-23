import { publicOrigin } from './env';
import { publicClaim, type Claim } from './contracts';
import { transaction } from './db';
import type { JobStatus } from './issuance';

export const verificationUrl = (id: string) => publicOrigin() + '/v/' + id;
export const linkedInUrl = (id: string) => {
  const url = new URL('https://www.linkedin.com/sharing/share-offsite/');
  url.searchParams.set('url', verificationUrl(id));
  return url.href;
};

export type PublicCertificate =
  | { status: 'invalid' | 'revoked' | 'superseded' }
  | { status: 'valid'; id: string; claim: Claim; issuedAt: string; render: JobStatus; formats: string[] };

export async function verify(id: string): Promise<PublicCertificate> {
  return transaction('system', async db => {
    const { rows } = await db.query<{
      status: 'issued' | 'revoked' | 'superseded'; claims: Claim; issued_at: Date; job: JobStatus; static: boolean; video: boolean;
    }>(
      'select c.status,c.claims,c.issued_at,j.status job,a.png is not null static,a.mp4 is not null video from certificates c join render_jobs j on j.certificate_id=c.id left join render_assets a on a.certificate_id=c.id where c.verification_id=$1',
      [id],
    );
    const row = rows[0];
    if (!row) return { status: 'invalid' };
    if (row.status !== 'issued') return { status: row.status };
    return {
      status: 'valid', id, claim: publicClaim(row.claims), issuedAt: row.issued_at.toISOString(), render: row.job,
      formats: [...(row.video ? ['mp4'] : []), ...(row.static ? ['png', 'pdf'] : [])],
    };
  });
}

export const formats = { mp4: 'video/mp4', png: 'image/png', pdf: 'application/pdf' } as const;
export type Format = keyof typeof formats;

export function download(id: string, format: Format): Promise<Buffer | null> {
  return transaction('system', async db => {
    const { rows } = await db.query<{ payload: Buffer | null }>(
      'select a.' + format + " payload from render_assets a join certificates c on c.id=a.certificate_id where c.verification_id=$1 and c.status='issued'",
      [id],
    );
    return rows[0]?.payload ?? null;
  });
}
