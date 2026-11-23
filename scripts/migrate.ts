import './config';
import { readdir, readFile } from 'node:fs/promises';
import { pool } from '../lib/db';

const db = await pool().connect();
try {
  await db.query('select pg_advisory_lock(7240159)');
  await db.query('create schema if not exists auraseal; create table if not exists auraseal.migrations (name text primary key, applied_at timestamptz not null default now())');
  for (const name of (await readdir(new URL('../db/migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) {
    if ((await db.query('select 1 from auraseal.migrations where name=$1', [name])).rowCount) continue;
    await db.query('begin');
    try {
      await db.query(await readFile(new URL('../db/migrations/' + name, import.meta.url), 'utf8'));
      await db.query('insert into auraseal.migrations(name) values($1)', [name]);
      await db.query('commit');
      console.log('Applied ' + name);
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
  }
} finally {
  await db.query('select pg_advisory_unlock(7240159)');
  db.release();
  await pool().end();
}
