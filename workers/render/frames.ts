import { artwork, artLayers, frameState, glowTravel, sweepOrigin, video, type ArtLayer, type Qr } from '../../packages/certificate/art';
import type { Claim } from '../../lib/contracts';

type Image = { width: number; pixels: Buffer };
type Layer = Image & { spans: Uint16Array };

function spans({ width, pixels }: Image): Layer {
  const bounds = new Uint16Array(video.height * 2);
  for (let y = 0; y < video.height; y++) {
    let min = width, max = 0;
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      min = Math.min(min, x);
      max = x + 1;
    }
    bounds[y * 2] = min;
    bounds[y * 2 + 1] = max;
  }
  return { width, pixels, spans: bounds };
}

function overlay(target: Buffer, source: Layer, shift: number, opacity: number) {
  if (opacity <= 0) return;
  const pixels = source.pixels;
  for (let y = 0; y < video.height; y++) {
    const first = Math.max(source.spans[y * 2], -shift);
    const last = Math.min(source.spans[y * 2 + 1], video.width - shift);
    let from = (y * source.width + first) * 4;
    let to = (y * video.width + first + shift) * 4;
    for (let x = first; x < last; x++, from += 4, to += 4) {
      const alpha = pixels[from + 3] * opacity;
      if (alpha === 0) continue;
      const prior = 1 - alpha / 255;
      // Resvg returns premultiplied RGBA pixels.
      target[to] = Math.round(pixels[from] * opacity + target[to] * prior);
      target[to + 1] = Math.round(pixels[from + 1] * opacity + target[to + 1] * prior);
      target[to + 2] = Math.round(pixels[from + 2] * opacity + target[to + 2] * prior);
      target[to + 3] = Math.round(alpha + target[to + 3] * prior);
    }
  }
}

export function* animationFrames(claim: Claim, qr: Qr, raster: (svg: string) => Image) {
  const images = Object.fromEntries(artLayers.map(layer => [layer, spans(raster(artwork(claim, { qr, layer })))])) as Record<ArtLayer, Layer>;
  const output = Buffer.allocUnsafe(images.paper.pixels.length);
  for (let frame = 0; frame < video.fps * video.seconds; frame++) {
    const state = frameState(frame);
    images.paper.pixels.copy(output);
    overlay(output, images.glow, state.glowOffset - glowTravel, state.glow);
    overlay(output, images.rings, 0, 1);
    overlay(output, images.sweep, state.x - sweepOrigin, state.sweep);
    overlay(output, images.border, 0, state.border);
    overlay(output, images.label, 0, 1);
    overlay(output, images.name, 0, state.name);
    overlay(output, images.tier, 0, state.tier);
    overlay(output, images.rank, 0, state.rank);
    overlay(output, images.badge, 0, state.badge);
    yield output;
  }
}
