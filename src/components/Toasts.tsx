import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { LEVEL_META } from '@/engine/status';
import { navigate } from '@/hooks/useRoute';
import { LEVEL_ICON } from './ui';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[60] flex w-[min(380px,92vw)] flex-col gap-2 md:bottom-6" aria-live="polite" role="status">
      <AnimatePresence>
        {toasts.map((t) => {
          const lvl = t.level && t.level !== 'info' ? t.level : null;
          const Icon = lvl ? LEVEL_ICON[lvl] : Bell;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              className="panel pointer-events-auto flex items-start gap-3 p-3"
              style={lvl ? { borderColor: `${LEVEL_META[lvl].color}88` } : undefined}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: lvl ? LEVEL_META[lvl].color : '#22d3ee' }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.body && <p className="muted text-xs">{t.body}</p>}
                {t.action && (
                  <button
                    className="mt-1.5 text-xs font-semibold text-accent underline-offset-2 hover:underline"
                    onClick={() => {
                      navigate(t.action!.route);
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label} →
                  </button>
                )}
              </div>
              <button aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="rounded p-1 text-slate-400 hover:text-white focus-ring">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
