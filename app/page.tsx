import { organizer } from '@/lib/auth';
import { demoClaim } from '@/lib/demo';
import { eventsFor, recentImports } from '@/lib/intake';
import { CertificatePreview } from '@/components/CertificatePreview';
import { SignIn } from '@/components/SignIn';
import { Workspace } from '@/components/Workspace';

export default async function Home() {
  const user = await organizer();
  if (user) {
    const [events, imports] = await Promise.all([eventsFor(user), recentImports(user)]);
    return <Workspace user={{ organization: user.organization, role: user.role }} initialEvents={events} initialImports={imports} />;
  }
  return (
    <main id="main" className="shell landing">
      <section className="hero-copy">
        <p className="eyebrow"><span /> Credential issuance studio</p>
        <h1>Give achievements<br />a life of their own.</h1>
        <p className="lede">Turn approved event results into animated certificates that recipients can download, share and verify.</p>
        <SignIn />
      </section>
      <section className="hero-art" aria-label="Sample certificate">
        <div className="hero-board">
          <div className="art-top"><span><i /> Certificate preview</span><span>Nova Build Sprint</span></div>
          <CertificatePreview claim={demoClaim} autoPlay={false} />
          <div className="art-bottom"><span>FICTIONAL DEMO</span><span>720p motion export</span></div>
        </div>
      </section>
    </main>
  );
}
