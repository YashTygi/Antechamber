import { useState, type ReactNode } from 'react';

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={'yti-toggle' + (checked ? ' on' : '')}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="yti-toggle-knob" />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="yti-seg" role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={'yti-seg-btn' + (o.value === value ? ' active' : '')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="yti-row">
      <div className="yti-row-text">
        <div className="yti-row-title">{title}</div>
        {desc && <div className="yti-row-desc">{desc}</div>}
      </div>
      <div className="yti-row-control">{children}</div>
    </div>
  );
}

export function NavBar<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <nav className="yti-nav">
      {items.map((i) => (
        <button
          type="button"
          key={i.value}
          className={'yti-nav-item' + (i.value === value ? ' active' : '')}
          aria-current={i.value === value ? 'page' : undefined}
          onClick={() => onChange(i.value)}
        >
          {i.label}
        </button>
      ))}
    </nav>
  );
}

export function ChipInput({
  items,
  onChange,
  placeholder,
  tone = 'good',
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  tone?: 'good' | 'bad';
}) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const t = raw.trim();
    setDraft('');
    if (!t || items.some((i) => i.toLowerCase() === t.toLowerCase())) return;
    onChange([...items, t]);
  };
  return (
    <div className={'yti-chips yti-chips-' + tone}>
      {items.map((it, i) => (
        <span className="yti-chip" key={it + i}>
          {it}
          <button type="button" aria-label={`remove ${it}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="yti-chip-input"
        value={draft}
        placeholder={items.length ? 'Add another…' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && items.length) {
            onChange(items.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
      />
    </div>
  );
}
