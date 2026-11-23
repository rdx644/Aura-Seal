'use client';

import { useState, type FormEvent } from 'react';
import { api } from './client';

export function SignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api('session', { login: fields.get('login'), password: fields.get('password') });
      window.location.reload();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }
  return (
    <form className="signin panel" onSubmit={submit}>
      <h2>Organizer sign in</h2>
      <label>Username <input name="login" autoComplete="username" required maxLength={100} /></label>
      <label>Password <input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label>
      <button className="button primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Open workspace'} <span aria-hidden="true">↗</span></button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
