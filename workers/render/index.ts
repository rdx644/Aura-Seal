import '../../scripts/config';
import { setTimeout as delay } from 'node:timers/promises';
import { pool } from '../../lib/db';
import { workOnce } from './queue';

let running = true;
process.on('SIGTERM', () => { running = false; });
process.on('SIGINT', () => { running = false; });
while (running) {
  try {
    if (!(await workOnce())) await delay(600);
  } catch (error) {
    console.error(JSON.stringify({ event: 'render_queue_retry', code: (error as { code?: string })?.code }));
    await delay(3000);
  }
}
await pool().end();
