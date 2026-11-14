import { useRef, useState } from 'react';
import { Check, FileText, ImageUp, Loader2, ScanText } from 'lucide-react';
import type { IndicatorValues } from '@/types';
import { useApp } from '@/store/useApp';
import { INDICATORS } from '@/data/indicators';
import { parseHealthReport, type FoundValue } from '@/engine/reportParser';
import { formatValue } from '@/utils/units';
import { Drawer } from '@/components/ui';

/** Minimal typing for the browser's built-in text detector (Shape Detection API). */
interface DetectedText {
  rawValue: string;
}
interface TextDetectorLike {
  detect(src: ImageBitmapSource): Promise<DetectedText[]>;
}
declare global {
  interface Window {
    TextDetector?: new () => TextDetectorLike;
  }
}

export const textScanSupported = () => typeof window !== 'undefined' && !!window.TextDetector;

/**
 * Scan a health report: photo → text (browser text detector) → values, or
 * paste/type the report text. The astronaut confirms which values to use.
 */
export function ReportScanner({ open, onClose, onUse }: { open: boolean; onClose: () => void; onUse: (v: IndicatorValues) => void }) {
  const units = useApp((s) => s.settings.units);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [found, setFound] = useState<FoundValue[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const read = (t: string) => {
    const r = parseHealthReport(t);
    setFound(r.found);
    setChosen(new Set(r.found.map((f) => f.indicator)));
    if (!r.found.length) setNote('No health values found. Check the text below, or type the values in the check-in.');
  };

  const onFile = async (f: File) => {
    setNote('');
    setFound(null);
    setPreview(URL.createObjectURL(f));
    if (!window.TextDetector) {
      setNote('This browser cannot read text from photos yet. Type or paste the numbers from the report below.');
      return;
    }
    setBusy(true);
    try {
      const bmp = await createImageBitmap(f);
      const lines = await new window.TextDetector().detect(bmp);
      const t = lines.map((l) => l.rawValue).join('\n');
      setText(t);
      if (t.trim()) read(t);
      else setNote('No text found in the photo. Try a sharper, well-lit photo, or type the numbers below.');
    } catch {
      setNote('Could not read the photo. Type or paste the numbers from the report below.');
    } finally {
      setBusy(false);
    }
  };

  const use = () => {
    const v: IndicatorValues = {};
    for (const f of found ?? []) if (chosen.has(f.indicator)) v[f.indicator] = f.value;
    onUse(v);
    onClose();
  };

  return (
    <Drawer open={open} onClose={onClose} title="Scan a health report" wide>
      <div className="space-y-4">
        <p className="muted text-sm">
          Take a photo of a paper or screen report (for example from the medical kit or a check-up). VITALIS finds the numbers, and you choose which ones to use. The photo stays on this device.
        </p>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Report photo" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        <button className="btn-primary btn-lg w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ImageUp className="h-5 w-5" aria-hidden />} {busy ? 'Reading the report…' : 'Take or choose a photo'}
        </button>
        {!textScanSupported() && <p className="muted text-xs">Reading text from photos needs a browser with a built-in text detector. If yours doesn't have one, type or paste the report text below. It works the same way.</p>}
        {preview && <img src={preview} alt="Report photo" className="max-h-56 w-full rounded-xl object-contain" />}
        {note && (
          <p role="status" className="rounded-lg bg-monitor/10 p-3 text-sm text-monitor">
            {note}
          </p>
        )}

        <div>
          <label htmlFor="report-text" className="label flex items-center gap-2">
            <FileText className="h-4 w-4" aria-hidden /> Report text
          </label>
          <textarea id="report-text" className="field min-h-[120px] font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={'e.g.\nHeart rate 64 bpm\nBlood pressure 132/84\nSpO2 97%\nTemperature 36.9 C'} />
          <button className="btn-ghost mt-2" onClick={() => read(text)} disabled={!text.trim()}>
            <ScanText className="h-4 w-4" aria-hidden /> Find the values
          </button>
        </div>

        {found && found.length > 0 && (
          <div>
            <p className="label">Values found: untick any that are wrong</p>
            <ul className="space-y-2">
              {found.map((f) => {
                const on = chosen.has(f.indicator);
                return (
                  <li key={f.indicator}>
                    <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                      <input
                        type="checkbox"
                        className="h-6 w-6 shrink-0 accent-cyan-400"
                        checked={on}
                        onChange={() => {
                          const n = new Set(chosen);
                          if (on) n.delete(f.indicator);
                          else n.add(f.indicator);
                          setChosen(n);
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{INDICATORS[f.indicator].label}</span>
                        <span className="muted block truncate text-xs">read from: "{f.source}"</span>
                      </span>
                      <span className="numeral text-lg">{formatValue(f.indicator, f.value, units)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <button className="btn-primary btn-lg mt-4 w-full" onClick={use} disabled={!chosen.size}>
              <Check className="h-5 w-5" aria-hidden /> Use {chosen.size} value{chosen.size === 1 ? '' : 's'} in my check-in
            </button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
