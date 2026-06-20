/**
 * Antechamber — shared type definitions.
 * Text is canonical; vectors are a cache (re-embed from text if the model
 * changes — never persist only vectors).
 */

export type Label = 'productive' | 'unproductive' | 'neutral';
export type Sensitivity = 'lenient' | 'balanced' | 'strict';
export type ExampleSource = 'onboarding' | 'correction' | 'manual';
export type BadgeStyle = 'icon' | 'icon_text';

export interface ExampleItem {
  id: string;
  text: string;
  source: ExampleSource;
  fromVideoId?: string;
  createdAt: number;
}

export interface UserProfile {
  /** preset id (e.g. 'developer') or 'custom' */
  role: string;
  /** human-friendly label shown in the UI */
  roleLabel: string;
  roleDescription?: string;
  productiveExamples: ExampleItem[];
  unproductiveExamples: ExampleItem[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  /** master switch — when false the content script stays dormant */
  enabled: boolean;
  /** how long "Watch anyway" stays locked behind the friction gate */
  delaySeconds: 2 | 5 | 10;
  /** require the user to type a reason before they can push through */
  requireReason: boolean;
  /** strip Shorts shelves from feeds */
  blockShorts: boolean;
  /** which labels trigger the friction overlay on the watch page */
  frictionOn: Label[];
  /** nudges the calibrated floor up (lenient) or down (strict) */
  sensitivity: Sensitivity;
  showBadges: boolean;
  badgeStyle: BadgeStyle;
  gamificationEnabled: boolean;
  /** ask "productive or distraction?" on the watch page for neutral videos */
  askOnNeutral: boolean;
  /** optional YouTube Data API v3 key — enriches classification when present */
  youtubeApiKey: string;
}

/** Data-driven classification thresholds, calibrated from real titles and
 *  nudged over time by user corrections. The effective floor also factors in
 *  the sensitivity setting. */
export interface Tuning {
  simFloor: number;
  marginBand: number;
  calibratedAt: number;
}

export interface DailyStat {
  productiveOpened: number;
  unproductiveOpened: number;
  frictionShown: number;
  backedOff: number;
  watchedAnyway: number;
  points: number;
}

export interface LifetimeStat {
  productiveOpened: number;
  unproductiveOpened: number;
  frictionShown: number;
  backedOff: number;
  watchedAnyway: number;
}

export interface Stats {
  points: number;
  level: number;
  currentStreakDays: number;
  longestStreakDays: number;
  /** YYYY-MM-DD of the last day any event was recorded */
  lastActiveDay: string;
  daily: Record<string, DailyStat>;
  lifetime: LifetimeStat;
}

export interface Meta {
  /** bump (to Date.now()) to invalidate every cached classification */
  vectorsBuiltAt: number;
  modelId: string;
  schemaVersion: number;
}

export interface CachedClassification {
  label: Label;
  pSim: number;
  uSim: number;
  titleHash: string;
  vectorsBuiltAt: number;
  classifiedAt: number;
  channelKey?: string | null;
  /** how we got the label: 'channel' shortcut, content embedding, or user */
  source?: 'channel' | 'content' | 'user';
  /** last-used time for LRU eviction in IndexedDB */
  t?: number;
}

/** A YouTube channel: running tallies + an (auto or manual) label. When a
 *  channel is labeled productive/unproductive its videos skip embedding. */
export interface ChannelEntry {
  key: string;
  name: string;
  p: number;
  u: number;
  n: number;
  label: Label | null;
  /** true when the user set it — sticks, never overwritten by auto-labeling */
  manual: boolean;
  updatedAt: number;
}

/** Cached YouTube Data API metadata for one video. */
export interface ApiMeta {
  videoId: string;
  categoryId: string;
  categoryName: string;
  tags: string[];
  description: string;
  channelId: string;
  channelTitle: string;
  t: number;
}

/* ------------------------------- messaging ------------------------------ */

/** counters that gamification understands; also the keys on DailyStat/LifetimeStat */
export type GameEventType =
  | 'productiveOpened'
  | 'unproductiveOpened'
  | 'frictionShown'
  | 'backedOff'
  | 'watchedAnyway';

export interface ClassifyResult {
  label: Label;
  pSim: number;
  uSim: number;
}

export interface VideoSample {
  videoId: string;
  title: string;
  channel: string | null;
  channelKey: string | null;
  /** channel avatar URL scraped from the card (yt3.*), null if not in the DOM */
  channelThumb?: string | null;
}

/** A channel surfaced during onboarding, with avatar + how many of its videos
 *  appeared on the homepage. */
export interface ChannelSample {
  key: string;
  name: string;
  thumb: string | null;
  count: number;
}

export interface ClassifyItem {
  videoId: string;
  title: string;
  channelKey?: string | null;
  channelName?: string | null;
  /** 'watch' = the video the user actually opened (feeds the Recent list) */
  context?: 'watch' | 'feed';
}

/** A decision the extension recently made, surfaced on the Today screen. */
export interface RecentItem {
  videoId: string;
  title: string;
  label: Label;
  channel: string | null;
  t: number;
}

export type Message =
  | { type: 'classifyBatch'; items: ClassifyItem[] }
  | { type: 'recordEvent'; event: GameEventType; videoId?: string }
  | { type: 'scrapeSample' }
  | { type: 'scanHomepage' }
  | { type: 'scanCluster' }
  | { type: 'calibrate'; productive: string[]; unproductive: string[]; sampleTitles: string[] }
  | { type: 'recalibrate' }
  | { type: 'correct'; videoId: string; title: string; label: Label; channelKey?: string | null; channelName?: string | null }
  | { type: 'getChannels' }
  | { type: 'setChannelLabel'; key: string; name: string; label: Label | null }
  | { type: 'getRecent' }
  | { type: 'commitOnboarding'; commit: OnboardingCommit };

export interface ChannelRating {
  key: string;
  name: string;
  label: Label;
}

export interface VideoRating {
  videoId: string;
  title: string;
  label: Label;
  channelKey: string | null;
  channelName: string | null;
}

/** Everything onboarding produces, committed atomically in the background. */
export interface OnboardingCommit {
  profile: UserProfile;
  settings: Settings;
  channelRatings: ChannelRating[];
  videoRatings: VideoRating[];
}

export interface ClassifyBatchResponse {
  results: Record<string, ClassifyResult>;
}

export interface RecordEventResponse {
  stats: Stats;
  pointsDelta: number;
}

export interface ScrapeSampleResponse {
  samples: VideoSample[];
}

/** Homepage scan + topic clustering for onboarding: a diverse set of videos to
 *  rate (≤2 per detected topic cluster), the channels seen, and every scraped
 *  title (for calibration). */
export interface ScanClusterResponse {
  videos: VideoSample[];
  channels: ChannelSample[];
  sampleTitles: string[];
}

export interface CalibrateResponse {
  tuning: Tuning;
  counts: { productive: number; unproductive: number; neutral: number };
  preview: { title: string; label: Label }[];
}

export interface CorrectResponse {
  label: Label;
}

export interface ChannelsResponse {
  channels: ChannelEntry[];
}

export interface RecentResponse {
  items: RecentItem[];
}
