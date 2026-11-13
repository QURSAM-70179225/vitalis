import type { IndicatorId, StatusLevel } from '@/types';
import { INDICATORS } from '@/data/indicators';
import { SYSTEMS } from '@/data/systems';
import { LEVEL_META } from '@/engine/status';
import { DISCLAIMER } from '@/engine/thresholds';
import type { HealthPacket } from './packet';

const CHARTS: IndicatorId[] = ['heartRate', 'systolic', 'sleepHours', 'mood', 'radiationDose', 'reactionTime'];

/** jsPDF's built-in Helvetica is Latin-1 only; map common symbols to ASCII. */
export function pdfSafe(t: string): string {
  return t
    .replace(/₂/g, '2')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/→/g, '->')
    .replace(/×/g, 'x')
    .replace(/±/g, '+/-')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[^\t\n\x20-\xFF]/g, '');
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** One-page flight-surgeon summary. jsPDF is loaded on demand. */
export async function buildReportPdf(packet: HealthPacket): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rawText = doc.text.bind(doc);
  const safe = (t: string | string[]) => (Array.isArray(t) ? t.map(pdfSafe) : pdfSafe(t));
  doc.text = ((t: string | string[], x: number, yy: number, o?: Record<string, unknown>) => rawText(safe(t), x, yy, o)) as typeof doc.text;
  const rawSplit = doc.splitTextToSize.bind(doc);
  doc.splitTextToSize = ((t: string, w: number) => rawSplit(pdfSafe(t), w)) as typeof doc.splitTextToSize;
  const W = 210;
  const M = 12;
  let y = M;

  // Header band
  doc.setFillColor(6, 11, 26);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(34, 211, 238);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('VITALIS · Flight Surgeon Health Report', M, 11);
  doc.setFontSize(9);
  doc.setTextColor(220, 230, 255);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${packet.crew.name} (${packet.crew.callsign}) · ${packet.crew.role}   |   ${packet.mission.name} · ${packet.mission.environment} · Mission day ${packet.mission.day}`,
    M,
    18,
  );
  doc.text(`Generated ${new Date(packet.generatedAt).toUTCString()} · one-way delay ${Math.round(packet.mission.oneWayDelaySec)} s`, M, 23);
  y = 34;

  // Overall
  const lvl = (l: StatusLevel) => LEVEL_META[l];
  const [r, g, b] = hex(lvl(packet.triage.overall).color);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const statusText = `STATUS: ${lvl(packet.triage.overall).label.toUpperCase()}`;
  const bw = doc.getTextWidth(statusText) + 6;
  doc.setFillColor(r, g, b);
  doc.roundedRect(M, y - 5, bw, 9, 2, 2, 'F');
  doc.setTextColor(10, 10, 10);
  doc.text(statusText, M + 3, y + 1);
  doc.setTextColor(20, 20, 30);
  doc.text(`Readiness ${packet.triage.readiness}/100`, M + bw + 6, y + 1);
  y += 9;

  // Systems row
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  Object.entries(packet.triage.systems).forEach(([id, l], i) => {
    const x = M + (i % 4) * 46;
    const yy = y + Math.floor(i / 4) * 5;
    const [sr, sg, sb] = hex(lvl(l).color);
    doc.setFillColor(sr, sg, sb);
    doc.circle(x + 1.5, yy - 1, 1.5, 'F');
    doc.text(`${SYSTEMS[id as keyof typeof SYSTEMS].short}: ${l === "critical" ? "Contact FS" : lvl(l).label}`, x + 4.5, yy);
  });
  y += 12;

  // Alerts
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Alerts (rule-based, explainable)', M, y);
  y += 5;
  doc.setFontSize(8.5);
  const alerts = packet.triage.alerts.slice(0, 5);
  if (!alerts.length) {
    doc.setFont('helvetica', 'normal');
    doc.text('No active alerts.', M, y);
    y += 5;
  }
  for (const a of alerts) {
    const [ar, ag, ab] = hex(lvl(a.level).color);
    doc.setFillColor(ar, ag, ab);
    doc.rect(M, y - 3, 1.5, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text(`[${lvl(a.level).label}] ${a.title}`, M + 3, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    const why = doc.splitTextToSize(`Why: ${a.why.join('; ')}`, W - 2 * M - 3) as string[];
    doc.text(why, M + 3, y);
    y += why.length * 3.6;
    const act = doc.splitTextToSize(`Actions started onboard: ${a.actions.slice(0, 3).join('; ')}`, W - 2 * M - 3) as string[];
    doc.text(act, M + 3, y);
    y += act.length * 3.6 + 2;
  }

  // Charts (2 × 3 grid)
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('14-day trends', M, y);
  y += 3;
  const cw = (W - 2 * M - 8) / 3;
  const ch = 28;
  CHARTS.forEach((id, i) => {
    const pts = packet.series[id] ?? [];
    const cx = M + (i % 3) * (cw + 4);
    const cy = y + Math.floor(i / 3) * (ch + 10);
    doc.setDrawColor(200, 205, 220);
    doc.setFillColor(246, 248, 252);
    doc.roundedRect(cx, cy, cw, ch + 6, 1.5, 1.5, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 30, 40);
    doc.setFont('helvetica', 'bold');
    const last = pts.at(-1)?.[1];
    doc.text(`${INDICATORS[id].label}${last !== undefined ? `: ${Number(last.toFixed(2))} ${INDICATORS[id].unit}` : ''}`, cx + 2, cy + 4);
    if (pts.length > 1) {
      const vals = pts.map((p) => p[1]);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const span = max - min || 1;
      const days = pts.map((p) => p[0]);
      const d0 = Math.min(...days);
      const dspan = Math.max(...days) - d0 || 1;
      const px = (d: number) => cx + 3 + ((d - d0) / dspan) * (cw - 6);
      const py = (v: number) => cy + ch + 3 - ((v - min) / span) * (ch - 6);
      doc.setDrawColor(8, 145, 178);
      doc.setLineWidth(0.5);
      for (let k = 1; k < pts.length; k++) doc.line(px(pts[k - 1][0]), py(pts[k - 1][1]), px(pts[k][0]), py(pts[k][1]));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(120, 120, 140);
      doc.text(`${Number(max.toFixed(1))}`, cx + cw - 2, cy + 8, { align: 'right' });
      doc.text(`${Number(min.toFixed(1))}`, cx + cw - 2, cy + ch + 4, { align: 'right' });
    }
  });
  y += 2 * (ch + 10) + 2;

  // Symptoms + cognitive
  doc.setTextColor(20, 20, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Symptoms (14 d)', M, y);
  doc.text('Reaction time (PVT)', W / 2, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const sym = packet.symptoms.slice(-6).map((s) => `Day ${s.day}: ${s.symptoms.join(', ')}`);
  doc.text(sym.length ? sym : ['None reported'], M, y);
  const cog = packet.cognitive.slice(-6).map((c) => `Day ${c.day}: ${c.meanRt} ms, ${c.lapses} lapses`);
  doc.text(cog.length ? cog : ['No tests'], W / 2, y);

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 130);
  doc.text(doc.splitTextToSize(`${DISCLAIMER} Private journal notes are excluded from all ground packets.`, W - 2 * M) as string[], M, 287);
  return doc.output('blob');
}
