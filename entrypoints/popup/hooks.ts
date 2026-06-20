import { useEffect, useState } from 'react';
import type { Settings, Stats } from '@/lib/types';
import { DEFAULT_SETTINGS, DEFAULT_STATS } from '@/lib/defaults';
import { settingsItem, statsItem, getSettings, getStats } from '@/lib/storage';

/** Live-bound settings: reads once, follows cross-context changes, writes on patch. */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    getSettings().then(setSettings);
    const unwatch = settingsItem.watch((v) => setSettings({ ...DEFAULT_SETTINGS, ...v }));
    return () => unwatch();
  }, []);
  const patch = (p: Partial<Settings>) => {
    const next = { ...settings, ...p };
    setSettings(next);
    void settingsItem.setValue(next);
  };
  return [settings, patch];
}

/** Live-bound, read-only stats. */
export function useStats(): Stats {
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  useEffect(() => {
    getStats().then(setStats);
    const unwatch = statsItem.watch((v) => setStats({ ...DEFAULT_STATS, ...v }));
    return () => unwatch();
  }, []);
  return stats;
}
