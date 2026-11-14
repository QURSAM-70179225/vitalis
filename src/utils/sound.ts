/**
 * Alert sounds + vibration. Browsers only allow audio after the user has
 * interacted with the page, so a blocked sound is replayed on the first tap.
 */
import { useApp } from '@/store/useApp';

export type AlertTone = 'critical' | 'act' | 'good';

const PATTERNS: Record<AlertTone, { freq: number[]; dur: number; gap: number; vibrate: number[] }> = {
  critical: { freq: [880, 660, 880, 660, 880], dur: 0.22, gap: 0.08, vibrate: [400, 150, 400, 150, 400] },
  act: { freq: [660, 660], dur: 0.2, gap: 0.12, vibrate: [200, 100, 200] },
  good: { freq: [523, 659, 784], dur: 0.14, gap: 0.03, vibrate: [] },
};

let ctx: AudioContext | null = null;
let pending: AlertTone | null = null;
let unlockHooked = false;
let pendingVibrate: AlertTone | null = null;

function hasInteracted(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : false;
}

function vibrate(tone: AlertTone) {
  const v = PATTERNS[tone].vibrate;
  if (!v.length || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(v);
  } catch {
    /* not supported */
  }
}

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

function play(tone: AlertTone): boolean {
  const ac = audio();
  if (!ac || ac.state !== 'running') return false;
  const p = PATTERNS[tone];
  let t = ac.currentTime + 0.02;
  for (const f of p.freq) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = tone === 'good' ? 'sine' : 'square';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(tone === 'good' ? 0.05 : 0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + p.dur + 0.02);
    t += p.dur + p.gap;
  }
  return true;
}

function hookUnlock() {
  if (unlockHooked) return;
  unlockHooked = true;
  const unlock = () => {
    if (pendingVibrate) vibrate(pendingVibrate);
    pendingVibrate = null;
    const ac = audio();
    void ac?.resume().then(() => {
      if (pending) play(pending);
      pending = null;
    });
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    unlockHooked = false;
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** Play an alert tone (and vibrate on phones) unless alert sounds are turned off. */
export function alertSound(tone: AlertTone): void {
  if (!useApp.getState().settings.alertSound) return;
  // Browsers allow vibration only after the user has tapped the page; otherwise do it on the first tap.
  if (hasInteracted()) vibrate(tone);
  else pendingVibrate = tone;
  const ac = audio();
  if (ac && ac.state === 'suspended') void ac.resume().catch(() => undefined);
  if (!play(tone)) pending = tone;
  if (pending || pendingVibrate) hookUnlock();
}
