import type { ChannelEntry, Label } from './types';
import { CHANNEL_MIN_VIDEOS, CHANNEL_AGREEMENT } from './defaults';

export function emptyChannel(key: string, name: string): ChannelEntry {
  return { key, name, p: 0, u: 0, n: 0, label: null, manual: false, updatedAt: Date.now() };
}

/** Auto-label from tallies. Manual labels are authoritative and never changed. */
export function autoLabel(ch: ChannelEntry): Label | null {
  if (ch.manual) return ch.label;
  const decided = ch.p + ch.u;
  if (decided < CHANNEL_MIN_VIDEOS) return null;
  if (ch.p / decided >= CHANNEL_AGREEMENT) return 'productive';
  if (ch.u / decided >= CHANNEL_AGREEMENT) return 'unproductive';
  return null;
}

/** Add one labeled video to the channel's tally and recompute its auto-label. */
export function tally(ch: ChannelEntry, label: Label): ChannelEntry {
  const next: ChannelEntry = { ...ch, updatedAt: Date.now() };
  if (label === 'productive') next.p++;
  else if (label === 'unproductive') next.u++;
  else next.n++;
  if (!next.manual) next.label = autoLabel(next);
  return next;
}

/** User sets a channel label explicitly (sticks). `null` clears back to auto. */
export function setManual(ch: ChannelEntry, label: Label | null): ChannelEntry {
  const next: ChannelEntry = { ...ch, updatedAt: Date.now() };
  if (label === null) {
    next.manual = false;
    next.label = autoLabel(next);
  } else {
    next.manual = true;
    next.label = label;
  }
  return next;
}

/** Only productive/unproductive channel labels short-circuit classification;
 *  a 'neutral' (or null) channel is still classified by content. */
export function channelShortcut(ch: ChannelEntry | undefined): Label | null {
  if (!ch || !ch.label) return null;
  return ch.label === 'productive' || ch.label === 'unproductive' ? ch.label : null;
}
