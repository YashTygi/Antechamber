import { useState } from 'react';
import type { UserProfile } from '@/lib/types';
import { useSettings, useStats } from './hooks';
import { NavBar, Toggle } from './ui';
import { BrandMark } from './icons';
import { Today } from './Today';
import { Library } from './Library';
import { SettingsView } from './SettingsView';

type Tab = 'today' | 'library' | 'settings';

export function Dashboard({ profile, onReset }: { profile: UserProfile; onReset: () => void }) {
  const [tab, setTab] = useState<Tab>('today');
  const [settings, patch] = useSettings();
  const stats = useStats();

  return (
    <div>
      <header className="yti-head">
        <div className="yti-brand">
          <BrandMark />
          <span className="yti-wordmark">
            yt<span className="dot">·</span>intent
          </span>
        </div>
        <div className="yti-head-right">
          <span className="yti-label" style={{ color: settings.enabled ? 'var(--good)' : 'var(--ink-faint)' }}>
            {settings.enabled ? 'ON' : 'OFF'}
          </span>
          <Toggle checked={settings.enabled} onChange={(v) => patch({ enabled: v })} />
        </div>
      </header>

      <NavBar
        items={[
          { value: 'today', label: 'Today' },
          { value: 'library', label: 'Library' },
          { value: 'settings', label: 'Settings' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="yti-body">
        {tab === 'today' && (
          <Today
            stats={stats}
            enabled={settings.enabled}
            gamification={settings.gamificationEnabled}
            onResume={() => patch({ enabled: true })}
          />
        )}
        {tab === 'library' && <Library profile={profile} />}
        {tab === 'settings' && <SettingsView profile={profile} settings={settings} patch={patch} onReset={onReset} />}
      </div>
    </div>
  );
}
