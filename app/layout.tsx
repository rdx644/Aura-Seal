import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'AuraSeal | Achievement credentials', template: '%s | AuraSeal' },
  description: 'Create animated achievement certificates with public record-backed verification.',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="site-header">
          <Link className="wordmark" href="/"><span className="mark" aria-hidden="true"><i /></span>AuraSeal</Link>
          <nav aria-label="Main">
            <Link href="/verify">Verify a certificate</Link>
            <Link href="/" className="nav-workspace">Organizer workspace <span aria-hidden="true">↗</span></Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer"><span>AuraSeal</span><span>Animated achievement credentials</span></footer>
      </body>
    </html>
  );
}
