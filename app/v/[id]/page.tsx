import Link from 'next/link';
import { headers } from 'next/headers';
import { isIP } from 'node:net';
import { rateLimit } from '@/lib/auth';
import { labels, publicIdInput } from '@/lib/contracts';
import { linkedInUrl, verificationUrl, verify } from '@/lib/public';
import { CertificatePreview } from '@/components/CertificatePreview';
import { verificationQr } from '@/packages/certificate/qr';

type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Credential verification', robots: { index: false, follow: false } };

const details = {
  invalid: ['Credential not found', 'Check the ID or scan the QR code again.'],
  revoked: ['Credential revoked', 'The issuer has withdrawn this credential.'],
  superseded: ['Credential replaced', 'The issuer has issued a replacement. Ask the recipient for its updated link.'],
  limited: ['Too many requests', 'Please try again in a minute.'],
};

export default async function PublicPage({ params }: Context) {
  const { id } = await params;
  const proxy = process.env.TRUST_PROXY_IP_HEADER;
  const ip = proxy ? (await headers()).get(proxy)?.trim() : undefined;
  const allowed = await rateLimit('verify:' + (ip && isIP(ip) ? ip : 'shared'), 300, 60);
  const credential = allowed && publicIdInput.safeParse(id).success ? await verify(id) : { status: allowed ? 'invalid' : 'limited' } as const;
  if (credential.status !== 'valid') {
    const [title, message] = details[credential.status];
    return <main id="main" className="shell verification">
      <p className="eyebrow"><span /> Credential registry</p>
      <h1>{title}</h1><p className="lede">{message}</p>
      <Link className="button secondary" href="/verify">Check another certificate</Link>
    </main>;
  }
  const { claim, formats, issuedAt, render } = credential;
  const asset = '/api/verify/' + id + '/download/';
  return <main id="main" className="shell recipient">
    <section className="recipient-summary">
      <p className="eyebrow"><span /> Credential registry</p>
      <div className="status valid"><span aria-hidden="true">✓</span> Verified credential</div>
      <h1>{claim.displayName}</h1>
      <p className="lede">{labels[claim.tier]} at {claim.title}</p>
      <dl className="claim-facts">
        <div><dt>Issuer</dt><dd>{claim.issuer}</dd></div>
        <div><dt>Event date</dt><dd>{claim.date}</dd></div>
        {claim.rank !== null && <div><dt>Final rank</dt><dd>{claim.rank}</dd></div>}
        {claim.location && <div><dt>Location</dt><dd>{claim.location}</dd></div>}
        <div><dt>Issued</dt><dd>{issuedAt.slice(0, 10)}</dd></div>
      </dl>
      {claim.demo && <p className="notice">Concept demo. This is a fictional credential.</p>}
      <div className="download-actions">
        {formats.map(format => <a key={format} className={'button ' + (format === 'mp4' ? 'primary' : 'secondary')} href={asset + format} download>Download {format.toUpperCase()}</a>)}
        <a className="button secondary" href={linkedInUrl(id)} target="_blank" rel="noopener noreferrer">Share on LinkedIn ↗</a>
      </div>
      {render !== 'ready' && <p className="notice">{render === 'queued' || render === 'working' ? 'Exports are being prepared. Refresh to check again.' : 'The animated export is unavailable. Use a static download when offered.'}</p>}
      <p className="verification-code">Verification ID <code>{id}</code></p>
    </section>
    <section className="recipient-art" aria-label="Certificate preview">
      <CertificatePreview claim={claim} qr={verificationQr(verificationUrl(id))} autoPlay={false} />
    </section>
  </main>;
}
