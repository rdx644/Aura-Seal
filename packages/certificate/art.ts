import { labels, type Claim } from '../../lib/contracts';

export const video = { width: 1280, height: 720, fps: 24, seconds: 6, maxBytes: 3_000_000 };
export type Qr = { size: number; path: string; verificationId?: string };
export const themeLabels = { ember: 'Afterglow', bloom: 'Verdant', linen: 'Daybreak' };
const palettes = {
  ember: { bg: '#1a1828', panel: '#2c2332', ink: '#fff7e8', dim: '#e4c9c0', line: '#8e635e', accent: '#ff985d', secondary: '#64cb9a' },
  bloom: { bg: '#132825', panel: '#193c30', ink: '#f0fff5', dim: '#b9d8c8', line: '#52846b', accent: '#7deab1', secondary: '#ff9a67' },
  linen: { bg: '#f8efe4', panel: '#fff9ee', ink: '#30262d', dim: '#654c52', line: '#a06f65', accent: '#994017', secondary: '#046a38' },
};
const escape = (value: string | number) => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
);
const curve = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
export function frameState(frame: number) {
  const time = ((frame % 144) + 144) % 144 / video.fps;
  const reveal = (start: number) => .07 + .93 * curve((time - start) / .62) * (1 - curve((time - 5.15) / .85));
  return {
    x: Math.round(-600 + 2500 * curve((time - .18) / 4.4)),
    sweep: .5 * curve(time / .35) * (1 - curve((time - 4.6) / .55)),
    border: .5 + .45 * Math.sin(Math.PI * time / 6) ** 2,
    glowOffset: Math.round(glowTravel * Math.cos(time / 6 * 2 * Math.PI)),
    glow: .28 + .26 * Math.sin(Math.PI * time / 6) ** 2,
    name: reveal(.5), tier: reveal(1.05), rank: reveal(1.6), badge: reveal(2.13),
  };
}

function nameLines(name: string) {
  const points = Array.from(name);
  if (points.length <= 29) return [name];
  const middle = Math.ceil(points.length / 2);
  const candidates = points.map((char, index) => char === ' ' ? index : -1).filter(index =>
    index > points.length / 4 && index < points.length * .75);
  const position = candidates.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0] ?? middle;
  return [points.slice(0, position).join(''), points.slice(position).join('').trim()];
}

function fittedSize(text: string, width: number, max: number) {
  const units = Array.from(text).reduce((total, char) => total + (/[MW@]/.test(char) ? .94 : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}]/u.test(char) ? 1.08 : .69), 0);
  return Math.min(max, Math.floor(width / Math.max(units, 1)));
}

export const artLayers = ['paper', 'glow', 'rings', 'sweep', 'border', 'label', 'name', 'tier', 'rank', 'badge'] as const;
export type ArtLayer = typeof artLayers[number];
export const sweepOrigin = 300;
export const glowOrigin = 975;
export const glowTravel = 58;
type ArtOptions = { frame?: number; qr?: Qr; id?: string; layer?: ArtLayer };

export function artwork(claim: Claim, options: ArtOptions = {}) {
  const { id = 'certificate', frame, qr, layer } = options;
  const theme = palettes[claim.decision.theme];
  const state = layer
    ? { x: sweepOrigin, sweep: 1, border: 1, glow: 1, glowOffset: 0, name: 1, tier: 1, rank: 1, badge: 1 }
    : frame === undefined
    ? { x: 1600, sweep: 0, border: .85, glow: .4, glowOffset: -10, name: 1, tier: 1, rank: 1, badge: 1 }
    : frameState(frame);
  const density = claim.tier === 'winner' ? 8 : claim.tier === 'finalist' ? 6 : 4;
  const ribbons = Array.from({ length: density }, (_, index) =>
    '<circle cx="1100" cy="185" r="' + (102 + index * 22) + '" stroke="' + theme.line + '" fill="none" opacity=".31"/>').join('');
  const lines = nameLines(claim.displayName);
  const fontSize = Math.min(...lines.map(line => fittedSize(line, 850, lines.length === 1 ? 76 : 56)));
  const name = lines.map((line, index) => '<tspan x="100" y="' + (lines.length === 1 ? 309 : 278 + index * 62) + '">' + escape(line) + '</tspan>').join('');
  const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(claim.date));
  const rank = claim.rank === null ? '' : '<text x="100" y="464" font-size="30" font-weight="700">Final rank ' + claim.rank + '</text>';
  const verificationId = qr?.verificationId
    ? '<text x="1083" y="671" text-anchor="middle" font-size="11" fill="' + theme.dim + '">' + escape(qr.verificationId) + '</text>'
    : '';
  const qrArt = qr
    ? '<g transform="translate(1012 486) scale(' + (142 / (qr.size + 8)) + ')" shape-rendering="crispEdges"><rect width="' + (qr.size + 8) + '" height="' + (qr.size + 8) + '" rx="1" fill="#fff"/><path d="' + qr.path + '" fill="#18101b" transform="translate(4 4)"/></g><text x="1083" y="653" text-anchor="middle" letter-spacing="2" font-size="13" fill="' + theme.dim + '">SCAN TO VERIFY</text>' + verificationId
    : '<g transform="translate(1012 486)"><rect width="142" height="142" rx="8" fill="none" stroke="' + theme.line + '" stroke-dasharray="5 6"/><path d="M38 52v-14h14 M104 52v-14H90 M38 90v14h14 M104 90v14H90" stroke="' + theme.dim + '" stroke-width="3" fill="none"/><text x="71" y="77" text-anchor="middle" font-size="14" fill="' + theme.dim + '">QR on issue</text></g>';
  const event = labels[claim.tier] + '  ·  ' + claim.title;
  const eventSize = fittedSize(event, 850, 27);
  const issuerSize = fittedSize(claim.issuer, 660, 19);
  const meta = date + (claim.location ? '  ·  ' + claim.location : '');
  const parts: Record<ArtLayer, string> = {
    paper: '<rect width="1280" height="720" rx="28" fill="url(#' + id + '-paper)"/>',
    glow: '<ellipse cx="' + (glowOrigin + state.glowOffset) + '" cy="120" rx="435" ry="355" fill="url(#' + id + '-glow)" opacity="' + state.glow + '"/>',
    rings: ribbons,
    sweep: '<path d="M' + state.x + ' 0h360l-270 720h-360z" opacity="' + state.sweep + '" fill="url(#' + id + '-sweep)"/>',
    border: '<rect x="25" y="25" width="1230" height="670" rx="16" fill="none" stroke="url(#' + id + '-border)" stroke-width="3" opacity="' + state.border + '"/>',
    label: [
      '<rect x="39" y="39" width="1202" height="642" rx="12" fill="none" stroke="' + theme.line + '" opacity=".54"/>',
      '<path d="M100 117h31l-15-26z M108 104h30l-15 26z" fill="' + theme.accent + '" opacity=".65"/>',
      '<text x="152" y="115" font-size="' + issuerSize + '" letter-spacing="2" fill="' + theme.dim + '">' + escape(claim.issuer) + '</text>',
      '<text x="100" y="202" font-size="19" letter-spacing="6" font-weight="700" fill="' + theme.accent + '">CERTIFICATE OF ACHIEVEMENT</text>',
      '<path d="M100 541h756" stroke="' + theme.line + '" opacity=".65"/>',
      '<text x="100" y="584" font-size="19" fill="' + theme.dim + '">' + escape(claim.decision.message) + '</text>',
      '<text x="100" y="636" font-size="13" letter-spacing="2.3" font-weight="700" fill="' + theme.accent + '">' + (claim.demo ? 'CONCEPT DEMO · FICTIONAL CREDENTIAL' : 'ISSUED WITH AURASEAL') + '</text>',
    ].join(''),
    name: '<text font-size="' + fontSize + '" font-family="Georgia, DejaVu Serif, Noto Sans CJK JP, Microsoft YaHei, serif" font-weight="700" opacity="' + state.name + '">' + name + '</text>',
    tier: '<g opacity="' + state.tier + '"><text x="100" y="387" font-size="' + eventSize + '">' + escape(event) + '</text>' +
      '<text x="100" y="422" font-size="' + fittedSize(meta, 850, 17) + '" fill="' + theme.dim + '">' + escape(meta) + '</text></g>',
    rank: '<g opacity="' + state.rank + '">' + rank + '</g>',
    badge: [
      '<g opacity="' + state.badge + '"><path d="M1083 135l64 24v43c0 45-35 69-64 79-28-10-64-34-64-79v-43z" fill="' + theme.bg + '" stroke="' + theme.accent + '" stroke-width="2"/>',
      '<path d="' + (claim.tier === 'winner' ? 'M1083 159l12 23 25 3-19 17 5 25-23-12-23 12 5-25-19-17 25-3z' : claim.tier === 'finalist' ? 'M1083 160l32 29-32 35-32-35z' : 'M1060 195l16 16 32-35') + '" stroke="' + theme.accent + '" fill="none" stroke-width="4" stroke-linejoin="round"/>',
      '<text x="1083" y="252" text-anchor="middle" font-size="14" letter-spacing="1.4">' + escape(labels[claim.tier].toUpperCase()) + '</text>',
      qrArt + '</g>',
    ].join(''),
  };
  const render = layer ? parts[layer] : artLayers.map(key => parts[key]).join('');
  const bleed = layer === 'glow' ? glowTravel : 0;
  const width = video.width + bleed * 2;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="720" viewBox="' + (-bleed) + ' 0 ' + width + ' 720" role="img" aria-label="Achievement certificate for ' + escape(claim.displayName) + '">',
    '<defs><linearGradient id="' + id + '-paper" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="' + theme.panel + '"/><stop offset="1" stop-color="' + theme.bg + '"/></linearGradient>',
    '<linearGradient id="' + id + '-border"><stop stop-color="#ef6321"/><stop offset="1" stop-color="#046a38"/></linearGradient>',
    '<linearGradient id="' + id + '-sweep"><stop stop-color="#f58b50" stop-opacity="0"/><stop offset=".5" stop-color="#ffb383" stop-opacity=".65"/><stop offset="1" stop-color="#73d4a6" stop-opacity="0"/></linearGradient>',
    '<radialGradient id="' + id + '-glow"><stop stop-color="' + theme.secondary + '" stop-opacity=".58"/><stop offset="1" stop-color="' + theme.secondary + '" stop-opacity="0"/></radialGradient></defs>',
    '<g font-family="Arial, DejaVu Sans, Noto Sans CJK JP, Microsoft YaHei, sans-serif" fill="' + theme.ink + '">' + render + '</g></svg>',
  ].join('');
}
