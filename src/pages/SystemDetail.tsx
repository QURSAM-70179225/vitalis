import { useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, Trash2 } from 'lucide-react';
import type { Attachment, SystemId } from '@/types';
import { SYSTEMS, SYSTEM_IDS } from '@/data/systems';
import { useApp } from '@/store/useApp';
import { useMissionContext, useTriage } from '@/hooks/useMission';
import { SystemPanel } from '@/features/bodymap/SystemPanel';
import { IndicatorChart } from '@/features/trends/IndicatorChart';
import { EmptyState, PageHeader, Panel } from '@/components/ui';
import { uid } from '@/utils';

const KINDS: Attachment['kind'][] = ['skin', 'eye', 'ultrasound', 'other'];

export function ImageLog({ system }: { system: SystemId }) {
  const { day, crewMember } = useMissionContext();
  const attachments = useApp((s) => s.attachments).filter((a) => a.system === system && a.crewId === crewMember?.id);
  const add = useApp((s) => s.addAttachment);
  const remove = useApp((s) => s.removeAttachment);
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<Attachment['kind']>(system === 'sans' ? 'eye' : system === 'skin' ? 'skin' : 'other');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    // Downscale to keep IndexedDB small.
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    await add({ id: uid('att-'), crewId: crewMember!.id, day, timestamp: new Date().toISOString(), system, kind, note, dataUrl: c.toDataURL('image/jpeg', 0.8) });
    setNote('');
  };

  return (
    <Panel aria-labelledby="img-h">
      <h2 id="img-h" className="h2 mb-3">
        Image log
      </h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-[160px_1fr_auto]">
        <div>
          <label className="label" htmlFor="img-kind">
            Type
          </label>
          <select id="img-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as Attachment['kind'])}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k === 'eye' ? 'Eye photo' : k === 'skin' ? 'Skin condition' : k === 'ultrasound' ? 'Ultrasound image' : 'Other'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="img-note">
            Notes
          </label>
          <input id="img-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. rash on left forearm, 2 cm, itchy" />
        </div>
        <div className="flex items-end">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" id="img-file" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button className="btn-primary w-full" onClick={() => fileRef.current?.click()}>
            <ImagePlus className="h-5 w-5" aria-hidden /> Add image
          </button>
        </div>
      </div>
      {attachments.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {attachments.map((a) => (
            <li key={a.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
              <img src={a.dataUrl} alt={`${a.kind} image, SOL ${a.day}: ${a.note || 'no note'}`} className="aspect-square w-full object-cover" />
              <div className="flex items-start justify-between gap-2 p-2 text-xs">
                <span>
                  <span className="font-semibold">SOL {a.day}</span> · {a.note || a.kind}
                </span>
                <button aria-label="Delete image" className="text-slate-400 hover:text-critical" onClick={() => remove(a.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={ImagePlus} title="No images yet" body="Attach photos (skin, eye, ultrasound) so you and the CMO can compare changes over time. Images stay on this device." />
      )}
    </Panel>
  );
}

export default function SystemDetail({ id }: { id?: string }) {
  const triage = useTriage();
  const sysId = (SYSTEM_IDS.includes(id as SystemId) ? id : 'cardio') as SystemId;
  const sys = SYSTEMS[sysId];
  if (!triage) return null;
  return (
    <>
      <a href="#/dashboard" className="mb-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Body map
      </a>
      <PageHeader eyebrow="Body system" title={sys.name} subtitle={sys.whatItDoes} />
      <nav aria-label="Body systems" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {SYSTEM_IDS.map((s) => (
          <a key={s} href={`#/system/${s}`} aria-current={s === sysId ? 'page' : undefined} className={s === sysId ? 'chip border-accent text-accent' : 'chip hover:border-white/30'}>
            {SYSTEMS[s].short}
          </a>
        ))}
      </nav>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <Panel>
          <SystemPanel id={sysId} triage={triage} showLink={false} />
        </Panel>
        <div className="flex flex-col gap-5">
          {sys.indicators.slice(0, 3).map((ind) => (
            <Panel key={ind}>
              <IndicatorChart indicator={ind} range={30} height={200} />
            </Panel>
          ))}
          <ImageLog system={sysId} />
        </div>
      </div>
    </>
  );
}
