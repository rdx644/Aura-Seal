'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function Lookup() {
  const router = useRouter();
  const [error, setError] = useState('');
  function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = String(new FormData(event.currentTarget).get('verification')).trim();
    const id = input.match(/^(?:https?:\/\/[^/?#]+\/v\/)?([a-fA-F0-9]{32})\/?$/)?.[1];
    if (!id) {
      setError('Enter a 32-character verification ID or an AuraSeal certificate link.');
      return;
    }
    router.push('/v/' + id.toLowerCase());
  }
  return <form className="panel lookup-form" onSubmit={lookup}>
    <label>Verification ID or certificate link<input name="verification" required maxLength={300} placeholder="Paste ID or link" /></label>
    <button type="submit" className="button primary">Check credential</button>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}
