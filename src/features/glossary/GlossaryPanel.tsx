import { BookA } from 'lucide-react';
import { GLOSSARY } from '@/data/glossary';
import { Panel } from '@/components/ui';

/** "Medical words made simple": everyday explanations of terms used in the app. */
export function GlossaryPanel() {
  return (
    <Panel aria-labelledby="gl-h">
      <h2 id="gl-h" className="h2 mb-1 flex items-center gap-2">
        <BookA className="h-5 w-5 text-accent" aria-hidden /> Medical words made simple
      </h2>
      <p className="muted mb-4 text-sm">You don't need medical training to use VITALIS. Here's what the few technical words mean.</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {GLOSSARY.map((g) => (
          <div key={g.term} className="rounded-xl bg-white/5 p-3">
            <dt className="font-semibold">{g.term}</dt>
            <dd className="muted mt-0.5 text-sm">{g.simple}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
