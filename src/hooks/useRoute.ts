import { useEffect, useSyncExternalStore } from 'react';

/**
 * Minimal hash router (no extra dependency). Routes look like
 *   #/dashboard  #/system/cardio  #/guidance/resistive
 */
export type PageId =
  | 'dashboard'
  | 'checkin'
  | 'trends'
  | 'system'
  | 'cognitive'
  | 'guidance'
  | 'schedule'
  | 'crew'
  | 'ground'
  | 'achievements'
  | 'settings'
  | 'camera'
  | 'live'
  | 'console'
  | 'about'
  | 'journey';

export interface Route {
  page: PageId;
  param?: string;
}

const PAGES: PageId[] = ['dashboard', 'checkin', 'trends', 'system', 'cognitive', 'guidance', 'schedule', 'crew', 'ground', 'achievements', 'settings', 'camera', 'live', 'console', 'about', 'journey'];

export function parseHash(hash: string): Route {
  const [page, param] = hash.replace(/^#\/?/, '').split('/');
  if (PAGES.includes(page as PageId)) return { page: page as PageId, param: param ? decodeURIComponent(param) : undefined };
  return { page: 'dashboard' };
}

/** Accepts "trends", "system/cardio" or legacy "guidance:resistive". */
export function navigate(to: string): void {
  const path = to.replace(':', '/');
  const next = `#/${path}`;
  if (window.location.hash !== next) window.location.hash = next;
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  const route = parseHash(hash);
  useEffect(() => {
    // Move focus to main content on navigation for screen-reader / keyboard users.
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [hash]);
  return route;
}
