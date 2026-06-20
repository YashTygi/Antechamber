import { storage } from 'wxt/utils/storage';
import type { UserProfile, Settings, Stats, Meta, Tuning, GameEventType, RecentItem } from './types';
import { DEFAULT_SETTINGS, DEFAULT_STATS, DEFAULT_META, DEFAULT_TUNING } from './defaults';
import { applyEvent } from './gamification';

/* ------------------------------ items ---------------------------------- */

export const profileItem = storage.defineItem<UserProfile | null>('local:profile', {
  fallback: null,
});
export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});
export const statsItem = storage.defineItem<Stats>('local:stats', {
  fallback: DEFAULT_STATS,
});
export const metaItem = storage.defineItem<Meta>('local:meta', {
  fallback: DEFAULT_META,
});
export const tuningItem = storage.defineItem<Tuning>('local:tuning', {
  fallback: DEFAULT_TUNING,
});

export async function getTuning(): Promise<Tuning> {
  return { ...DEFAULT_TUNING, ...(await tuningItem.getValue()) };
}

/* ------------------------- recent decisions ----------------------------- */
/* A small capped log of videos the user actually opened — powers the Today
   screen and a popup-side correction path. */

export const recentItem = storage.defineItem<RecentItem[]>('local:recent', { fallback: [] });

let recentChain: Promise<unknown> = Promise.resolve();
export function pushRecent(item: RecentItem): Promise<void> {
  const run = recentChain.then(async () => {
    const cur = (await recentItem.getValue()) ?? [];
    const next = [item, ...cur.filter((r) => r.videoId !== item.videoId)].slice(0, 30);
    await recentItem.setValue(next);
  });
  recentChain = run.catch(() => {});
  return run as Promise<void>;
}

export async function getRecentItems(): Promise<RecentItem[]> {
  return (await recentItem.getValue()) ?? [];
}

/* --------------------------- merged reads ------------------------------- */
/* fallbacks only kick in when nothing is stored; merging defaults also keeps
   us forward-compatible when new fields are added to a stored object. */

export async function getSettings(): Promise<Settings> {
  const s = await settingsItem.getValue();
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await settingsItem.setValue(next);
  return next;
}

export async function getStats(): Promise<Stats> {
  const s = await statsItem.getValue();
  return {
    ...DEFAULT_STATS,
    ...s,
    lifetime: { ...DEFAULT_STATS.lifetime, ...s?.lifetime },
    daily: s?.daily ?? {},
  };
}

/* ------------------------- cache invalidation --------------------------- */

/** Bump the watermark so every cached classification is treated as stale and
 *  the content scripts reset their painted labels. Call after editing the
 *  profile or changing sensitivity. */
export async function bumpVectors(): Promise<number> {
  const meta = await metaItem.getValue();
  const vectorsBuiltAt = Date.now();
  await metaItem.setValue({ ...DEFAULT_META, ...meta, vectorsBuiltAt });
  return vectorsBuiltAt;
}

/* --------------------------- stats recording ---------------------------- */
/* Serialize read-modify-write so concurrent events can't clobber each other. */

let writeChain: Promise<unknown> = Promise.resolve();

export function recordEvent(event: GameEventType): Promise<{ stats: Stats; pointsDelta: number }> {
  const run = writeChain.then(async () => {
    const current = await getStats();
    const result = applyEvent(current, event);
    await statsItem.setValue(result.stats);
    return result;
  });
  writeChain = run.catch(() => {});
  return run;
}

export async function resetStats(): Promise<void> {
  await statsItem.setValue(structuredClone(DEFAULT_STATS));
}
