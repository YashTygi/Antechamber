import { useEffect, useState } from 'react';
import type { UserProfile, ExampleItem, ChannelEntry, Label } from '@/lib/types';
import { profileItem, bumpVectors } from '@/lib/storage';
import { Segmented, ChipInput } from './ui';
import { getChannels, setChannelLabel } from './scan';
import { Icon } from './icons';

export function Library({ profile }: { profile: UserProfile }) {
  const [seg, setSeg] = useState<'topics' | 'channels'>('topics');
  return (
    <div>
      <div className="yti-field">
        <Segmented
          value={seg}
          onChange={setSeg}
          options={[{ value: 'topics', label: 'Topics' }, { value: 'channels', label: 'Channels' }]}
        />
      </div>
      {seg === 'topics' ? <Topics profile={profile} /> : <Channels />}
    </div>
  );
}

function Topics({ profile }: { profile: UserProfile }) {
  const [prod, setProd] = useState(profile.productiveExamples.map((e) => e.text));
  const [unprod, setUnprod] = useState(profile.unproductiveExamples.map((e) => e.text));
  const [saved, setSaved] = useState(false);
  const dirty =
    JSON.stringify(prod) !== JSON.stringify(profile.productiveExamples.map((e) => e.text)) ||
    JSON.stringify(unprod) !== JSON.stringify(profile.unproductiveExamples.map((e) => e.text));

  const save = async () => {
    const now = Date.now();
    const mk = (text: string): ExampleItem => ({ id: crypto.randomUUID(), text, source: 'manual', createdAt: now });
    await profileItem.setValue({ ...profile, productiveExamples: prod.map(mk), unproductiveExamples: unprod.map(mk), updatedAt: now });
    await bumpVectors();
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="yti-stack">
      <p className="yti-ob-hint" style={{ margin: '0 0 2px' }}>Editing topics retrains the detector instantly.</p>
      <div className="yti-field">
        <div className="yti-field-label yti-accent-good">Productive</div>
        <ChipInput items={prod} onChange={setProd} placeholder="Add a topic" tone="good" />
      </div>
      <div className="yti-field">
        <div className="yti-field-label yti-accent-bad">Distraction</div>
        <ChipInput items={unprod} onChange={setUnprod} placeholder="Add a topic" tone="bad" />
      </div>
      <button
        type="button"
        className="yti-btn yti-btn-primary yti-btn-block"
        disabled={!dirty || !prod.length || !unprod.length}
        onClick={save}
      >
        {saved ? 'Saved' : 'Save changes'}
      </button>
    </div>
  );
}

function Channels() {
  const [channels, setChannels] = useState<ChannelEntry[]>([]);
  const reload = () => getChannels().then(setChannels);
  useEffect(() => {
    void reload();
  }, []);

  const apply = async (c: ChannelEntry, label: Label) => {
    const next = c.manual && c.label === label ? null : label;
    await setChannelLabel(c.key, c.name, next);
    void reload();
  };

  const shown = channels.filter((c) => c.label || c.manual || c.p + c.u + c.n > 0);
  if (!shown.length) {
    return (
      <div className="yti-chan-empty">
        No channels learned yet. As you browse and rate videos, channels that lean productive or distracting show up
        here — and their videos get tagged automatically.
      </div>
    );
  }

  return (
    <div className="yti-chan-list">
      {shown.map((c) => (
        <div className="yti-chan-row" key={c.key}>
          <div style={{ overflow: 'hidden' }}>
            <div className="yti-chan-name">{c.name}</div>
            <div className="yti-chan-meta">
              {c.manual ? (
                'set by you'
              ) : c.label ? (
                'auto'
              ) : (
                <span>
                  <span style={{ color: 'var(--good)' }}>{c.p}</span> · <span style={{ color: 'var(--bad)' }}>{c.u}</span>
                </span>
              )}
            </div>
          </div>
          <div className="yti-chan-opts">
            <button className={'yti-chan-opt good' + (c.label === 'productive' ? ' on' : '')} aria-label="Productive" onClick={() => apply(c, 'productive')}>
              <Icon name="check" size={14} />
            </button>
            <button className={'yti-chan-opt neutral' + (c.label === 'neutral' ? ' on' : '')} aria-label="Neutral" onClick={() => apply(c, 'neutral')}>
              <span className="yti-dot" style={{ background: 'currentColor' }} />
            </button>
            <button className={'yti-chan-opt bad' + (c.label === 'unproductive' ? ' on' : '')} aria-label="Distraction" onClick={() => apply(c, 'unproductive')}>
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
