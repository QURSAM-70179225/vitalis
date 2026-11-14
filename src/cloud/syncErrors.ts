/**
 * Turns a raw sync error into plain words plus what to do. Pure (no network, no storage).
 */
export interface SyncAdvice {
  title: string;
  fix: string;
}

const TABLE_NAMES: Record<string, string> = {
  check_ins: 'Daily check-in',
  cognitive_results: 'Reaction test',
  journal_entries: 'Journal entry',
  vital_samples: 'Sensor readings (1-minute average)',
  alerts: 'Alert',
  packets: 'Health report for the ground',
  ground_messages: 'Message',
  mission_events: 'Mission event',
};

export const syncItemName = (table: string): string => TABLE_NAMES[table] ?? table;

export function explainSyncError(raw: string | null | undefined): SyncAdvice | null {
  if (!raw) return null;
  const m = raw.toLowerCase();
  if (/failed to fetch|network|load failed|timeout|offline/.test(m))
    return { title: 'Could not reach the server', fix: 'Check the internet connection. It retries by itself every 30 seconds; nothing is lost.' };
  if (/jwt|expired|invalid api key|not authenticated|401/.test(m))
    return { title: 'Your sign-in has expired or the app key is wrong', fix: 'Sign out and sign in again. If it continues, check that the site uses the Supabase publishable (anon) key.' };
  if (/row-level security|violates row-level|permission denied|42501/.test(m))
    return {
      title: 'The database refused this item (permissions)',
      fix: 'Your Supabase database is probably using an older setup. In Supabase open SQL Editor, paste the latest supabase/schema.sql from GitHub and run it (safe to run again), then tap Try again.',
    };
  if (/does not exist|column|relation|schema cache|pgrst/.test(m))
    return {
      title: 'The database is missing a table or column',
      fix: 'Run the latest supabase/schema.sql in the Supabase SQL Editor (safe to run again), then tap Try again.',
    };
  if (/foreign key|23503/.test(m))
    return { title: 'This item belongs to a mission or person the server does not know', fix: 'It was probably made before you joined this mission. You can remove it below.' };
  return { title: 'The server could not save this item', fix: 'Tap Try again. If it keeps failing, remove the stuck item below; it stays on this device.' };
}
