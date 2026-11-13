import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera as CamIcon, CheckCircle2, FlaskConical, Play, Square, Sun } from 'lucide-react';
import type { SystemId } from '@/types';
import { useApp } from '@/store/useApp';
import { navigate } from '@/hooks/useRoute';
import { RPPG, estimateHeartRate, type RppgEstimate, type Sample } from '@/engine/rppg';
import { SYSTEMS, SYSTEM_IDS } from '@/data/systems';
import { cn } from '@/utils';
import { PageHeader, Panel } from '@/components/ui';
import { ImageLog } from './SystemDetail';

/** Minimal typing for the experimental Shape Detection API. */
interface DetectedFace {
  boundingBox: DOMRectReadOnly;
}
interface FaceDetectorLike {
  detect(src: CanvasImageSource): Promise<DetectedFace[]>;
}
declare global {
  interface Window {
    FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike;
  }
}

type Mode = 'idle' | 'camera' | 'sim' | 'done';

function Waveform({ data, color = '#22d3ee' }: { data: number[]; color?: string }) {
  const w = 600;
  const h = 120;
  if (data.length < 2) return <div className="h-[120px] rounded-xl bg-black/30" aria-hidden />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 8 - ((v - min) / span) * (h - 16)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[120px] w-full rounded-xl bg-black/30" role="img" aria-label="Live pulse waveform">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

export default function Camera() {
  const setCameraHr = useApp((s) => s.setCameraHr);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const samples = useRef<Sample[]>([]);
  const raf = useRef<number>();
  const roi = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const detector = useRef<FaceDetectorLike | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [est, setEst] = useState<RppgEstimate | null>(null);
  const [error, setError] = useState('');
  const [faceTracking, setFaceTracking] = useState(false);
  const [brightness, setBrightness] = useState(0);
  const [region, setRegion] = useState<SystemId>('skin');

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const finish = useCallback(() => {
    stop();
    setEst(estimateHeartRate(samples.current));
    setMode('done');
  }, [stop]);

  const loop = useCallback(
    (t0: number, sim: boolean) => {
      let frame = 0;
      let lastEst = 0;
      const step = () => {
        const now = performance.now();
        const sec = (now - t0) / 1000;
        if (sim) {
          // Synthetic 68 bpm pulse + breathing drift + noise, for demos without a webcam.
          const v = 120 + 0.5 * Math.sin(2 * Math.PI * (68 / 60) * sec) + 2 * Math.sin(2 * Math.PI * 0.25 * sec) + (Math.random() - 0.5) * 0.8;
          samples.current.push({ t: now, v });
          setBrightness(120);
        } else {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video && canvas && video.videoWidth) {
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            if (detector.current && frame % 15 === 0) {
              void detector.current.detect(canvas).then((faces) => {
                const f = faces[0]?.boundingBox;
                if (f) roi.current = { x: f.x + f.width * 0.3, y: f.y + f.height * 0.08, w: f.width * 0.4, h: f.height * 0.18 };
              });
            }
            const r = roi.current ?? { x: canvas.width * 0.4, y: canvas.height * 0.18, w: canvas.width * 0.2, h: canvas.height * 0.12 };
            const img = ctx.getImageData(Math.round(r.x), Math.round(r.y), Math.max(1, Math.round(r.w)), Math.max(1, Math.round(r.h))).data;
            let g = 0;
            let all = 0;
            for (let i = 0; i < img.length; i += 4) {
              g += img[i + 1];
              all += img[i] + img[i + 1] + img[i + 2];
            }
            const px = img.length / 4;
            samples.current.push({ t: now, v: g / px });
            if (frame % 10 === 0) setBrightness(all / px / 3);
          }
        }
        frame++;
        setElapsed(sec);
        if (now - lastEst > 1000 && sec > RPPG.minSec) {
          lastEst = now;
          setEst(estimateHeartRate(samples.current.filter((s) => s.t > now - RPPG.windowSec * 1000)));
        }
        if (sec >= RPPG.windowSec) return finish();
        raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    },
    [finish],
  );

  const startCamera = async () => {
    setError('');
    samples.current = [];
    setEst(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      if (window.FaceDetector) {
        try {
          detector.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
          setFaceTracking(true);
        } catch {
          detector.current = null;
        }
      }
      setMode('camera');
      loop(performance.now(), false);
    } catch (e) {
      setError(e instanceof Error ? `Camera unavailable: ${e.message}. You can run the simulated signal instead.` : 'Camera unavailable.');
    }
  };

  const startSim = () => {
    samples.current = [];
    setEst(null);
    setError('');
    setMode('sim');
    loop(performance.now(), true);
  };

  const running = mode === 'camera' || mode === 'sim';
  const conf = est?.confidence ?? 0;
  const confLabel = conf >= 0.6 ? 'Good' : conf >= 0.35 ? 'Fair' : 'Low';

  return (
    <>
      <button onClick={() => navigate('checkin')} className="mb-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to check-in
      </button>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 text-monitor">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Experimental · not a medical device
          </span>
        }
        title="Camera vitals"
        subtitle="Remote photoplethysmography: your camera picks up tiny colour changes in your forehead skin with each heartbeat. Hold still for 20 seconds in steady, even light."
      />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Panel>
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className={cn('h-full w-full -scale-x-100 object-cover', mode !== 'camera' && 'hidden')} muted playsInline aria-label="Camera preview" />
            <canvas ref={canvasRef} className="hidden" aria-hidden />
            {mode === 'camera' && (
              <div className="pointer-events-none absolute left-[40%] top-[18%] h-[12%] w-[20%] rounded-lg border-2 border-accent/80 shadow-glow" aria-hidden>
                <span className="absolute -top-6 left-0 whitespace-nowrap text-[11px] text-accent">{faceTracking ? 'Forehead (tracked)' : 'Align forehead here'}</span>
              </div>
            )}
            {mode !== 'camera' && (
              <div className="grid h-full place-items-center p-6 text-center">
                {mode === 'sim' ? (
                  <p className="text-sm text-monitor">Simulated signal running (68 bpm synthetic pulse)</p>
                ) : (
                  <div>
                    <CamIcon className="mx-auto mb-2 h-10 w-10 text-accent/70" aria-hidden />
                    <p className="muted text-sm">Video is processed on this device only. Nothing is recorded or sent.</p>
                  </div>
                )}
              </div>
            )}
            {running && (
              <div className="absolute inset-x-3 bottom-3 h-2 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={Math.round((elapsed / RPPG.windowSec) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Measurement progress">
                <div className="h-full bg-accent" style={{ width: `${(elapsed / RPPG.windowSec) * 100}%` }} />
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!running ? (
              <>
                <button className="btn-primary btn-lg" onClick={startCamera}>
                  <CamIcon className="h-5 w-5" aria-hidden /> {mode === 'done' ? 'Measure again' : 'Start 20 s measurement'}
                </button>
                <button className="btn-ghost btn-lg" onClick={startSim}>
                  <Play className="h-5 w-5" aria-hidden /> Simulated signal (demo)
                </button>
              </>
            ) : (
              <button className="btn-ghost btn-lg" onClick={finish}>
                <Square className="h-5 w-5" aria-hidden /> Stop
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-act">
              {error}
            </p>
          )}
          {mode === 'camera' && brightness > 0 && (brightness < 60 || brightness > 220) && (
            <p className="mt-3 flex items-center gap-2 text-sm text-monitor">
              <Sun className="h-4 w-4" aria-hidden /> {brightness < 60 ? 'Too dark: increase cabin lighting.' : 'Too bright: avoid direct light on your face.'}
            </p>
          )}
        </Panel>

        <Panel aria-live="polite">
          <p className="eyebrow">Estimated heart rate</p>
          <p className="numeral my-1 text-7xl">
            {est ? est.bpm : '--'} <span className="muted text-xl">bpm</span>
          </p>
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-xs">
              <span>Signal confidence</span>
              <span className={conf >= 0.6 ? 'text-nominal' : conf >= 0.35 ? 'text-monitor' : 'text-act'}>
                {est ? `${confLabel} (${Math.round(conf * 100)}%)` : running ? 'collecting…' : '—'}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(conf * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Signal confidence">
              <div className={cn('h-full', conf >= 0.6 ? 'bg-nominal' : conf >= 0.35 ? 'bg-monitor' : 'bg-act')} style={{ width: `${conf * 100}%` }} />
            </div>
          </div>
          <Waveform data={(est?.waveform ?? []).slice(-RPPG.fs * 6)} />
          <p className="muted mt-1 text-xs">Band-pass filtered pulse wave (0.7–3 Hz), last 6 s</p>
          {mode === 'done' && est && (
            <button
              className="btn-primary btn-lg mt-4 w-full"
              onClick={() => {
                setCameraHr(est.bpm);
                navigate('checkin');
              }}
              disabled={conf < 0.2}
            >
              <CheckCircle2 className="h-5 w-5" aria-hidden /> Use {est.bpm} bpm in check-in
            </button>
          )}
          <p className="muted mt-4 text-xs">
            Method: green-channel rPPG (Verkruysse 2008; Poh 2010). Motion, low light and darker cabin lighting lower accuracy. Confirm with the chest strap or pulse oximeter if the confidence is low or the result looks unusual.
          </p>
        </Panel>
      </div>

      <div className="mt-8">
        <h2 className="h2 mb-3">Image log by body region</h2>
        <div role="group" aria-label="Body region" className="mb-3 flex flex-wrap gap-1.5">
          {SYSTEM_IDS.map((s) => (
            <button key={s} aria-pressed={region === s} onClick={() => setRegion(s)} className={cn('chip focus-ring min-h-[40px]', region === s && 'border-accent text-accent')}>
              {SYSTEMS[s].short}
            </button>
          ))}
        </div>
        <ImageLog system={region} />
      </div>
    </>
  );
}
