import { useEffect, useRef } from 'react';
import { useApp } from '@/store/useApp';

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  speed: number;
  phase: number;
  hue: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/**
 * Animated background: twinkling, slowly drifting stars and the occasional
 * shooting star. Static when "reduce motion" is on; hidden in high contrast.
 */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useApp((s) => s.settings.reducedMotion);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = reduce || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let meteor: Meteor | null = null;
    let nextMeteor = performance.now() + 3000;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(260, (w * h) / 6500));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() < 0.08 ? 1.6 + Math.random() * 0.8 : 0.5 + Math.random() * 0.9,
        base: 0.25 + Math.random() * 0.6,
        speed: 0.004 + Math.random() * 0.012,
        phase: Math.random() * Math.PI * 2,
        hue: Math.random() < 0.2 ? 190 : Math.random() < 0.1 ? 40 : 220,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const twinkle = still ? 1 : 0.6 + 0.4 * Math.sin(s.phase + t * 0.0015 * (1 + s.speed * 40));
        const a = s.base * twinkle;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${s.hue}, 80%, 88%, ${a})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.r > 1.5) {
          ctx.fillStyle = `hsla(${s.hue}, 90%, 80%, ${a * 0.15})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (!still) {
          s.y += s.speed * 2; // slow drift, like gently moving through space
          if (s.y > h + 2) {
            s.y = -2;
            s.x = Math.random() * w;
          }
        }
      }
      if (still) return;
      if (!meteor && t > nextMeteor) {
        const fromLeft = Math.random() < 0.5;
        meteor = { x: fromLeft ? Math.random() * w * 0.5 : w * (0.5 + Math.random() * 0.5), y: Math.random() * h * 0.4, vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 4), vy: 2.5 + Math.random() * 2, life: 1 };
      }
      if (meteor) {
        const m = meteor;
        const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14);
        grad.addColorStop(0, `rgba(186, 240, 255, ${0.9 * m.life})`);
        grad.addColorStop(1, 'rgba(186, 240, 255, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 14, m.y - m.vy * 14);
        ctx.stroke();
        m.x += m.vx;
        m.y += m.vy;
        m.life -= 0.012;
        if (m.life <= 0 || m.x < -100 || m.x > w + 100 || m.y > h + 100) {
          meteor = null;
          nextMeteor = t + 5000 + Math.random() * 7000;
        }
      }
    };

    const loop = (t: number) => {
      if (!document.hidden) draw(t);
      raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', resize);
    if (still) draw(0);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reduce]);

  return <canvas ref={ref} className="starfield pointer-events-none fixed inset-0 z-0" aria-hidden />;
}
