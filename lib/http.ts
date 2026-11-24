import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { login, logout, organizer, rateLimit } from './auth';
import { approvalInput, eventInput, idInput, publicIdInput, reasonInput, sessionInput } from './contracts';
import { pool, transaction } from './db';
import { publicOrigin } from './env';
import { importResults, InputError, uploadMax } from './domain';
import { createEvent, eventsFor, loadImport, recentImports, storeImport } from './intake';
import { approve, batchFor, proposalFor, reissue, retry, revoke } from './issuance';
import { Problem } from './problem';
import { download, formats, verify, type Format } from './public';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });

async function readBody(request: Request, max: number) {
  const declared = Number(request.headers.get('content-length'));
  if (declared > max) throw new Problem(413, 'Request body is too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Problem(400, 'Request body is required');
  const parts: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw new Problem(413, 'Request body is too large');
      }
      parts.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}

async function input<T>(request: Request, schema: z.ZodType<T>) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) throw new Problem(415, 'Expected JSON');
  const body = await readBody(request, 16384);
  let value: unknown;
  try { value = JSON.parse(body.toString('utf8')); } catch { throw new Problem(400, 'Invalid JSON'); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Problem(422, parsed.error.issues.map(issue =>
    [issue.path.join('.'), issue.message].filter(Boolean).join(' — ')).join('; '));
  return parsed.data;
}

function neededId(raw: string) {
  const parsed = idInput.safeParse(raw);
  if (!parsed.success) throw new Problem(404, 'Record not found');
  return parsed.data;
}

function identity(request: Request) {
  const name = process.env.TRUST_PROXY_IP_HEADER;
  const ip = name ? request.headers.get(name)?.trim() : undefined;
  return ip && isIP(ip) ? ip : 'shared';
}

async function limit(key: string, max: number, seconds: number) {
  if (!(await rateLimit(key, max, seconds))) throw new Problem(429, 'Too many requests. Try again shortly.');
}

async function verifyRoute(request: Request, [id, action, file, extra]: string[]) {
  await limit('verify:' + identity(request), 300, 60);
  if (!publicIdInput.safeParse(id).success) return json({ status: 'invalid' }, 404);
  if (!action) {
    const result = await verify(id);
    return json(result, result.status === 'invalid' ? 404 : 200);
  }
  if (action !== 'download' || extra || !Object.hasOwn(formats, file)) throw new Problem(404, 'File not found');
  const format = file as Format;
  const payload = await download(id, format);
  if (!payload) throw new Problem(404, 'Export is unavailable');
  const inline = format === 'mp4' && new URL(request.url).searchParams.get('play') === '1';
  const headers = new Headers({
    'content-type': formats[format],
    'content-disposition': (inline ? 'inline' : 'attachment') + '; filename="AuraSeal-' + id + '.' + format + '"',
    'cache-control': 'private, no-store',
    'accept-ranges': 'bytes',
  });
  let first = 0, last = payload.length - 1, status = 200;
  const range = request.headers.get('range');
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + payload.length } });
    first = match[1] ? Number(match[1]) : Math.max(0, payload.length - Number(match[2]));
    last = match[1] && match[2] ? Math.min(Number(match[2]), last) : last;
    if (last < first || !Number.isSafeInteger(first) || !Number.isSafeInteger(last)) {
      return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + payload.length } });
    }
    headers.set('content-range', 'bytes ' + first + '-' + last + '/' + payload.length);
    status = 206;
  }
  const body = new Uint8Array(payload.subarray(first, last + 1));
  headers.set('content-length', String(body.length));
  return new Response(body, { status, headers });
}

async function dispatch(request: Request, route: string[]) {
  const [resource, id, action, more] = route;
  const get = request.method === 'GET';
  if (!get && request.headers.get('origin') !== publicOrigin()) throw new Problem(403, 'Request origin could not be verified');
  if (get && resource === 'verify') return verifyRoute(request, route.slice(1));

  if (get && resource === 'health' && !id) {
    await pool().query('select 1 from auraseal.render_jobs limit 1');
    return json({ status: 'ok' });
  }
  if (resource === 'session' && !action) {
    if (get && !id) return json({ user: (await organizer()) ?? null });
    if (!get && id === 'logout') {
      await logout();
      return json({ ok: true });
    }
    if (!get && !id) {
      const value = await input(request, sessionInput);
      await limit('signin-ip:' + identity(request), 30, 900);
      await limit('signin-login:' + value.login, 10, 900);
      if (!(await login(value.login, value.password))) throw new Problem(401, 'Organizer credentials were not accepted');
      return json({ ok: true });
    }
  }

  const user = await organizer();
  if (!user) {
    if ((await cookies()).has('auraseal_session')) throw new Problem(401, 'Your session has expired');
    throw new Problem(401, 'Sign in as an organizer');
  }
  if (more) throw new Problem(404, 'Route not found');
  if (!get) await limit('mutation:' + user.id, 100, 60);

  if (resource === 'events' && !id) {
    if (get) return json({ events: await eventsFor(user) });
    const { disclose, ...fields } = await input(request, eventInput);
    if (!disclose) throw new Problem(422, 'Public disclosure must be approved');
    return json({ event: await createEvent(user, fields) }, 201);
  }
  if (resource === 'imports') {
    if (!id && get) return json({ imports: await recentImports(user) });
    if (!id) {
      const contentType = request.headers.get('content-type') ?? '';
      if (!/^multipart\/form-data;/i.test(contentType)) throw new Problem(415, 'Use a multipart file upload');
      const bytes = await readBody(request, uploadMax + 16384);
      const form = await new Response(new Uint8Array(bytes), { headers: { 'content-type': contentType } }).formData().catch(() => null);
      const file = form?.get('file');
      const selected = idInput.safeParse(form?.get('eventId'));
      if (!(file instanceof File) || !selected.success) throw new Problem(422, 'Select an event and a CSV or XLSX file');
      const report = await importResults(file.name, Buffer.from(await file.arrayBuffer()));
      const stored = await storeImport(user, selected.data, report.rows, report.errors);
      if (!stored) throw new Problem(404, 'Event not found');
      return json({ import: stored }, 201);
    }
    if (get && !action) {
      const record = await transaction(user.org_id, db => loadImport(db, user, neededId(id)));
      if (!record) throw new Problem(404, 'Import not found');
      return json({ import: record.value, event: record.event });
    }
    if (!get && action === 'proposal') {
      await limit('agent:' + user.org_id, 10, 3600);
      return json({ proposal: await proposalFor(user, neededId(id)) });
    }
  }
  if (resource === 'issuance-batches' && !action) {
    if (get && id) return json(await batchFor(user, neededId(id)));
    if (!get && !id) {
      const { importId } = await input(request, approvalInput.extend({ importId: idInput }));
      return json(await approve(user, importId), 202);
    }
  }
  if (!get && resource === 'certificates' && id) {
    const certificate = neededId(id);
    if (action === 'retry') return json(await retry(user, certificate), 202);
    if (action === 'revoke' || action === 'reissue') {
      const { reason } = await input(request, reasonInput);
      return json(action === 'revoke' ? await revoke(user, certificate, reason) : await reissue(user, certificate, reason));
    }
  }
  throw new Problem(404, 'Route not found');
}

export async function routeRequest(request: Request, route: string[]) {
  const requestId = randomUUID();
  try {
    const response = await dispatch(request, route);
    response.headers.set('x-request-id', requestId);
    return response;
  } catch (error) {
    if (error instanceof Problem || error instanceof InputError) {
      const status = error instanceof Problem ? error.status : 422;
      const response = json({ error: { message: error.message, requestId } }, status);
      response.headers.set('x-request-id', requestId);
      return response;
    }
    console.error(JSON.stringify({ event: 'request_failed', requestId, resource: route[0], type: error instanceof Error ? error.name : 'unknown', code: (error as { code?: string })?.code }));
    return json({ error: { message: 'The service could not complete the request', requestId } }, route[0] === 'health' ? 503 : 500);
  }
}
