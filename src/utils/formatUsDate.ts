/**
 * US date text for PDFs and notification messages (MM/DD/YYYY). Display only: never use it for stored or API values.
 * Date-only "YYYY-MM-DD" is reformatted as written (no time-zone shift). `dayFirst` reads the en-GB "DD/MM/YYYY"
 * text the backend writes for `orderDate`. Values that are not dates come back unchanged.
 */
const pad = (n: number | string) => String(n).padStart(2, '0');

export function formatUsDate(value: unknown, opts: { dayFirst?: boolean } = {}): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') {
    const s = value.trim();
    const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (ymd) return `${pad(ymd[2])}/${pad(ymd[3])}/${ymd[1]}`;
    const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (slash) {
      let [m, d] = opts.dayFirst ? [+slash[2], +slash[1]] : [+slash[1], +slash[2]];
      if (m > 12 && d <= 12) [m, d] = [d, m];
      return `${pad(m)}/${pad(d)}/${slash[3]}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  }
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Rewrites every "YYYY-MM-DD" and "Nov 6, 2026" inside free text (e.g. a date range) as MM/DD/YYYY. */
export const usDatesInText = (text: unknown): string =>
  String(text ?? '')
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => `${m}/${d}/${y}`)
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2}),? (\d{4})\b/gi, (_, mon, d, y) =>
      `${pad(MONTHS.indexOf(String(mon).slice(0, 3).toLowerCase()) + 1)}/${pad(d)}/${y}`);
