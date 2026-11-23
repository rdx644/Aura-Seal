import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { Resvg, type ResvgRenderOptions } from '@resvg/resvg-js';
import { PDFDocument } from 'pdf-lib';
import { artwork, video } from '../../packages/certificate/art';
import { verificationQr } from '../../packages/certificate/qr';
import type { Claim } from '../../lib/contracts';

export type Exports = { png: Buffer; pdf: Buffer; mp4: Buffer | null };
type Job = { claim: Claim; url: string };
type Options = { ffmpeg?: string; terminal?: boolean; maxBytes?: number };

function rasterizer(claim: Claim) {
  const windows = process.platform === 'win32';
  const files = windows
    ? ['arial.ttf', 'arialbd.ttf', 'georgia.ttf', 'georgiab.ttf'].map(file => join(process.env.SystemRoot ?? 'C:\\Windows', 'Fonts', file))
    : ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSerif.ttf', 'DejaVuSerif-Bold.ttf'].map(file => '/usr/share/fonts/truetype/dejavu/' + file);
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(claim.displayName + claim.title + claim.issuer + (claim.location ?? ''));
  if (cjk) files.push(...(windows
    ? ['msyh.ttc', 'meiryo.ttc', 'malgun.ttf'].map(file => join(process.env.SystemRoot ?? 'C:\\Windows', 'Fonts', file))
    : ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']));
  const fontFiles = files.filter(existsSync);
  const options: ResvgRenderOptions = {
    font: { defaultFontFamily: windows ? 'Arial' : 'DejaVu Sans', fontFiles, loadSystemFonts: !fontFiles.length },
  };
  return (svg: string) => new Resvg(svg, options).render();
}

async function encode(job: Job, path: string, bitrate: number, ffmpeg: string, raster: ReturnType<typeof rasterizer>) {
  const qr = verificationQr(job.url);
  function* frames() {
    for (let frame = 0; frame < video.fps * video.seconds; frame++) {
      yield raster(artwork(job.claim, { qr, frame })).pixels;
    }
  }
  const process = spawn(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba',
    '-video_size', video.width + 'x' + video.height, '-framerate', String(video.fps), '-i', 'pipe:0',
    '-vf', 'format=yuv420p', '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast',
    '-b:v', bitrate + 'k', '-maxrate', bitrate + 'k', '-bufsize', bitrate + 'k', '-movflags', '+faststart', path,
  ], { stdio: ['pipe', 'ignore', 'ignore'], signal: AbortSignal.timeout(100_000), windowsHide: true });
  const done = new Promise<void>((resolve, reject) => {
    process.once('error', reject);
    process.once('close', code => code === 0 ? resolve() : reject(new Error('Encoder failed')));
  });
  try {
    await Promise.all([done, pipeline(Readable.from(frames(), { objectMode: false }), process.stdin)]);
  } finally {
    if (process.exitCode === null && process.signalCode === null) process.kill();
  }
}

export async function render(job: Job, options: Options = {}): Promise<Exports> {
  const ffmpeg = options.ffmpeg ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
  const raster = rasterizer(job.claim);
  const png = raster(artwork(job.claim, { qr: verificationQr(job.url) })).asPng();
  const document = await PDFDocument.create();
  const image = await document.embedPng(png);
  const page = document.addPage([video.width, video.height]);
  page.drawImage(image, { x: 0, y: 0, width: video.width, height: video.height });
  document.setTitle('AuraSeal Achievement Certificate');
  const pdf = Buffer.from(await document.save());

  const dir = await mkdtemp(join(tmpdir(), 'auraseal-render-'));
  const target = join(dir, 'certificate.mp4');
  try {
    for (const bitrate of [1800, 850]) {
      await encode(job, target, bitrate, ffmpeg, raster);
      const bytes = (await stat(target)).size;
      if (bytes > 0 && bytes < (options.maxBytes ?? video.maxBytes)) return { png, pdf, mp4: await readFile(target) };
    }
    return { png, pdf, mp4: null };
  } catch (error) {
    if (options.terminal) return { png, pdf, mp4: null };
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
