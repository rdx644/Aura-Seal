'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { artwork, video, type Qr } from '@/packages/certificate/art';
import type { Claim } from '@/lib/contracts';

export function CertificatePreview({ claim, qr, autoPlay = true }: { claim: Claim; qr?: Qr; autoPlay?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '') + 'art';
  const [playing, setPlaying] = useState(autoPlay);
  const [reduced, setReduced] = useState(false);
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const animate = playing && !reduced;
  useEffect(() => {
    const stage = element.current;
    if (!stage) return;
    if (!animate) {
      stage.innerHTML = artwork(claim, { id, qr });
      return;
    }
    const start = performance.now();
    let prior = -1;
    let tick = 0;
    const draw = (timestamp: number) => {
      const frame = Math.floor((timestamp - start) * video.fps / 1000) % (video.fps * video.seconds);
      if (frame !== prior) {
        stage.innerHTML = artwork(claim, { id, qr, frame });
        prior = frame;
      }
      tick = requestAnimationFrame(draw);
    };
    tick = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(tick);
  }, [animate, claim, id, qr]);
  return (
    <figure className="cert-preview">
      <div className="certificate-art" ref={element} dangerouslySetInnerHTML={{ __html: artwork(claim, { id, qr }) }} />
      {!reduced && <button className="motion-toggle" type="button" onClick={() => setPlaying(value => !value)}>{playing ? 'Pause motion' : 'Play motion'}</button>}
    </figure>
  );
}
