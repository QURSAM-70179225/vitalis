import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Cpu, Send, WifiOff } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { useCrewData, useMissionContext, useTriage } from '@/hooks/useMission';
import { answerOffline, dailySummary, footer, llmSystemPrompt, type AssistantContext } from '@/engine/assistant';
import { bodyChanges } from '@/engine/journey';
import { computeInsights } from '@/engine/insights';
import { cn } from '@/utils';
import { Drawer } from '@/components/ui';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  source?: 'rules' | 'llm';
}

const SUGGESTIONS = ['What should I do now?', 'How is my sleep?', 'How am I changing over time?', 'Why is my blood pressure flagged?', 'I feel lonely', 'When should I call the doctors on Earth?'];

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = import.meta.env.VITE_GROQ_MODEL || 'llama-3.1-8b-instant';

async function askLlm(ctx: AssistantContext, history: Msg[], q: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 350,
      messages: [{ role: 'system', content: llmSystemPrompt(ctx) }, ...history.slice(-6).map((m) => ({ role: m.role, content: m.text })), { role: 'user', content: q }],
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('empty');
  // Guardrail: always append the engine's triage footer.
  return text + footer(ctx);
}

export default function Assistant() {
  const setOpen = useApp((s) => s.setAssistant);
  const aiEnabled = useApp((s) => s.settings.aiEnabled);
  const triage = useTriage();
  const { delaySec, crewMember, day } = useMissionContext();
  const { checkIns, cognitive } = useCrewData();
  const insights = useMemo(() => computeInsights(checkIns, cognitive), [checkIns, cognitive]);
  const changes = useMemo(() => (crewMember ? bodyChanges({ crewId: crewMember.id, checkIns, cognitive }, Math.max(1, day - 29), day) : []), [crewMember, checkIns, cognitive, day]);
  const [msgs, setMsgs] = useState<Msg[]>(() => (triage && crewMember ? [{ role: 'assistant', text: dailySummary({ triage, delaySec, callsign: crewMember.callsign, insights: [], changes: [] }), source: 'rules' }] : []));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const useLlm = aiEnabled && !!GROQ_KEY && navigator.onLine;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  if (!triage || !crewMember) return null;
  const ctx: AssistantContext = { triage, delaySec, callsign: crewMember.callsign, insights, changes };

  const ask = async (q: string) => {
    if (!q.trim()) return;
    const history = msgs;
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    let reply: Msg;
    if (useLlm) {
      try {
        reply = { role: 'assistant', text: await askLlm(ctx, history, q), source: 'llm' };
      } catch {
        reply = { role: 'assistant', text: answerOffline(q, ctx), source: 'rules' };
      }
    } else {
      await new Promise((r) => setTimeout(r, 250));
      reply = { role: 'assistant', text: answerOffline(q, ctx), source: 'rules' };
    }
    setMsgs((m) => [...m, reply]);
    setBusy(false);
  };

  return (
    <Drawer open onClose={() => setOpen(false)} title="Health assistant" wide>
      <div className="flex h-full flex-col">
        <p className={cn('mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs', useLlm ? 'bg-accent/10 text-accent' : 'bg-white/5 text-slate-300')}>
          {useLlm ? <Cpu className="h-4 w-4" aria-hidden /> : <WifiOff className="h-4 w-4" aria-hidden />}
          {useLlm
            ? 'AI explanation layer ON: your triage summary is sent to the language model. Answers are checked against the rule engine.'
            : 'Offline mode: answers come from the on-device rule engine. Nothing leaves this device.'}
        </p>
        <div className="flex-1 space-y-3 overflow-y-auto pb-3" aria-live="polite">
          {!msgs.length && (
            <div className="rounded-xl bg-white/5 p-4 text-sm">
              <Bot className="mb-2 h-6 w-6 text-accent" aria-hidden />
              Hi {crewMember.callsign}. I explain your own health data in plain language. I never diagnose, and I'll always tell you your triage level and when to escalate.
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cn('max-w-[92%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-relaxed', m.role === 'user' ? 'ml-auto bg-accent text-space-950' : 'bg-white/5')}>
              {m.text.split(/\*\*(.+?)\*\*/g).map((part, k) => (k % 2 ? <strong key={k}>{part}</strong> : <span key={k}>{part}</span>))}
              {m.source && <span className="muted mt-2 block text-[10px] uppercase tracking-wider">{m.source === 'llm' ? 'AI layer + rule engine' : 'Rule engine (offline)'}</span>}
            </div>
          ))}
          {busy && <p className="muted text-sm">Thinking…</p>}
          <div ref={endRef} />
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip focus-ring min-h-[36px] hover:border-accent" onClick={() => ask(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <label htmlFor="ask" className="sr-only">
            Ask about your health data
          </label>
          <input id="ask" className="field" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your data…" autoComplete="off" />
          <button className="btn-primary btn-icon h-12 w-12 shrink-0" aria-label="Send" disabled={busy}>
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </Drawer>
  );
}
