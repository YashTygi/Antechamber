import { useState } from 'react';
import type { UserProfile, Settings, Sensitivity, BadgeStyle } from '@/lib/types';
import { profileItem, bumpVectors, resetStats } from '@/lib/storage';
import { Segmented, Row, Toggle } from './ui';
import { recalibrateAll } from './scan';

export function SettingsView({
  profile,
  settings,
  patch,
  onReset,
}: {
  profile: UserProfile;
  settings: Settings;
  patch: (p: Partial<Settings>) => void;
  onReset: () => void;
}) {
  const [recal, setRecal] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [apiDraft, setApiDraft] = useState(settings.youtubeApiKey);

  const setSensitivity = (s: Sensitivity) => {
    patch({ sensitivity: s });
    void bumpVectors();
  };
  const gateNeutral = settings.frictionOn.includes('neutral');

  const recalibrate = async () => {
    setRecal('running');
    // The SW owns scan+calibrate+bump end-to-end, so recalibration completes
    // even if focusing the YouTube tab destroys this popup. The result only
    // comes back if the popup survived (scan reused a rendered homepage tab).
    const res = await recalibrateAll();
    setRecal(res ? 'done' : 'failed');
    setTimeout(() => setRecal('idle'), 2500);
  };

  const redo = async () => {
    await profileItem.setValue(null);
    onReset();
  };

  return (
    <div>
      <div className="yti-group">
        <div className="yti-group-label">Detection</div>
        <div className="yti-field">
          <div className="yti-field-label">Sensitivity</div>
          <Segmented
            value={settings.sensitivity}
            onChange={setSensitivity}
            options={[{ value: 'lenient', label: 'Lenient' }, { value: 'balanced', label: 'Balanced' }, { value: 'strict', label: 'Strict' }]}
          />
        </div>
        <button type="button" className="yti-btn yti-btn-ghost yti-btn-block" disabled={recal === 'running'} onClick={recalibrate}>
          {recal === 'running' ? 'Scanning homepage…' : recal === 'done' ? 'Recalibrated' : recal === 'failed' ? 'Couldn’t scan — try again' : 'Recalibrate from homepage'}
        </button>
      </div>

      <div className="yti-group">
        <div className="yti-group-label">Friction</div>
        <div className="yti-field">
          <div className="yti-field-label">Delay</div>
          <Segmented
            value={settings.delaySeconds}
            onChange={(v) => patch({ delaySeconds: v })}
            options={[{ value: 2, label: '2s' }, { value: 5, label: '5s' }, { value: 10, label: '10s' }]}
          />
        </div>
        <Row title="Require a reason" desc="Type why before pushing through">
          <Toggle checked={settings.requireReason} onChange={(v) => patch({ requireReason: v })} />
        </Row>
        <Row title="Ask on uncertain" desc="Prompt to label neutral videos">
          <Toggle checked={settings.askOnNeutral} onChange={(v) => patch({ askOnNeutral: v })} />
        </Row>
        <Row title="Gate uncertain" desc="Also gate neutral videos">
          <Toggle checked={gateNeutral} onChange={(v) => patch({ frictionOn: v ? ['unproductive', 'neutral'] : ['unproductive'] })} />
        </Row>
      </div>

      <div className="yti-group">
        <div className="yti-group-label">Display</div>
        <Row title="Show badges" desc="Tag videos in feeds">
          <Toggle checked={settings.showBadges} onChange={(v) => patch({ showBadges: v })} />
        </Row>
        <div className="yti-field" style={{ marginTop: 11 }}>
          <div className="yti-field-label">Badge style</div>
          <Segmented
            value={settings.badgeStyle}
            onChange={(v) => patch({ badgeStyle: v as BadgeStyle })}
            options={[{ value: 'icon_text', label: 'Icon + text' }, { value: 'icon', label: 'Icon only' }]}
          />
        </div>
        <Row title="Gamification" desc="Points, levels & streaks">
          <Toggle checked={settings.gamificationEnabled} onChange={(v) => patch({ gamificationEnabled: v })} />
        </Row>
      </div>

      <div className="yti-group">
        <div className="yti-group-label">Data</div>
        <div className="yti-field">
          <div className="yti-field-label">YouTube API key</div>
          <input
            className="yti-text-input"
            value={apiDraft}
            spellCheck={false}
            placeholder="Paste to boost accuracy"
            onChange={(e) => setApiDraft(e.target.value)}
            onBlur={() => {
              if (apiDraft.trim() !== settings.youtubeApiKey) patch({ youtubeApiKey: apiDraft.trim() });
            }}
          />
          <p className="yti-ob-hint">
            {settings.youtubeApiKey
              ? 'Using YouTube API + local embeddings.'
              : 'Using local only. A key adds category, tags & description; sends video IDs to Google.'}
          </p>
        </div>
        <div className="yti-danger">
          <button type="button" className="yti-btn yti-btn-ghost yti-btn-block" onClick={redo}>
            Redo onboarding
          </button>
          <button
            type="button"
            className="yti-btn yti-btn-danger yti-btn-block"
            onClick={() => {
              if (confirm('Reset all points, streaks and stats?')) void resetStats();
            }}
          >
            Reset stats
          </button>
        </div>
      </div>
    </div>
  );
}
