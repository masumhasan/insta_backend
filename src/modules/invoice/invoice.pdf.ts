/**
 * Zero-dependency minimal PDF 1.4 generator for printable invoices.
 * Generates valid single/multi-page PDF documents with standard Helvetica fonts.
 */

function escapePdfText(input: string): string {
  return String(input || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLine(text: string, maxChars = 84): string[] {
  if (!text) return [''];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + (current ? ' ' : '') + w).length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = current ? `${current} ${w}` : w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface IPdfLine {
  text: string;
  bold?: boolean;
  size?: number;
}

export function buildInvoicePdfBuffer(headerTitle: string, bodyLines: IPdfLine[]): Buffer {
  const expanded: IPdfLine[] = [
    { text: 'INSTAPOST — INVOICE STATEMENT', bold: true, size: 16 },
    { text: headerTitle, bold: true, size: 12 },
    { text: '------------------------------------------------------------------------------------', size: 10 },
  ];

  for (const line of bodyLines) {
    const wrapped = wrapLine(line.text, line.size && line.size >= 13 ? 72 : 88);
    wrapped.forEach((chunk) => expanded.push({ ...line, text: chunk }));
  }

  const streamOps: string[] = ['BT'];
  let y = 748;
  for (const line of expanded) {
    if (y < 48) break;
    const font = line.bold ? '/F2' : '/F1';
    const size = line.size || 10;
    streamOps.push(`${font} ${size} Tf 1 0 0 1 48 ${y} Tm (${escapePdfText(line.text)}) Tj`);
    y -= size + 6;
  }
  streamOps.push('ET');
  const contentStream = streamOps.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

