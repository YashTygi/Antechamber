/**
 * "Paper" — the single source of truth for the design palette.
 *
 * A warm, light, pastel system: cream surfaces, soft same-family tints with
 * deep readable text. Color is semantic only (productive / distraction /
 * reward); neutral has no hue.
 *
 * The popup mirrors these in `popup/style.css :root` (kept in sync, see the
 * note there). The injected on-page CSS is generated from PALETTE below so the
 * content script and popup never drift.
 */
export const PALETTE = {
  bg: '#F4EFE4',
  surface: '#FCF9F2',
  surface2: '#F0E9DB',
  line: 'rgba(62,54,40,.14)',
  lineStrong: 'rgba(62,54,40,.26)',
  ink: '#2E2A22',
  inkDim: '#6B6354',
  inkFaint: '#9A9282',

  good: '#2F6B49',
  goodSoft: '#DEEDDF',
  goodMid: '#C6E0C9',
  goodBorder: '#A9CBAE',

  bad: '#9C4A2B',
  badSoft: '#F4DFD2',
  badMid: '#EFCDB7',
  badBorder: '#DDB497',

  reward: '#8A6516',
  rewardSoft: '#F6E9CB',
  rewardMid: '#C99A3A',
  rewardBorder: '#E4CE97',

  sage: '#5E9A74',
  white: '#FFFFFF',
} as const;

export const RADIUS = { sm: '4px', md: '6px', lg: '10px' };
export const FONT = {
  sans: "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  mono: "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace",
};
