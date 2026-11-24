import { spawnSync } from 'node:child_process';

const patterns = 'sk-(proj-|svcacct-)?[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----';
const result = spawnSync('git', ['grep', '-I', '-l', '-E', '-e', patterns, '--', '.', ':!evidence/**', ':!scripts/check-secrets.mjs'], { encoding: 'utf8' });
if (result.status === 0) {
  console.error('Possible secret in file(s):\n' + result.stdout.trim());
  process.exitCode = 1;
} else if (result.status !== 1) {
  console.error('Could not complete the tracked-source secret scan.');
  process.exitCode = 1;
}
