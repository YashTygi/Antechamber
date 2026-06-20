/**
 * Optional YouTube Data API v3 enrichment (runs in the background only).
 *
 * When the user supplies an API key, we fetch category + tags + a description
 * snippet per video and fold them into the text we embed — a much stronger
 * signal than the title alone. Everything is cached in IndexedDB and degrades
 * gracefully (no key / quota hit / offline → fall back to title-only local).
 *
 * Privacy: this sends video IDs to Google. It is OFF unless a key is set.
 */

import type { ApiMeta } from './types';
import { idbGetMany, idbSetMany, idbEvictLRU } from './db';
import { API_CACHE_MAX } from './defaults';

/** Stable, public YouTube videoCategoryId → name (US list; ids are global). */
const CATEGORY_NAMES: Record<string, string> = {
  '1': 'Film & Animation',
  '2': 'Autos & Vehicles',
  '10': 'Music',
  '15': 'Pets & Animals',
  '17': 'Sports',
  '19': 'Travel & Events',
  '20': 'Gaming',
  '22': 'People & Blogs',
  '23': 'Comedy',
  '24': 'Entertainment',
  '25': 'News & Politics',
  '26': 'Howto & Style',
  '27': 'Education',
  '28': 'Science & Technology',
  '29': 'Nonprofits & Activism',
};

let disabledUntil = 0; // backoff window after a quota/forbidden error

export function apiEnabled(key: string): boolean {
  return !!key && Date.now() > disabledUntil;
}

/** Metadata for the given videoIds (cache-first; only fetches the misses). */
export async function fetchMeta(ids: string[], key: string): Promise<Map<string, ApiMeta>> {
  const out = new Map<string, ApiMeta>();
  if (!ids.length) return out;

  const cached = await idbGetMany<ApiMeta>('apiCache', ids);
  const missing: string[] = [];
  ids.forEach((id, i) => {
    const c = cached[i];
    if (c) out.set(id, c);
    else missing.push(id);
  });

  if (!missing.length || !apiEnabled(key)) return out;

  const toWrite: [string, ApiMeta][] = [];
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    try {
      const url =
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.join(',')}` +
        `&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 403 || res.status === 429) disabledUntil = Date.now() + 60 * 60 * 1000;
        break;
      }
      const data = await res.json();
      for (const item of data.items ?? []) {
        const sn = item.snippet ?? {};
        const meta: ApiMeta = {
          videoId: item.id,
          categoryId: sn.categoryId ?? '',
          categoryName: CATEGORY_NAMES[sn.categoryId] ?? '',
          tags: Array.isArray(sn.tags) ? sn.tags.slice(0, 12) : [],
          description: (sn.description ?? '').slice(0, 300),
          channelId: sn.channelId ?? '',
          channelTitle: sn.channelTitle ?? '',
          t: Date.now(),
        };
        out.set(meta.videoId, meta);
        toWrite.push([meta.videoId, meta]);
      }
    } catch {
      break; // network error → fall back to local for the rest
    }
  }

  if (toWrite.length) {
    await idbSetMany('apiCache', toWrite);
    void idbEvictLRU('apiCache', API_CACHE_MAX);
  }
  return out;
}

/** The text we actually embed: title + category + tags + description snippet. */
export function enrichText(title: string, meta?: ApiMeta): string {
  if (!meta) return title;
  const parts = [title];
  if (meta.categoryName) parts.push(meta.categoryName);
  if (meta.tags.length) parts.push(meta.tags.join(' '));
  if (meta.description) parts.push(meta.description);
  return parts.join('. ');
}
