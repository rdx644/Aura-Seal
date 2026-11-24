import './config';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../lib/password';
import { sessionInput } from '../lib/contracts';
import { pool, transaction } from '../lib/db';

const [login, organization, role = 'issuer'] = process.argv.slice(2);
const input = sessionInput.safeParse({ login, password: process.env.AURASEAL_ORGANIZER_PASSWORD });
if (!input.success || !organization?.trim() || organization.length > 80 || !['issuer', 'reviewer'].includes(role)) {
  console.error('Usage: set AURASEAL_ORGANIZER_PASSWORD (12–128 characters) and run npm run db:organizer -- <login> "<organization>" [issuer|reviewer]');
  process.exit(1);
}
try {
  const passwordHash = await hashPassword(input.data.password);
  await transaction('system', async db => {
    // Serialize provisioning. Organization names are administrative identifiers here.
    await db.query('select pg_advisory_xact_lock(7240160)');
    const existing = await db.query<{ id: string }>('select id from organizations where name=$1', [organization.trim()]);
    const org = existing.rows[0]?.id ?? randomUUID();
    if (!existing.rowCount) await db.query('insert into organizations (id,name) values ($1,$2)', [org, organization.trim()]);
    await db.query('insert into organizer_users (id,org_id,login,password_hash,role) values ($1,$2,$3,$4,$5)',
      [randomUUID(), org, input.data.login, passwordHash, role]);
  });
  console.log('Organizer provisioned.');
} finally {
  await pool().end();
}
