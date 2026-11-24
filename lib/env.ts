export function publicOrigin() {
  const origin = new URL(process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if ((origin.protocol !== 'https:' && (!local || origin.protocol !== 'http:')) || origin.username ||
    origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('PUBLIC_ORIGIN must be an HTTPS origin or loopback HTTP origin');
  }
  return origin.origin;
}
