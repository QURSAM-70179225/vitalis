/** Device helpers for offline hand-off: a friendly name, battery level and storage persistence. */

/** "Android phone", "iPhone", "Windows PC"… shown in hand-off files so you know where data came from. */
export function deviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad|Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Linux/.test(ua)) return 'Linux computer';
  return 'this device';
}

export interface BatteryInfo {
  level: number; // 0..1
  charging: boolean;
}

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

/** Battery level where supported (Chrome, Edge, Android). Calls `cb` on every change. Returns a cleanup. */
export function watchBattery(cb: (b: BatteryInfo | null) => void): () => void {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
  if (!nav.getBattery) {
    cb(null);
    return () => undefined;
  }
  let bm: BatteryManagerLike | null = null;
  let stopped = false;
  const update = () => bm && cb({ level: bm.level, charging: bm.charging });
  nav
    .getBattery()
    .then((b) => {
      if (stopped) return;
      bm = b;
      update();
      b.addEventListener('levelchange', update);
      b.addEventListener('chargingchange', update);
    })
    .catch(() => cb(null));
  return () => {
    stopped = true;
    bm?.removeEventListener('levelchange', update);
    bm?.removeEventListener('chargingchange', update);
  };
}

/** Ask the browser to never auto-delete this app's data (important for fully offline use). */
export async function persistStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageInfo(): Promise<{ persisted: boolean; usedMb: number | null; quotaMb: number | null }> {
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    const est = await navigator.storage?.estimate?.();
    const mb = (n?: number) => (typeof n === 'number' ? Math.round((n / 1048576) * 10) / 10 : null);
    return { persisted, usedMb: mb(est?.usage), quotaMb: mb(est?.quota) };
  } catch {
    return { persisted: false, usedMb: null, quotaMb: null };
  }
}

/** Share a file through the phone's share sheet (Nearby Share, AirDrop, Bluetooth: works offline). */
export async function shareFile(file: File, title: string): Promise<'shared' | 'unsupported' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await nav.share({ files: [file], title });
    return 'shared';
  } catch (err) {
    return err instanceof DOMException && err.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}
