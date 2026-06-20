import { useEffect, useState } from 'react';
import type { Stats, RecentItem, Label } from '@/lib/types';
import { levelProgress, todayStr, emptyDaily } from '@/lib/gamification';
import { getRecent, correctVideo } from './scan';
import { Icon } from './icons';

function Stat({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <div>
      <div className="yti-stat-num" style={{ color: color ?? 'var(--ink)' }}>
        {String(n).padStart(2, '0')}
      </div>
      <div className="yti-label yti-stat-label">{label}</div>
    </div>
  );
}

export function Today({
  stats,
  enabled,
  gamification,
  onResume,
}: {
  stats: Stats;
  enabled: boolean;
  gamification: boolean;
  onResume: () => void;
}) {
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const loadRecent = () => getRecent().then(setRecent);
  useEffect(() => {
    void loadRecent();
  }, []);

  if (!enabled) {
    return (
      <div className="yti-paused">
        <div className="yti-paused-title">PAUSED</div>
        <div className="yti-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Not watching YouTube right now.</div>
        <button type="button" className="yti-btn yti-btn-primary" onClick={onResume}>
          Resume
        </button>
      </div>
    );
  }

  const today = stats.daily[todayStr()] ?? emptyDaily();
  const { level } = levelProgress(stats.points);
  const filled = Math.min(7, stats.currentStreakDays);

  const correct = async (r: RecentItem, label: Label) => {
    await correctVideo(r.videoId, r.title, label, null, r.channel);
    void loadRecent();
  };

  return (
    <div className="yti-stack">
      <div>
        <div className="yti-label" style={{ marginBottom: 12 }}>Today</div>
        <div className="yti-stats">
          <Stat n={today.productiveOpened} label="kept" color="var(--good)" />
          <Stat n={today.frictionShown} label="gated" />
          <Stat n={today.backedOff} label="backed" color="var(--good)" />
          <Stat n={today.watchedAnyway} label="pushed" color="var(--bad)" />
        </div>
        {gamification && (
          <>
            <hr className="yti-rule" />
            <div className="yti-streak">
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span className="yti-label">Streak</span>
                <span className="yti-ticks">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <span key={i} className={'yti-tick' + (i < filled ? '' : ' off')} />
                  ))}
                </span>
                <span className="yti-num" style={{ fontSize: 13 }}>{stats.currentStreakDays}d</span>
              </div>
              <span className="yti-points">{stats.points} pts · Lv {level}</span>
            </div>
          </>
        )}
      </div>

      <div>
        <div className="yti-label" style={{ marginBottom: 6 }}>Recent</div>
        {recent.length === 0 ? (
          <div className="yti-muted" style={{ fontSize: 12, padding: '10px 0', lineHeight: 1.5 }}>
            No decisions yet — open YouTube and it’ll start keeping track.
          </div>
        ) : (
          recent.slice(0, 6).map((r) => (
            <div className="yti-rec-row" key={r.videoId}>
              <span
                style={{
                  display: 'inline-flex',
                  color: r.label === 'productive' ? 'var(--good)' : r.label === 'unproductive' ? 'var(--bad)' : 'var(--ink-faint)',
                }}
              >
                {r.label === 'productive' ? <Icon name="check" /> : r.label === 'unproductive' ? <Icon name="x" /> : <span className="yti-dot" />}
              </span>
              <span className="yti-rec-title" title={r.title}>{r.title}</span>
              {r.label === 'neutral' ? (
                <span style={{ display: 'inline-flex', gap: 6 }}>
                  <button className="yti-rec-btn" aria-label="Mark productive" style={{ color: 'var(--good)' }} onClick={() => correct(r, 'productive')}>
                    <Icon name="check" size={14} />
                  </button>
                  <button className="yti-rec-btn" aria-label="Mark distraction" style={{ color: 'var(--bad)' }} onClick={() => correct(r, 'unproductive')}>
                    <Icon name="x" size={14} />
                  </button>
                </span>
              ) : (
                <button
                  className="yti-icon-btn"
                  aria-label="Change label"
                  title="Mark the other way"
                  onClick={() => correct(r, r.label === 'productive' ? 'unproductive' : 'productive')}
                >
                  <Icon name="undo" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div>
        <div className="yti-label" style={{ marginBottom: 6 }}>All time</div>
        <div className="yti-life-row"><span className="yti-muted">Productive opened</span><span className="yti-life-val">{stats.lifetime.productiveOpened}</span></div>
        <div className="yti-life-row"><span className="yti-muted">Backed off</span><span className="yti-life-val" style={{ color: 'var(--good)' }}>{stats.lifetime.backedOff}</span></div>
        <div className="yti-life-row"><span className="yti-muted">Pushed through</span><span className="yti-life-val">{stats.lifetime.watchedAnyway}</span></div>
      </div>
    </div>
  );
}
