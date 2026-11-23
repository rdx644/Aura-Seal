import { Pool, type PoolClient } from 'pg';

let instance: Pool | undefined;

export function pool() {
  if (!instance) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    instance = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, options: '-c search_path=auraseal,pg_catalog' });
    instance.on('error', () => console.error(JSON.stringify({ event: 'postgres_idle_connection_error' })));
  }
  return instance;
}

export async function transaction<T>(scope: string, action: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool().connect();
  try {
    await db.query('begin');
    await db.query("select set_config('auraseal.scope', $1, true)", [scope]);
    const result = await action(db);
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback').catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
