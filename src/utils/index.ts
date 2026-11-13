export function uid(prefix = ''): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${rnd}`;
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

const DAY_MS = 86_400_000;

/** Mission day (1-based) for a timestamp, given the mission start date. */
export function missionDay(startISO: string, at: Date = new Date()): number {
  const start = new Date(startISO);
  start.setHours(0, 0, 0, 0);
  const t = new Date(at);
  t.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((t.getTime() - start.getTime()) / DAY_MS) + 1);
}

export function dateForDay(startISO: string, day: number): Date {
  const d = new Date(startISO);
  d.setDate(d.getDate() + day - 1);
  return d;
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** PBKDF2 passcode hashing via WebCrypto. */
export async function hashPasscode(passcode: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' }, key, 256);
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  return { hash: b64(new Uint8Array(bits)), salt: b64(salt) };
}

/** gzip via CompressionStream when available; returns the compressed byte length. */
export async function gzipSize(text: string): Promise<{ bytes: number; blob: Blob }> {
  const raw = new Blob([text], { type: 'application/json' });
  if (typeof CompressionStream === 'undefined') return { bytes: raw.size, blob: raw };
  const stream = raw.stream().pipeThrough(new CompressionStream('gzip'));
  const blob = await new Response(stream).blob();
  return { bytes: blob.size, blob };
}
