import { css } from "lit";

// Every colour and the font are custom properties, so the card can take on any store's look:
//   intents-checkout { --anytill-font: inherit; --anytill-accent: #0F9D7A; --anytill-radius: 10px; }
export const styles = css`
  :host {
    --ink: var(--anytill-ink, #0a2540);
    --muted: var(--anytill-muted, #425466);
    --faint: var(--anytill-faint, #5b6b7d);
    --accent: var(--anytill-accent, #0f9d7a);
    --accent-ink: var(--anytill-accent-ink, #0b7a5f);
    --surface: var(--anytill-surface, #ffffff);
    --panel: var(--anytill-panel, #f6f9fc);
    --line: var(--anytill-border, #e3e8ee);
    --btn: var(--anytill-button, #0a2540);
    --btn-ink: var(--anytill-button-ink, #ffffff);
    --danger: #c0362c;
    --warn: #a35c00;
    --r: var(--anytill-radius, 10px);
    display: block;
    max-width: var(--anytill-width, 400px);
    font-family: var(--anytill-font, inherit);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .card {
    background: var(--surface);
    border-radius: calc(var(--r) + 2px);
    box-shadow: 0 0 0 1px var(--line), 0 30px 60px -30px rgba(10, 37, 64, 0.35), 0 18px 36px -18px rgba(10, 37, 64, 0.18);
    overflow: hidden;
  }
  .head { padding: 20px 22px 16px; border-bottom: 1px solid var(--line); }
  .merchant { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13.5px; color: var(--muted); font-weight: 500; }
  .pill { font-size: 11px; font-weight: 600; letter-spacing: 0.01em; color: var(--warn); background: #fff6e5; border: 1px solid #f3dcb2; border-radius: 99px; padding: 2px 8px; white-space: nowrap; }
  .amount { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .sub { font-size: 13px; color: var(--faint); margin-top: 2px; }
  .body { padding: 18px 22px 20px; display: grid; gap: 14px; }
  .foot { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12px; color: var(--faint); padding: 11px 16px; background: var(--panel); border-top: 1px solid var(--line); }
  .foot .i { width: 13px; height: 13px; }
  .i { width: 16px; height: 16px; flex: none; }
  .mono { font-family: var(--anytill-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace); }
  .label, legend { display: block; font-size: 12.5px; font-weight: 600; color: var(--muted); margin-bottom: 6px; padding: 0; }
  .muted { color: var(--muted); font-size: 13px; }
  .fine { font-size: 12px; color: var(--faint); margin: 0; line-height: 1.5; }
  .center { text-align: center; justify-self: center; }
  form { display: grid; gap: 14px; }
  fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  .assets { display: grid; gap: 6px; }
  .group { display: grid; gap: 6px; }
  .row {
    position: relative; display: flex; align-items: center; justify-content: space-between; gap: 10px;
    min-height: 44px; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--r);
    cursor: pointer; font-size: 14px; background: var(--surface);
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  }
  .row:hover { border-color: #c9d3de; }
  .row.on { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(15, 157, 122, 0.16); }
  .row input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
  .row:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  .tok { display: flex; align-items: center; gap: 8px; }
  .tok b { font-weight: 600; }
  .on-chain { color: var(--muted); }
  .mark-tok { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; color: #fff; background: var(--c); }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .field { display: grid; }
  .input-wrap { display: flex; align-items: center; border: 1px solid var(--line); border-radius: var(--r); background: var(--surface); transition: border-color 0.15s, box-shadow 0.15s; }
  .input-wrap:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(15, 157, 122, 0.16); }
  .input-wrap.invalid { border-color: var(--danger); box-shadow: 0 0 0 3px rgba(192, 54, 44, 0.12); }
  input[name="refundTo"] { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: 14px/1.2 var(--anytill-mono, ui-monospace, Menlo, monospace); color: var(--ink); padding: 12px; }
  input::placeholder { color: #8796a8; }
  .help { font-size: 12px; color: var(--faint); margin-top: 6px; line-height: 1.45; }
  .help.err { color: var(--danger); }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
    min-height: 46px; padding: 0 16px; border: 0; border-radius: var(--r);
    background: var(--btn); color: var(--btn-ink); font: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
    transition: transform 0.08s, filter 0.15s, box-shadow 0.15s;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.12) inset, 0 2px 6px -2px rgba(10, 37, 64, 0.4);
  }
  .btn:hover { filter: brightness(1.12); }
  .btn:active { transform: translateY(1px); }
  .btn:disabled { opacity: 0.6; cursor: default; filter: none; }
  .btn:focus-visible, .link:focus-visible, .checks-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .btn.ghost { background: var(--surface); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
  .btn.sm { min-height: 34px; font-size: 13px; width: auto; padding: 0 12px; justify-self: start; }
  .link { background: none; border: 0; padding: 6px 10px; font: inherit; font-size: 13px; font-weight: 600; color: var(--accent-ink); cursor: pointer; border-radius: 6px; }
  .send { display: grid; gap: 2px; }
  .big { font-size: 24px; font-weight: 600; letter-spacing: -0.01em; word-break: break-all; }
  .big span { color: var(--muted); font-weight: 500; }
  .deposit { display: grid; grid-template-columns: 112px 1fr; gap: 14px; align-items: start; padding: 14px; border-radius: var(--r); background: var(--panel); }
  .qr { width: 112px; height: 112px; padding: 8px; background: #fff; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); color: var(--ink); }
  .qr svg { width: 100%; height: 100%; display: block; }
  .qr-demo { position: relative; width: 100%; height: 100%; }
  .qr-demo svg { opacity: 0.22; }
  .qr-demo span { position: absolute; inset: 0; display: grid; place-items: center; font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: var(--warn); }
  .addr { display: grid; gap: 8px; min-width: 0; }
  .addr .label { margin: 0; }
  code { font-size: 12.5px; line-height: 1.45; word-break: break-all; color: var(--ink); user-select: all; }
  .meta { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: var(--muted); }
  .meta span { display: inline-flex; align-items: center; gap: 5px; }
  .meta .i { width: 14px; height: 14px; }
  .note, .alert { display: flex; gap: 8px; align-items: flex-start; margin: 0; font-size: 13px; line-height: 1.45; padding: 10px 12px; border-radius: var(--r); }
  .note { background: var(--panel); color: var(--muted); }
  .alert { background: #fdf0ef; color: var(--danger); }
  .note .i, .alert .i { margin-top: 1px; }
  .progress { display: grid; gap: 14px; }
  .timer { display: flex; align-items: baseline; gap: 8px; }
  .timer .mono { font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .steps li { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--faint); padding: 7px 0; }
  .steps li.done { color: var(--ink); }
  .steps li.now { color: var(--ink); font-weight: 600; }
  .steps .mark { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; border: 1.5px solid var(--line); flex: none; }
  .steps li.done .mark { background: var(--accent); border-color: var(--accent); color: #fff; }
  .steps li.done .mark .i { width: 13px; height: 13px; }
  .steps li.now .mark { border-color: var(--accent); }
  .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin 0.7s linear infinite; display: inline-block; opacity: 0.85; }
  .steps .spin { color: var(--accent); width: 12px; height: 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .state { display: grid; justify-items: center; text-align: center; gap: 6px; padding: 6px 0 2px; }
  .state h3 { margin: 6px 0 0; font-size: 20px; letter-spacing: -0.01em; }
  .state p { margin: 0; font-size: 14px; color: var(--muted); line-height: 1.5; max-width: 32ch; }
  .state .btn { margin-top: 8px; }
  .state-icon { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: #fff; }
  .state.ok .state-icon { animation: pop 0.35s cubic-bezier(0.3, 1.5, 0.6, 1); }
  .state-icon .i { width: 26px; height: 26px; stroke-width: 2.2; }
  .state-icon.err { background: #fdf0ef; color: var(--danger); }
  .state-icon.warn { background: #fff6e5; color: var(--warn); }
  @keyframes pop { from { transform: scale(0.6); opacity: 0; } }
  .checks-toggle { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--r); background: var(--panel); font: inherit; font-size: 13px; font-weight: 600; color: var(--ink); cursor: pointer; text-align: left; }
  .checks-toggle span { flex: 1; }
  .checks-toggle .i:first-child { color: var(--accent); }
  .checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .checks li { display: flex; gap: 8px; font-size: 13px; line-height: 1.4; }
  .checks li.ok .i { color: var(--accent); }
  .checks li.bad .i { color: var(--danger); }
  .checks small { display: block; color: var(--faint); font-size: 11.5px; word-break: break-all; }
  a { color: var(--accent-ink); font-weight: 600; }
  .skel { display: inline-block; height: 14px; border-radius: 6px; background: linear-gradient(90deg, #eef2f6, #f7f9fb, #eef2f6); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
  .skel-row { cursor: default; }
  .rows { display: grid; gap: 8px; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  .money { list-style: none; margin: 0; padding: 10px 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; border-radius: var(--r); background: var(--panel); }
  .money li { display: grid; gap: 1px; font-size: 12px; color: var(--faint); position: relative; padding-top: 14px; }
  .money li i { position: absolute; top: 2px; left: 0; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid #c9d3de; }
  .money li.done { color: var(--ink); }
  .money li.done i { background: var(--accent); border-color: var(--accent); }
  .money b { font-weight: 600; font-size: 12.5px; }
  .money time { font-size: 11.5px; color: var(--faint); }
  @media (max-width: 380px) {
    .head, .body { padding-left: 16px; padding-right: 16px; }
    .deposit { grid-template-columns: 1fr; justify-items: center; text-align: center; }
    .addr { justify-items: center; }
    .btn.sm { justify-self: center; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition: none !important; }
  }
`;
