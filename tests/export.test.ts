import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { artEvidence, sampleUrl } from './fixtures/export';
import { artwork, frameState } from '../packages/certificate/art';
import { verificationQr } from '../packages/certificate/qr';
import { render } from '../workers/render/export';

const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe';

function decoded(png: Buffer) {
  const data = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(data.data), data.width, data.height)?.data;
}

test('TEST-06 motion has a seamless boundary and reveals name, tier, rank, then QR', () => {
  assert.deepEqual(frameState(144), frameState(0));
  assert.ok(frameState(25).x < frameState(55).x && frameState(55).x < frameState(95).x);
  assert.ok(frameState(23).name > frameState(23).tier);
  assert.ok(frameState(37).tier > frameState(37).rank);
  assert.ok(frameState(50).rank > frameState(50).badge);
  assert.ok(artwork(artEvidence, { qr: verificationQr(sampleUrl) }).includes('0123456789abcdef0123456789abcdef'));
  const esc = artwork({ ...artEvidence, displayName: '<script>Bad</script>' });
  assert.ok(esc.includes('&lt;script&gt;') && !esc.includes('<script>'));
});

test('TEST-07 renders H.264 720p and decodes canonical QR from PNG and MP4', { timeout: 180000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auraseal-test-export-'));
  try {
    const assets = await render({ claim: artEvidence, url: sampleUrl }, { ffmpeg });
    assert.ok(assets.mp4 && assets.mp4.length < 3_000_000);
    assert.equal(decoded(assets.png), sampleUrl);
    assert.equal(assets.pdf.subarray(0, 5).toString(), '%PDF-');
    const path = join(dir, 'sample.mp4');
    await writeFile(path, assets.mp4);
    const output = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries',
      'stream=codec_name,width,height,r_frame_rate,duration:format=size', '-of', 'json', path], { encoding: 'utf8' }));
    const stream = output.streams[0];
    assert.equal(stream.codec_name, 'h264');
    assert.equal(stream.width, 1280);
    assert.equal(stream.height, 720);
    assert.equal(stream.r_frame_rate, '24/1');
    assert.equal(Number(stream.duration), 6);
    assert.equal(Number(output.format.size), assets.mp4.length);
    const still = execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', '3.5', '-i', path, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { maxBuffer: 5_000_000 });
    assert.equal(decoded(still), sampleUrl);
    if (process.env.AURASEAL_EXPORT_EVIDENCE) {
      await writeFile('evidence/G4/export_metadata.json', JSON.stringify({ ...output, qrDecodedFromPng: true, qrDecodedFromVideo: true }, null, 2) + '\n');
      await writeFile('evidence/G4/sample.mp4', assets.mp4);
      await writeFile('evidence/G4/sample.png', assets.png);
      await writeFile('evidence/G4/sample.pdf', assets.pdf);
      await writeFile('evidence/G4/paused-frame.png', still);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
