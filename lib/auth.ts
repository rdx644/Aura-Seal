import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { pool } from './db';

import { publicOrigin } from './env';
import { hashPassword } from './password';
const sessionDuration = 8 * 60 * 60;
const sessionCookie = 'auraseal_session';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export type Organizer = { id: string; org_id: string; role: 'issuer' | 'reviewer'; login: string; organization: string };

export async function login(login: string, password: string) {
  const { rows } = await pool().query<{ id: string; password_hash: string }>(
    'select id, password_hash from organizer_users where login=$1', [login],
  );
  const account = rows[0];
  const temporary = '0'.repeat(48) + ':' + '0'.repeat(128);
  const saved = account?.password_hash ?? temporary;
  const computed = await hashPassword(password, saved.split(':')[0]);
  if (!timingSafeEqual(Buffer.from(saved), Buffer.from(computed)) || !account) return false;

  const token = randomBytes(32).toString('hex');
  await pool().query('insert into sessions (token_hash, user_id, expires_at) values ($1,$2,now()+$3*interval \'1 second\')',
    [digest(token), account.id, sessionDuration]);
  const jar = await cookies();
  const previous = jar.get(sessionCookie)?.value;
  if (previous) await pool().query('delete from sessions where token_hash=$1', [digest(previous)]);
  jar.set(sessionCookie, token, { httpOnly: true, sameSite: 'lax', secure: publicOrigin().startsWith('https:'), path: '/', maxAge: sessionDuration });
  return true;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(sessionCookie)?.value;
  if (token) await pool().query('delete from sessions where token_hash=$1', [digest(token)]);
  jar.delete(sessionCookie);
}

export async function organizer(): Promise<Organizer | undefined> {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  const { rows } = await pool().query<Organizer>(
    'select u.id,u.org_id,u.role,u.login,o.name organization from sessions s join organizer_users u on u.id=s.user_id join organizations o on o.id=u.org_id where s.token_hash=$1 and s.expires_at>now()',
    [digest(token)],
  );
  return rows[0];
}

export async function rateLimit(key: string, max: number, seconds: number) {
  const { rows } = await pool().query<{ hits: number }>(
    "insert into rate_limits (bucket,window_end,hits) values ($1,now()+$2*interval '1 second',1) on conflict (bucket) do update set hits=case when rate_limits.window_end<=now() then 1 else least(rate_limits.hits+1,1000000) end, window_end=case when rate_limits.window_end<=now() then excluded.window_end else rate_limits.window_end end returning hits",
    [digest(key), seconds],
  );
  return rows[0].hits <= max;
}
