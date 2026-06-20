import { PALETTE as P, FONT } from './tokens';

/** Styles injected into YouTube pages — the "Paper" system, built from the
 *  shared PALETTE so the on-page UI never drifts from the popup. */
export const CONTENT_CSS = `
.yti-badge{
  position:absolute; top:8px; left:8px; z-index:60;
  display:inline-flex; align-items:center; gap:4px;
  padding:3px 8px; border-radius:999px; border:1px solid;
  font-family:${FONT.sans}; font-size:11px; font-weight:500; line-height:1; white-space:nowrap;
}
.yti-badge svg{ width:13px; height:13px; }
.yti-productive{ background:${P.goodMid}; color:${P.good}; border-color:${P.goodBorder}; }
.yti-unproductive{ background:${P.badMid}; color:${P.bad}; border-color:${P.badBorder}; }

.yti-friction{
  position:absolute; inset:0; z-index:1000;
  display:flex; align-items:center; justify-content:center;
  font-family:${FONT.sans}; animation:yti-fade .25s ease;
}
.yti-friction-scrim{ position:absolute; inset:0; background:rgba(244,239,228,.62); }
.yti-friction-card{
  position:relative; width:min(440px,86%);
  background:${P.surface}; border:1px solid ${P.lineStrong}; border-radius:12px;
  padding:22px 22px 18px; color:${P.ink};
  box-shadow:0 18px 50px rgba(46,42,34,.22);
  animation:yti-pop .28s cubic-bezier(.2,.7,.2,1); outline:none;
}
.yti-friction-label{ font-family:${FONT.mono}; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:${P.reward}; }
.yti-friction-title{ font-size:19px; font-weight:500; margin:8px 0 5px; color:${P.ink}; }
.yti-friction-video{ font-size:12px; color:${P.inkDim}; margin:0 0 16px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.yti-friction-reason{
  width:100%; box-sizing:border-box; background:${P.bg}; border:1px solid ${P.line}; border-radius:6px;
  color:${P.ink}; padding:9px 11px; font-size:13px; resize:none; margin-bottom:14px; font-family:inherit;
}
.yti-friction-reason:focus{ outline:none; border-color:${P.lineStrong}; }
.yti-friction-actions{ display:flex; gap:10px; align-items:flex-end; }
.yti-fbtn{
  border:1px solid transparent; border-radius:6px; padding:9px 14px;
  font-size:13px; font-weight:500; cursor:pointer; font-family:inherit;
  display:inline-flex; align-items:center; gap:6px;
}
.yti-fbtn svg{ width:15px; height:15px; }
.yti-fbtn-back{ background:${P.goodSoft}; border-color:${P.goodBorder}; color:${P.good}; }
.yti-fbtn-watch-wrap{ flex:1; }
.yti-fbtn-watch{
  width:100%; display:flex; align-items:center; justify-content:space-between;
  background:transparent; border:none; color:${P.inkDim}; font-size:13px; font-family:inherit;
  cursor:pointer; padding:9px 2px 7px;
}
.yti-fbtn-watch[disabled]{ cursor:not-allowed; }
.yti-watch-count{ font-family:${FONT.mono}; }
.yti-depletion{ height:2px; background:${P.line}; border-radius:2px; overflow:hidden; }
.yti-depletion-fill{ height:2px; width:0%; background:${P.rewardMid}; border-radius:2px; transition:width 1s linear; }
.yti-friction-wrong{ display:block; margin:12px auto 0; border:none; background:transparent; color:${P.inkFaint}; font-size:12px; cursor:pointer; font-family:inherit; }
.yti-friction-wrong:hover{ color:${P.ink}; }

.yti-verdict{
  position:fixed; inset-inline-end:18px; bottom:18px; z-index:2147483500; width:264px;
  background:${P.surface}; color:${P.ink}; border:1px solid ${P.lineStrong}; border-radius:10px;
  padding:12px 14px; font-family:${FONT.sans}; box-shadow:0 10px 34px rgba(46,42,34,.18);
  animation:yti-rise .3s cubic-bezier(.2,.7,.2,1);
}
.yti-v-main{ display:flex; align-items:center; gap:8px; }
.yti-v-dot{ width:8px; height:8px; border-radius:50%; flex:none; background:${P.inkFaint}; }
.yti-v-productive .yti-v-dot{ background:${P.good}; }
.yti-v-unproductive .yti-v-dot{ background:${P.bad}; }
.yti-v-text{ flex:1; font-size:13px; font-weight:500; }
.yti-v-change{ border:1px solid ${P.line}; background:transparent; color:${P.inkDim}; font-size:11px; padding:4px 8px; border-radius:6px; cursor:pointer; font-family:inherit; }
.yti-v-change:hover{ border-color:${P.lineStrong}; }
.yti-v-x{ border:none; background:transparent; color:${P.inkFaint}; cursor:pointer; display:inline-flex; padding:2px; line-height:1; font-size:15px; }
.yti-v-x:hover{ color:${P.ink}; }
.yti-v-opts{ display:flex; gap:6px; margin-top:10px; }
.yti-v-opts[hidden]{ display:none; }
.yti-v-opt{
  flex:1; border:1px solid ${P.line}; border-radius:6px; padding:8px 6px;
  font-size:12px; font-weight:500; cursor:pointer; font-family:inherit;
  background:${P.surface2}; color:${P.ink}; display:inline-flex; align-items:center; justify-content:center; gap:5px;
}
.yti-v-opt svg{ width:14px; height:14px; }
.yti-v-opt.good:hover{ background:${P.goodSoft}; border-color:${P.goodBorder}; color:${P.good}; }
.yti-v-opt.bad:hover{ background:${P.badSoft}; border-color:${P.badBorder}; color:${P.bad}; }

.yti-toast-wrap{
  position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
  z-index:2147483600; display:flex; flex-direction:column; gap:8px; align-items:center; pointer-events:none;
}
.yti-toast{
  display:flex; align-items:center; gap:9px; padding:9px 15px; border-radius:999px;
  background:${P.surface}; color:${P.ink}; font-family:${FONT.sans}; font-size:13px;
  border:1px solid ${P.lineStrong}; box-shadow:0 8px 26px rgba(46,42,34,.16);
  animation:yti-rise .3s cubic-bezier(.2,.7,.2,1); transition:opacity .3s, transform .3s;
}
.yti-toast.reward{ background:${P.rewardSoft}; border-color:${P.rewardBorder}; }
.yti-toast-points{ font-family:${FONT.mono}; font-weight:500; color:${P.reward}; font-size:14px; }
.yti-toast.hide{ opacity:0; transform:translateY(8px); }

@keyframes yti-fade{ from{opacity:0} to{opacity:1} }
@keyframes yti-pop{ from{opacity:0; transform:scale(.97)} to{opacity:1; transform:scale(1)} }
@keyframes yti-rise{ from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:translateY(0)} }

@media (prefers-reduced-motion: reduce){
  .yti-friction, .yti-friction-card, .yti-verdict, .yti-toast{ animation:none !important; }
  .yti-depletion-fill{ transition:none !important; }
}
`;
