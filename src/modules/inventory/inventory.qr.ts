import QRCode from 'qrcode';

const CODE39_MAP: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw',
  C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn',
  G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww',
  O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn',
  S: 'nnwnnnwwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw',
  W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', $: 'nwnwnwnnn',
  '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn',
};

export interface BarRect {
  x: number;
  width: number;
}

export function encodeCode39Bars(rawValue: string): { text: string; bars: BarRect[]; totalWidth: number } {
  const sanitized = String(rawValue || 'BAR-000001')
    .toUpperCase()
    .replace(/[^0-9A-Z\-. $/+%]/g, '-');
  const full = `*${sanitized || 'BAR-000001'}*`;
  const bars: BarRect[] = [];
  let cursor = 0;
  const narrow = 1.6;
  const wide = 4.0;

  for (let c = 0; c < full.length; c++) {
    const pattern = CODE39_MAP[full[c]] || CODE39_MAP['-'];
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === 'w' ? wide : narrow;
      if (i % 2 === 0) bars.push({ x: cursor, width: w });
      cursor += w;
    }
    cursor += narrow;
  }
  return { text: sanitized, bars, totalWidth: cursor };
}

const escapeXml = (s: string) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapePdf = (s: string) =>
  String(s || '').replace(/[^\x20-\x7E]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export async function generateQrDataUrl(value: string): Promise<string> {
  return QRCode.toDataURL(String(value || 'BAR-000000'), { width: 220, margin: 1 });
}

export async function generateQrPngBuffer(value: string): Promise<Buffer> {
  return QRCode.toBuffer(String(value || 'BAR-000000'), { type: 'png', width: 320, margin: 2 });
}

export async function buildInventoryQrSvg(item: {
  name: string;
  type: string;
  barcode: string;
  serialNo?: string;
  location?: string;
  owner?: string;
}): Promise<string> {
  const qrSvg = await QRCode.toString(item.barcode, { type: 'svg', margin: 1, width: 170 });
  const innerQr = qrSvg.replace(/^<\?xml[^>]*>\s*/i, '');
  const code39 = encodeCode39Bars(item.barcode);
  const scaleX = Math.min(1.5, 290 / Math.max(code39.totalWidth, 1));
  const barRects = code39.bars
    .map((b) => `<rect x="${(b.x * scaleX).toFixed(2)}" y="0" width="${(b.width * scaleX).toFixed(2)}" height="62" fill="#111827" />`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="270" viewBox="0 0 600 270">
  <rect width="600" height="270" rx="16" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
  <rect x="0" y="0" width="600" height="44" rx="16" fill="#0f172a"/>
  <rect x="0" y="28" width="600" height="16" fill="#0f172a"/>
  <text x="20" y="28" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff">INSTAPOST ASSET TAG</text>
  <text x="580" y="28" text-anchor="end" font-family="monospace" font-size="12" font-weight="700" fill="#93c5fd">${escapeXml(item.barcode)}</text>
  <g transform="translate(20, 62)">${innerQr}</g>
  <g transform="translate(215, 76)">
    <text x="0" y="0" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="#111827">${escapeXml(item.name.slice(0, 34))}</text>
    <text x="0" y="22" font-family="Arial, sans-serif" font-size="12" fill="#4b5563">Type: ${escapeXml(item.type)} | Location: ${escapeXml((item.location || 'Main Warehouse').slice(0, 24))}</text>
    <text x="0" y="40" font-family="Arial, sans-serif" font-size="12" fill="#4b5563">Agent: ${escapeXml(item.owner || 'Instapost LLC')}${item.serialNo ? ` | Serial: ${escapeXml(item.serialNo)}` : ''}</text>
    <g transform="translate(0, 56)">${barRects}</g>
    <text x="0" y="138" font-family="monospace" font-size="13" font-weight="700" fill="#111827">${escapeXml(item.barcode)}</text>
  </g>
</svg>`;
}

export function buildInventoryLabelPdf(item: {
  name: string;
  type: string;
  barcode: string;
  serialNo?: string;
  location?: string;
  owner?: string;
  qty?: number;
}): Buffer {
  const qr = QRCode.create(item.barcode, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const modPt = Math.min(5.2, 150 / Math.max(size, 1));
  const qrOriginX = 54;
  const qrOriginY = 560;

  const ops: string[] = [
    '0.06 0.09 0.16 rg',
    '42 715 528 36 re f',
    'BT /F2 14 Tf 1 1 1 rg 1 0 0 1 56 728 Tm (INSTAPOST — INVENTORY QR & BARCODE LABEL) Tj ET',
    '0 0 0 rg',
    'BT /F2 14 Tf 1 0 0 1 235 685 Tm (' + escapePdf(item.name.slice(0, 44)) + ') Tj ET',
    'BT /F1 10 Tf 1 0 0 1 235 664 Tm (Barcode / QR Payload: ' + escapePdf(item.barcode) + ') Tj ET',
    'BT /F1 10 Tf 1 0 0 1 235 648 Tm (Type: ' + escapePdf(item.type) + '  |  Qty: ' + String(item.qty ?? 0) + ') Tj ET',
    'BT /F1 10 Tf 1 0 0 1 235 632 Tm (Serial: ' + escapePdf(item.serialNo || 'N/A') + ') Tj ET',
    'BT /F1 10 Tf 1 0 0 1 235 616 Tm (Agent: ' + escapePdf(item.owner || 'Instapost LLC') + ') Tj ET',
    'BT /F1 10 Tf 1 0 0 1 235 600 Tm (Location: ' + escapePdf(item.location || 'Main Warehouse') + ') Tj ET',
  ];

  // Draw crisp vector QR code modules
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.modules.get(row, col)) {
        const x = qrOriginX + col * modPt;
        const y = qrOriginY + (size - 1 - row) * modPt;
        ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${modPt.toFixed(2)} ${modPt.toFixed(2)} re f`);
      }
    }
  }

  // Draw crisp vector Code-39 barcode below metadata
  const code39 = encodeCode39Bars(item.barcode);
  const scaleX = Math.min(1.45, 310 / Math.max(code39.totalWidth, 1));
  const barOriginX = 235;
  const barOriginY = 532;
  for (const b of code39.bars) {
    ops.push(`${(barOriginX + b.x * scaleX).toFixed(2)} ${barOriginY} ${(b.width * scaleX).toFixed(2)} 46 re f`);
  }
  ops.push(`BT /F2 11 Tf 1 0 0 1 235 514 Tm (${escapePdf(item.barcode)}) Tj ET`);

  const stream = ops.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

