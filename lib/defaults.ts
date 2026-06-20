import type { Settings, Stats, Meta, Tuning, GameEventType, Sensitivity } from './types';

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

/** Default thresholds before calibration (calibrated values overwrite simFloor). */
export const DEFAULT_TUNING: Tuning = { simFloor: 0.2, marginBand: 0.08, calibratedAt: 0 };

/** sensitivity shifts the calibrated floor: higher floor → more neutral → less friction */
export const SENSITIVITY_OFFSET: Record<Sensitivity, number> = {
  lenient: 0.06,
  balanced: 0,
  strict: -0.06,
};

/** clamp range for the effective floor and for adaptive nudges */
export const FLOOR_MIN = 0.1;
export const FLOOR_MAX = 0.42;

/** cap example lists; with the incremental embedding cache this can be generous */
export const MAX_EXAMPLES = 300;

/** calibration aims for roughly this fraction of homepage videos to get a label */
export const CALIBRATION_LABELED_FRACTION = 0.55;

/** channel auto-labeling (Balanced preset): need this many known videos and
 *  this share agreeing on a class before the whole channel inherits a label. */
export const CHANNEL_MIN_VIDEOS = 3;
export const CHANNEL_AGREEMENT = 2 / 3;

/** LRU caps for the IndexedDB stores — bounds disk use as the user browses */
export const VIDEO_CACHE_MAX = 5000;
export const EMBED_CACHE_MAX = 4000;
export const API_CACHE_MAX = 6000;

/** points awarded per event. Backing off is rewarded — we reinforce the decision. */
export const POINTS: Record<GameEventType, number> = {
  productiveOpened: 10,
  unproductiveOpened: 0,
  frictionShown: 0,
  backedOff: 5,
  watchedAnyway: 0,
};

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  delaySeconds: 5,
  requireReason: false,
  blockShorts: true,
  frictionOn: ['unproductive'],
  sensitivity: 'balanced',
  showBadges: true,
  badgeStyle: 'icon_text',
  gamificationEnabled: true,
  askOnNeutral: true,
  youtubeApiKey: '',
};

export const DEFAULT_STATS: Stats = {
  points: 0,
  level: 1,
  currentStreakDays: 0,
  longestStreakDays: 0,
  lastActiveDay: '',
  daily: {},
  lifetime: {
    productiveOpened: 0,
    unproductiveOpened: 0,
    frictionShown: 0,
    backedOff: 0,
    watchedAnyway: 0,
  },
};

export const DEFAULT_META: Meta = {
  vectorsBuiltAt: 0,
  modelId: MODEL_ID,
  schemaVersion: 1,
};

export interface PresetRole {
  id: string;
  label: string;
  emoji: string;
  description: string;
  productive: string[];
  unproductive: string[];
}

/** Onboarding presets. Picking one pre-fills both example lists (editable). */
export const PRESET_ROLES: PresetRole[] = [
  {
    id: 'developer',
    label: 'Software Developer',
    emoji: '💻',
    description: 'Coding, system design, dev tools',
    productive: [
      'data structures and algorithms tutorial',
      'system design interview',
      'react hooks explained',
      'typescript best practices',
      'docker and kubernetes tutorial',
      'how databases work',
    ],
    unproductive: [
      'official music video',
      'funny moments compilation',
      'movie trailer',
      'celebrity gossip',
      'gaming highlights',
      'daily vlog',
    ],
  },
  {
    id: 'student',
    label: 'Student / Learner',
    emoji: '📚',
    description: 'Lectures, exam prep, study habits',
    productive: [
      'calculus explained step by step',
      'study with me pomodoro',
      'exam preparation strategy',
      'physics lecture',
      'effective note taking',
      'how to focus and avoid distractions',
    ],
    unproductive: [
      'official music video',
      'funny cat compilation',
      'movie trailer',
      'prank videos',
      'mukbang',
      'reaction video',
    ],
  },
  {
    id: 'medstudent',
    label: 'Medical Student',
    emoji: '🩺',
    description: 'Anatomy, boards, clinical cases',
    productive: [
      'anatomy lecture full',
      'usmle step 1 review',
      'pharmacology made easy',
      'clinical case discussion',
      'physiology explained',
      'ecg interpretation tutorial',
    ],
    unproductive: [
      'official music video',
      'funny moments',
      'movie trailer',
      'celebrity gossip',
      'gaming highlights',
      'reaction video',
    ],
  },
  {
    id: 'designer',
    label: 'Designer',
    emoji: '🎨',
    description: 'UI/UX, tools, design theory',
    productive: [
      'figma tutorial for beginners',
      'ui ux design principles',
      'building a design system',
      'typography fundamentals',
      'portfolio review and critique',
      'color theory for designers',
    ],
    unproductive: [
      'official music video',
      'funny moments compilation',
      'movie trailer',
      'celebrity drama',
      'gaming highlights',
      'reaction video',
    ],
  },
  {
    id: 'creator',
    label: 'Content Creator',
    emoji: '🎬',
    description: 'Editing, growth, storytelling',
    productive: [
      'video editing tutorial',
      'how to grow on youtube',
      'storytelling for video',
      'premiere pro tutorial',
      'thumbnail design tips',
      'lighting setup for video',
    ],
    unproductive: [
      'celebrity gossip',
      'funny fails compilation',
      'movie trailer',
      'drama channel commentary',
      'reaction video',
      'gaming highlights',
    ],
  },
  {
    id: 'finance',
    label: 'Finance / Business',
    emoji: '📈',
    description: 'Investing, markets, startups',
    productive: [
      'investing for beginners',
      'stock market analysis',
      'personal finance tips',
      'how to build a startup',
      'accounting basics explained',
      'reading financial statements',
    ],
    unproductive: [
      'official music video',
      'funny moments',
      'movie trailer',
      'celebrity gossip',
      'gaming highlights',
      'reaction video',
    ],
  },
  {
    id: 'fitness',
    label: 'Fitness / Health',
    emoji: '🏋️',
    description: 'Workouts, nutrition, wellness',
    productive: [
      'full body workout at home',
      'healthy meal prep for the week',
      'proper running form',
      'strength training program',
      'yoga for beginners',
      'science of building muscle',
    ],
    unproductive: [
      'official music video',
      'funny fails',
      'movie trailer',
      'celebrity gossip',
      'reaction video',
      'gaming highlights',
    ],
  },
  {
    id: 'custom',
    label: 'Something else',
    emoji: '✨',
    description: 'Start from scratch with your own topics',
    productive: [],
    unproductive: [],
  },
];
