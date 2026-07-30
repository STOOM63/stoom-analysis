export const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
export const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
export const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
export const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null || value === '') return fallback;
  const cleaned = String(value).replace(/\u00a0/g, '').replace(/[€%]/g, '').replace(/\s/g, '').replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

export function toPercent(value) {
  if (typeof value === 'number') return Math.abs(value) > 1 ? value / 100 : value;
  return toNumber(value, 0) / 100;
}

export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + value * 86400000);
  }
  const raw = String(value).trim();
  const french = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*-\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (french) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = french;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isoDate(value) {
  const d = value instanceof Date ? value : parseDate(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function normalizeCode(value) {
  if (value == null) return '';
  const raw = String(value).trim().replace(/\.0$/, '');
  return /^\d+$/.test(raw) && raw.length < 13 ? raw.padStart(13, '0') : raw;
}

export function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
export function sum(values) { return values.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0); }
export function mean(values) { const clean = values.filter(Number.isFinite); return clean.length ? sum(clean) / clean.length : 0; }
export function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}
export function stddev(values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return 0;
  const avg = mean(clean);
  return Math.sqrt(mean(clean.map(v => (v - avg) ** 2)));
}
export function quantile(values, q) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const pos = (clean.length - 1) * q;
  const base = Math.floor(pos); const rest = pos - base;
  return clean[base + 1] !== undefined ? clean[base] + rest * (clean[base + 1] - clean[base]) : clean[base];
}

export function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

export function indexBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) map.set(keyFn(row), row);
  return map;
}

export function daysBetween(a, b) {
  const da = a instanceof Date ? a : parseDate(a); const db = b instanceof Date ? b : parseDate(b);
  if (!da || !db) return 0;
  return Math.floor((db - da) / 86400000);
}

export function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
export function uid(prefix = 'id') { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
export function safeDiv(a, b, fallback = 0) { return b ? a / b : fallback; }
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
export function hashString(input) {
  let hash = 2166136261;
  const str = String(input);
  for (let i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}
export async function fileHash(file) {
  if (crypto?.subtle) {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  return hashString(`${file.name}|${file.size}|${file.lastModified}`);
}
export function downloadBlob(content, filename, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function formatDelta(value, mode = 'percent') {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return mode === 'currency' ? `${sign}${euro.format(value)}` : `${sign}${decimal.format(value * 100)} %`;
}
export function colorForStatus(status) {
  const s = normalizeText(status);
  if (/(STAR|EXCELLENT|FORT|SAIN|ACTIF|FIDELE|VIP|OPPORTUNITE)/.test(s)) return 'positive';
  if (/(RISQUE|SURSTOCK|RALENT|PARTIEL|MOYEN|ATTENTION)/.test(s)) return 'warning';
  if (/(RUPTURE|NEGATIF|PERDU|MORT|CRITIQUE|ANOMALIE)/.test(s)) return 'danger';
  return 'neutral';
}
