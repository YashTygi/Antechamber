import type { Stats, DailyStat, GameEventType } from './types';
import { POINTS } from './defaults';

export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function emptyDaily(): DailyStat {
  return {
    productiveOpened: 0,
    unproductiveOpened: 0,
    frictionShown: 0,
    backedOff: 0,
    watchedAnyway: 0,
    points: 0,
  };
}

/** level n starts at 50·(n-1)² points → a gently steepening curve */
export function levelForPoints(points: number): number {
  return Math.floor(Math.sqrt(Math.max(0, points) / 50)) + 1;
}

export function pointsForLevel(level: number): number {
  return 50 * (level - 1) * (level - 1);
}

export function levelProgress(points: number): {
  level: number;
  into: number;
  span: number;
  nextAt: number;
} {
  const level = levelForPoints(points);
  const floor = pointsForLevel(level);
  const nextAt = pointsForLevel(level + 1);
  return { level, into: points - floor, span: nextAt - floor, nextAt };
}

/** a day counts toward a streak if the user watched something productive and
 *  backed off at least as often as they pushed through */
function dayQualifies(d: DailyStat): boolean {
  return d.productiveOpened >= 1 && d.backedOff >= d.watchedAnyway;
}

function prevDay(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return todayStr(dt);
}

/** walk backwards from today while each day qualifies */
function recomputeStreak(stats: Stats, today: string): number {
  let streak = 0;
  let cursor = today;
  while (stats.daily[cursor] && dayQualifies(stats.daily[cursor])) {
    streak++;
    cursor = prevDay(cursor);
  }
  return streak;
}

/** Pure reducer: given current stats + an event, return the next stats. */
export function applyEvent(stats: Stats, event: GameEventType): { stats: Stats; pointsDelta: number } {
  const today = todayStr();
  const next: Stats = structuredClone(stats);
  if (!next.daily[today]) next.daily[today] = emptyDaily();
  const day = next.daily[today];

  day[event] += 1;
  next.lifetime[event] += 1;

  const delta = POINTS[event] ?? 0;
  next.points += delta;
  day.points += delta;

  next.level = levelForPoints(next.points);
  next.lastActiveDay = today;
  next.currentStreakDays = recomputeStreak(next, today);
  if (next.currentStreakDays > next.longestStreakDays) {
    next.longestStreakDays = next.currentStreakDays;
  }

  // keep storage bounded — retain the most recent ~120 days
  const keys = Object.keys(next.daily).sort();
  if (keys.length > 120) {
    for (const k of keys.slice(0, keys.length - 120)) delete next.daily[k];
  }

  return { stats: next, pointsDelta: delta };
}
