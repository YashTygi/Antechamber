import { useEffect, useMemo, useState } from 'react';
import type {
  UserProfile,
  ExampleItem,
  Settings,
  Sensitivity,
  Label,
  VideoSample,
  ChannelSample,
  CalibrateResponse,
  ChannelRating,
  VideoRating,
} from '@/lib/types';
import { PRESET_ROLES, DEFAULT_SETTINGS } from '@/lib/defaults';
import { ChipInput, Segmented, Row, Toggle } from './ui';
import { Icon, BrandMark } from './icons';
import { scanCluster, calibrate, commitOnboarding } from './scan';

const STEPS = ['Welcome', 'Videos', 'Channels', 'Interests', 'Topics', 'Finish'];
const dedupe = (a: string[]) => [...new Set(a.map((s) => s.trim()).filter(Boolean))];
const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

type VideoMark = { title: string; label: Label; channelKey: string | null; channelName: string | null };

/** Channel/creator avatar with a monogram fallback when there's no image. */
function Avatar({ src, name, size = 28 }: { src?: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  if (src && !broken) {
    return (
      <img
        className="yti-avatar"
        src={src}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="yti-avatar yti-avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial}
    </span>
  );
}

export function Onboarding({ onDone }: { onDone: (p: UserProfile) => void }) {
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [productive, setProductive] = useState<string[]>([]);
  const [unproductive, setUnproductive] = useState<string[]>([]);

  const [sensitivity, setSensitivity] = useState<Sensitivity>('balanced');
  const [delaySeconds, setDelaySeconds] = useState<2 | 5 | 10>(5);
  const [requireReason, setRequireReason] = useState(false);
  const [blockShorts, setBlockShorts] = useState(true);
  const [apiKey, setApiKey] = useState('');

  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [videos, setVideos] = useState<VideoSample[]>([]);
  const [channels, setChannels] = useState<ChannelSample[]>([]);
  const [sampleTitles, setSampleTitles] = useState<string[]>([]);
  const [videoMarks, setVideoMarks] = useState<Record<string, VideoMark>>({});
  const [channelMarks, setChannelMarks] = useState<Record<string, { name: string; label: Label }>>({});
  const [calib, setCalib] = useState<CalibrateResponse | null>(null);
  const [calibrating, setCalibrating] = useState(false);

  const ratedProd = () => dedupe(Object.values(videoMarks).filter((v) => v.label === 'productive').map((v) => v.title));
  const ratedUnprod = () => dedupe(Object.values(videoMarks).filter((v) => v.label === 'unproductive').map((v) => v.title));
  const prodTexts = () => dedupe([...interests, ...productive, ...ratedProd()]);
  const unprodTexts = () => dedupe([...unproductive, ...ratedUnprod()]);

  const requiredVideos = Math.min(10, videos.length);
  const requiredChannels = Math.min(6, channels.length);
  const ratedVideos = Object.keys(videoMarks).length;
  const ratedChannels = Object.keys(channelMarks).length;

  const startScan = () => {
    setScanState('scanning');
    setVideos([]);
    setChannels([]);
    setSampleTitles([]);
    setVideoMarks({});
    setChannelMarks({});
    setCalib(null);
    scanCluster().then((r) => {
      setVideos(r.videos);
      setChannels(r.channels);
      setSampleTitles(r.sampleTitles);
      setScanState('done');
    });
  };

  // Videos is the first real step — kick off the scan automatically on arrival.
  useEffect(() => {
    if (step === 1 && scanState === 'idle') startScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Calibrate once we reach Finish, from the keywords + ratings + scraped titles.
  useEffect(() => {
    if (step !== 5 || calibrating || calib) return;
    const prod = prodTexts();
    const unprod = unprodTexts();
    if (!prod.length && !unprod.length) return;
    setCalibrating(true);
    calibrate(prod, unprod, sampleTitles)
      .then(setCalib)
      .finally(() => setCalibrating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, calibrating, calib]);

  const addPreset = (id: string) => {
    const r = PRESET_ROLES.find((x) => x.id === id);
    if (!r) return;
    if (!interests.includes(r.label)) setInterests([...interests, r.label]);
    setProductive((p) => dedupe([...p, ...r.productive]));
    setUnproductive((u) => dedupe([...u, ...r.unproductive]));
    setCalib(null);
  };

  const markVideo = (v: VideoSample, label: Label) => {
    setVideoMarks((m) => {
      // clicking the active label again clears it
      if (m[v.videoId]?.label === label) {
        const next = { ...m };
        delete next[v.videoId];
        return next;
      }
      return { ...m, [v.videoId]: { title: v.title, label, channelKey: v.channelKey, channelName: v.channel } };
    });
    setCalib(null);
  };
  const markChannel = (key: string, name: string, label: Label) => setChannelMarks((m) => ({ ...m, [key]: { name, label } }));

  const canProceed =
    step === 1
      ? scanState === 'done' && ratedVideos >= requiredVideos
      : step === 2
        ? ratedChannels >= requiredChannels
        : step === 3
          ? interests.length > 0
          : step === 4
            ? unproductive.length > 0
            : true;

  const next = () => {
    if (step < 5) setStep(step + 1);
    else void finish();
  };

  const finish = async () => {
    const now = Date.now();
    const mk = (text: string): ExampleItem => ({ id: crypto.randomUUID(), text, source: 'onboarding', createdAt: now });
    const profile: UserProfile = {
      role: 'custom',
      roleLabel: interests.join(', ') || 'Custom',
      productiveExamples: prodTexts().map(mk),
      unproductiveExamples: unprodTexts().map(mk),
      createdAt: now,
      updatedAt: now,
    };
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      sensitivity,
      delaySeconds,
      requireReason,
      blockShorts,
      frictionOn: ['unproductive'],
      youtubeApiKey: apiKey.trim(),
    };
    const channelRatings: ChannelRating[] = Object.entries(channelMarks).map(([key, v]) => ({ key, name: v.name, label: v.label }));
    const videoRatings: VideoRating[] = Object.entries(videoMarks).map(([videoId, v]) => ({
      videoId,
      title: v.title,
      label: v.label,
      channelKey: v.channelKey,
      channelName: v.channelName,
    }));
    await commitOnboarding({ profile, settings, channelRatings, videoRatings });
    onDone(profile);
  };

  const pct = Math.round((step / (STEPS.length - 1)) * 100);

  return (
    <div className="yti-ob">
      <div className="yti-ob-top">
        <div className="yti-ob-step">Set up · step {step + 1} of {STEPS.length}</div>
        <div className="yti-ob-bar"><div className="yti-ob-bar-fill" style={{ width: pct + '%' }} /></div>
      </div>

      <div className="yti-ob-body">
        {step === 0 && (
          <div className="yti-ob-hero">
            <BrandMark size={42} />
            <h1>Watch with intent</h1>
            <p>
              YouTube is built to keep you scrolling. This adds a pause before distractions, rewards focus, and learns
              what you care about from your real homepage.
            </p>
            <ul className="yti-ob-points">
              <li><span className="ic"><Icon name="check" /></span> Every video &amp; channel gets tagged</li>
              <li><span className="ic"><Icon name="x" /></span> Distractions hit a gate before they play</li>
              <li><span className="ic"><Icon name="refresh" /></span> It adapts to your corrections over time</li>
            </ul>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="yti-ob-title">Rate videos from your homepage</h2>
            {scanState === 'scanning' ? (
              <div className="yti-scan-state"><div className="yti-spin" /><p className="yti-ob-sub">Opening your YouTube homepage, reading it, and sorting it into topics… a tab opens briefly and returns here.</p></div>
            ) : videos.length === 0 ? (
              <div className="yti-scan-state">
                <p className="yti-ob-sub">Couldn't read your homepage. Sign into YouTube and try again, or continue and it'll learn as you browse.</p>
                <button type="button" className="yti-btn yti-btn-ghost" onClick={startScan}>Try again</button>
              </div>
            ) : (
              <>
                <p className="yti-ob-sub">A mix from every kind of video on your feed. Mark <strong>{requiredVideos}</strong>+ — rated {ratedVideos}.</p>
                <div className="yti-vid-list">
                  {videos.map((v) => {
                    const cur = videoMarks[v.videoId]?.label;
                    return (
                      <div className={'yti-vid-card' + (cur ? ' rated-' + cur : '')} key={v.videoId}>
                        <img className="yti-vid-thumb" src={thumbUrl(v.videoId)} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        <div className="yti-vid-main">
                          <div className="yti-vid-title" title={v.title}>{v.title}</div>
                          {v.channel && (
                            <div className="yti-vid-chan">
                              <Avatar src={v.channelThumb} name={v.channel} size={16} />
                              <span>{v.channel}</span>
                            </div>
                          )}
                          <div className="yti-vid-acts">
                            <button type="button" className={'yti-mini bad' + (cur === 'unproductive' ? ' on' : '')} onClick={() => markVideo(v, 'unproductive')}><Icon name="x" size={13} />Distraction</button>
                            <button type="button" className={'yti-mini good' + (cur === 'productive' ? ' on' : '')} onClick={() => markVideo(v, 'productive')}><Icon name="check" size={13} />Productive</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="yti-ob-title">Mark some channels</h2>
            {channels.length === 0 ? (
              <div className="yti-scan-state"><p className="yti-ob-sub">No channels to mark — continue ahead.</p></div>
            ) : (
              <>
                <p className="yti-ob-sub">Mark <strong>{requiredChannels}</strong>+ — marked {ratedChannels}. A labeled channel applies to all its videos.</p>
                <div className="yti-chan-list">
                  {channels.map((c) => {
                    const cur = channelMarks[c.key]?.label;
                    return (
                      <div className="yti-chan-row" key={c.key}>
                        <Avatar src={c.thumb} name={c.name} size={32} />
                        <div className="yti-chan-info">
                          <span className="yti-chan-name">{c.name}</span>
                          <span className="yti-chan-meta">{c.count} on your homepage</span>
                        </div>
                        <div className="yti-chan-opts">
                          <button type="button" className={'yti-chan-opt good' + (cur === 'productive' ? ' on' : '')} aria-label="Productive" onClick={() => markChannel(c.key, c.name, 'productive')}><Icon name="check" size={14} /></button>
                          <button type="button" className={'yti-chan-opt neutral' + (cur === 'neutral' ? ' on' : '')} aria-label="Neutral" onClick={() => markChannel(c.key, c.name, 'neutral')}><span className="yti-dot" style={{ background: 'currentColor' }} /></button>
                          <button type="button" className={'yti-chan-opt bad' + (cur === 'unproductive' ? ' on' : '')} aria-label="Distraction" onClick={() => markChannel(c.key, c.name, 'unproductive')}><Icon name="x" size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="yti-ob-title">What are you into?</h2>
            <p className="yti-ob-sub">Your work and your hobbies — add as many as you like (developer, economics, fitness…).</p>
            <ChipInput items={interests} onChange={setInterests} placeholder="e.g. software developer" tone="good" />
            <p className="yti-ob-hint">Quick add (also fills example topics):</p>
            <div className="yti-occ-presets">
              {PRESET_ROLES.filter((r) => r.id !== 'custom').map((r) => (
                <button type="button" key={r.id} className={'yti-occ-chip' + (interests.includes(r.label) ? ' active' : '')} onClick={() => addPreset(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="yti-ob-title">Topics worth your time — and not</h2>
            <p className="yti-ob-sub">Your interests already count as productive. Add specific topics and the rabbit holes to gate.</p>
            <div className="yti-cols">
              <div>
                <div className="yti-field-label yti-accent-good">Productive</div>
                <ChipInput items={productive} onChange={(v) => { setProductive(v); setCalib(null); }} placeholder="e.g. system design" tone="good" />
              </div>
              <div>
                <div className="yti-field-label yti-accent-bad">Distraction</div>
                <ChipInput items={unproductive} onChange={(v) => { setUnproductive(v); setCalib(null); }} placeholder="e.g. drama, pranks" tone="bad" />
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 className="yti-ob-title">Calibrated — tune &amp; finish</h2>
            {calibrating ? (
              <div className="yti-scan-state"><div className="yti-spin" /><p className="yti-ob-sub">Analyzing your topics, ratings &amp; homepage…</p></div>
            ) : calib && sampleTitles.length ? (
              <div style={{ marginBottom: 18 }}>
                <p className="yti-ob-sub" style={{ marginBottom: 10 }}>Tuned to <strong>{sampleTitles.length}</strong> of your homepage videos.</p>
                <div className="yti-calib-counts">
                  <span className="yti-cc good">{calib.counts.productive} productive</span>
                  <span className="yti-cc bad">{calib.counts.unproductive} distractions</span>
                  <span className="yti-cc neutral">{calib.counts.neutral} neutral</span>
                </div>
                <p className="yti-ob-hint">Fix any mislabel with one click while you browse — it learns.</p>
              </div>
            ) : null}

            <div className="yti-field">
              <div className="yti-field-label">Sensitivity</div>
              <Segmented value={sensitivity} onChange={setSensitivity} options={[{ value: 'lenient', label: 'Lenient' }, { value: 'balanced', label: 'Balanced' }, { value: 'strict', label: 'Strict' }]} />
            </div>
            <div className="yti-field">
              <div className="yti-field-label">Friction delay</div>
              <Segmented value={delaySeconds} onChange={setDelaySeconds} options={[{ value: 2, label: '2s' }, { value: 5, label: '5s' }, { value: 10, label: '10s' }]} />
            </div>
            <Row title="Require a reason" desc="Type why before you can push through"><Toggle checked={requireReason} onChange={setRequireReason} /></Row>
            <Row title="Hide Shorts" desc="Strip Shorts shelves from feeds"><Toggle checked={blockShorts} onChange={setBlockShorts} /></Row>
            <div className="yti-field" style={{ marginTop: 16 }}>
              <div className="yti-field-label">YouTube API key (optional)</div>
              <input className="yti-text-input" value={apiKey} spellCheck={false} placeholder="Paste a key to boost accuracy" onChange={(e) => setApiKey(e.target.value)} />
              <p className="yti-ob-hint">Adds category, tags &amp; description (sends video IDs to Google). Blank = 100% local.</p>
            </div>
          </div>
        )}
      </div>

      <div className="yti-ob-footer">
        {step > 0 && <button type="button" className="yti-btn yti-btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
        <button type="button" className="yti-btn yti-btn-primary" disabled={!canProceed} onClick={next}>
          {step === 0 ? 'Get started' : step === 5 ? 'Start focusing' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
