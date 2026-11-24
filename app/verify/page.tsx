import { Lookup } from '@/components/Lookup';

export const metadata = { title: 'Verify a certificate' };

export default function VerifyPage() {
  return <main id="main" className="shell verification">
    <p className="eyebrow"><span /> Credential registry</p>
    <h1>Verify a certificate</h1>
    <p className="lede">Check the issuer’s record using a verification ID from the certificate or a public link.</p>
    <Lookup />
  </main>;
}
