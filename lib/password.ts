import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);

export async function hashPassword(password: string, salt = randomBytes(24).toString('hex')) {
  const key = await derive(password, salt, 64) as Buffer;
  return salt + ':' + key.toString('hex');
}
