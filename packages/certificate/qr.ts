import QRCode from 'qrcode';
import type { Qr } from './art';

export function verificationQr(url: string): Qr {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const cells: string[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) cells.push('M' + col + ' ' + row + 'h1v1h-1z');
    }
  }
  const verificationId = /^\/v\/([a-f0-9]{32})$/.exec(new URL(url).pathname)?.[1];
  return { size: modules.size, path: cells.join(''), verificationId };
}
