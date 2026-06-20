/**
 * YouTube DOM map. Cards come in TWO shapes and YouTube is mid-migration:
 *
 *  OLD shape — used on Search (/results)
 *    card    : ytd-video-renderer
 *    title   : a#video-title           → `title` attribute
 *    channel : ytd-channel-name a       → textContent + channel href
 *
 *  NEW shape ("lockup") — used on Home (/) and the Watch sidebar (/watch)
 *    card    : yt-lockup-view-model
 *    title   : h3.ytLockupMetadataViewModelHeadingReset → `title` attribute
 *    channel : .ytContentMetadataViewModelMetadataText  → textContent
 *
 * id="video-title" / id="channel-name" are NOT unique on the page — always
 * find the CARD first, then querySelector WITHIN the card.
 */

export type Surface = 'home' | 'search' | 'watch' | 'subscriptions' | 'channel' | 'other';

export const OLD_CARD_SELECTOR = 'ytd-video-renderer';
export const NEW_CARD_SELECTOR = 'yt-lockup-view-model';
export const CARD_SELECTOR = `${OLD_CARD_SELECTOR}, ${NEW_CARD_SELECTOR}`;

export const SHORTS_SELECTORS = [
  'grid-shelf-view-model',
  'ytd-reel-shelf-renderer',
  'ytd-rich-shelf-renderer[is-shorts]',
];

export interface ScrapedCard {
  card: HTMLElement;
  videoId: string;
  title: string;
  channel: string | null;
  channelKey: string | null;
  channelThumb: string | null;
}

export function detectSurface(url: string = location.href): Surface {
  let p: string;
  try {
    p = new URL(url).pathname;
  } catch {
    return 'other';
  }
  if (p === '/') return 'home';
  if (p === '/results') return 'search';
  if (p === '/watch') return 'watch';
  if (p === '/feed/subscriptions') return 'subscriptions';
  if (p.startsWith('/@') || p.startsWith('/channel') || p.startsWith('/c/') || p.startsWith('/user/')) {
    return 'channel';
  }
  return 'other';
}

export function videoIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, location.origin);
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** A stable-ish channel key from a channel URL: @handle, UC… id, c/Name, user/Name. */
export function channelKeyFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  let p: string;
  try {
    p = new URL(href, location.origin).pathname;
  } catch {
    return null;
  }
  let m = p.match(/^\/(@[\w.-]+)/);
  if (m) return m[1];
  m = p.match(/^\/channel\/([\w-]+)/);
  if (m) return m[1];
  m = p.match(/^\/(c|user)\/([\w.-]+)/);
  if (m) return `${m[1]}/${m[2]}`;
  return null;
}

function findVideoId(card: HTMLElement): string | null {
  const anchors = card.querySelectorAll<HTMLAnchorElement>('a[href]');
  for (const a of anchors) {
    const id = videoIdFromHref(a.getAttribute('href'));
    if (id) return id;
  }
  return null;
}

/** Channel identity within a card (key + display name). */
function findChannel(card: HTMLElement): { key: string | null; name: string | null } {
  let key: string | null = null;
  let name: string | null = null;
  const anchors = card.querySelectorAll<HTMLAnchorElement>('a[href]');
  for (const a of anchors) {
    const k = channelKeyFromHref(a.getAttribute('href'));
    if (k) {
      key = k;
      name = a.textContent?.trim() || null;
      break;
    }
  }
  if (!name) {
    name =
      card.querySelector('.ytContentMetadataViewModelMetadataText')?.textContent?.trim() ||
      card.querySelector('ytd-channel-name')?.textContent?.trim() ||
      null;
  }
  if (!key && name) key = 'name:' + name.toLowerCase();
  return { key, name };
}

/** Channel avatar URL within a card. Channel avatars are served from yt3.* while
 *  video thumbnails come from i.ytimg.com — so filter by host. */
function findChannelThumb(card: HTMLElement): string | null {
  const imgs = card.querySelectorAll<HTMLImageElement>('img');
  for (const img of imgs) {
    const src = img.src || img.getAttribute('src') || '';
    if (/yt3\.(ggpht|googleusercontent)\.com/.test(src)) return src;
  }
  return null;
}

function extractOld(card: HTMLElement): ScrapedCard | null {
  const a = card.querySelector('a#video-title');
  const title = a?.getAttribute('title') || a?.textContent?.trim() || '';
  const videoId = videoIdFromHref(a?.getAttribute('href')) ?? findVideoId(card);
  if (!title || !videoId) return null;
  const ch = findChannel(card);
  return { card, videoId, title, channel: ch.name, channelKey: ch.key, channelThumb: findChannelThumb(card) };
}

function extractLockup(card: HTMLElement): ScrapedCard | null {
  const titleEl = card.querySelector('h3.ytLockupMetadataViewModelHeadingReset, h3 a, h3');
  const title =
    titleEl?.getAttribute('title') ||
    titleEl?.getAttribute('aria-label') ||
    titleEl?.textContent?.trim() ||
    '';
  const videoId = findVideoId(card);
  if (!title || !videoId) return null;
  const ch = findChannel(card);
  return { card, videoId, title: title.trim(), channel: ch.name, channelKey: ch.key, channelThumb: findChannelThumb(card) };
}

export function extractCard(card: HTMLElement): ScrapedCard | null {
  const tag = card.tagName.toLowerCase();
  if (tag === OLD_CARD_SELECTOR) return extractOld(card);
  if (tag === NEW_CARD_SELECTOR) return extractLockup(card);
  return null;
}

export function getThumbAnchor(card: HTMLElement): HTMLElement {
  return (
    (card.querySelector('ytd-thumbnail') as HTMLElement) ||
    (card.querySelector('yt-thumbnail-view-model') as HTMLElement) ||
    (card.querySelector('.ytThumbnailViewModelHost') as HTMLElement) ||
    (card.querySelector('a#thumbnail') as HTMLElement) ||
    (card.querySelector('a[href*="watch?v="]') as HTMLElement) ||
    card
  );
}

export interface WatchVideo {
  videoId: string;
  title: string;
  channel: string | null;
  channelKey: string | null;
}

/** The video currently playing on a /watch page. */
export function getWatchVideo(): WatchVideo | null {
  let u: URL;
  try {
    u = new URL(location.href);
  } catch {
    return null;
  }
  if (u.pathname !== '/watch') return null;
  const videoId = u.searchParams.get('v');
  if (!videoId) return null;

  const titleEl = document.querySelector(
    'ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata, #title h1, h1.title yt-formatted-string',
  );
  let title = titleEl?.textContent?.trim() || '';
  if (!title) title = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
  if (!title) return null;

  const ownerLink = document.querySelector(
    'ytd-video-owner-renderer a[href], #owner #channel-name a[href], #upload-info a[href]',
  ) as HTMLAnchorElement | null;
  const channelKey = channelKeyFromHref(ownerLink?.getAttribute('href'));
  const channel =
    ownerLink?.textContent?.trim() ||
    document.querySelector('ytd-video-owner-renderer #channel-name')?.textContent?.trim() ||
    null;

  return { videoId, title, channel, channelKey: channelKey ?? (channel ? 'name:' + channel.toLowerCase() : null) };
}

export function getPlayer(): { player: HTMLElement; video: HTMLVideoElement } | null {
  const player =
    (document.querySelector('#movie_player') as HTMLElement) ||
    (document.querySelector('.html5-video-player') as HTMLElement);
  const video = document.querySelector('video.html5-main-video, #movie_player video') as HTMLVideoElement | null;
  if (!player || !video) return null;
  return { player, video };
}
