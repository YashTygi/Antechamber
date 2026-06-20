import { browser } from 'wxt/browser';
import type {
  VideoSample,
  ScrapeSampleResponse,
  ScanClusterResponse,
  CalibrateResponse,
  OnboardingCommit,
  ChannelEntry,
  ChannelsResponse,
  RecentItem,
  RecentResponse,
  Label,
} from '@/lib/types';

/** Ask the background to open a hidden YouTube homepage tab and report the
 *  videos it sees. Returns [] if it can't (logged out, blocked, timeout). */
export async function scanHomepage(): Promise<VideoSample[]> {
  try {
    const res = (await browser.runtime.sendMessage({ type: 'scanHomepage' })) as ScrapeSampleResponse;
    return res?.samples ?? [];
  } catch {
    return [];
  }
}

/** Onboarding: scan the homepage, cluster videos by topic, and return a diverse
 *  set to rate + the channels seen + every title (for later calibration). */
export async function scanCluster(): Promise<ScanClusterResponse> {
  try {
    return (await browser.runtime.sendMessage({ type: 'scanCluster' })) as ScanClusterResponse;
  } catch {
    return { videos: [], channels: [], sampleTitles: [] };
  }
}

/** Embed keyword lists + sampled titles in the background, pick a floor, and
 *  preview how the homepage gets tagged. */
export async function calibrate(
  productive: string[],
  unproductive: string[],
  sampleTitles: string[],
): Promise<CalibrateResponse | null> {
  try {
    return (await browser.runtime.sendMessage({
      type: 'calibrate',
      productive,
      unproductive,
      sampleTitles,
    })) as CalibrateResponse;
  } catch {
    return null;
  }
}

/** Recalibrate from the popup. The SW owns the whole flow (scan + calibrate +
 *  bump) so it completes even though scanHomepage focuses a tab and destroys
 *  this popup mid-call. The returned preview only arrives if the popup happens
 *  to survive (i.e. an already-rendered homepage tab let the scan skip focus). */
export async function recalibrateAll(): Promise<CalibrateResponse | null> {
  try {
    return (await browser.runtime.sendMessage({ type: 'recalibrate' })) as CalibrateResponse;
  } catch {
    return null;
  }
}

/** Commit everything onboarding produced (profile, settings, channel + video
 *  ratings) atomically in the background. */
export async function commitOnboarding(commit: OnboardingCommit): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'commitOnboarding', commit });
  } catch {
    /* ignore */
  }
}

export async function getChannels(): Promise<ChannelEntry[]> {
  try {
    const res = (await browser.runtime.sendMessage({ type: 'getChannels' })) as ChannelsResponse;
    return res?.channels ?? [];
  } catch {
    return [];
  }
}

export async function setChannelLabel(key: string, name: string, label: Label | null): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'setChannelLabel', key, name, label });
  } catch {
    /* ignore */
  }
}

export async function getRecent(): Promise<RecentItem[]> {
  try {
    const res = (await browser.runtime.sendMessage({ type: 'getRecent' })) as RecentResponse;
    return res?.items ?? [];
  } catch {
    return [];
  }
}

export async function correctVideo(
  videoId: string,
  title: string,
  label: Label,
  channelKey?: string | null,
  channelName?: string | null,
): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'correct', videoId, title, label, channelKey, channelName });
  } catch {
    /* ignore */
  }
}
