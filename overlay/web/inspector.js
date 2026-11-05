// Agent Inspector page: polls the main process once a second and renders three panes.
(function (root) {
  'use strict';

  const KEYS = ['chars', 'words', 'status', 'tool', 'linesAdded', 'linesRemoved', 'durationMs', 'frustration',
    'rejection', 'failed', 'interrupt', 'minutes', 'feeling', 'action', 'file'];

  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour12: false });

  /** One-line summary of a PetEvent: type, key fields, conversation, simulated or real. */
  function describeEvent(e) {
    const data = e.data || {};
    const fields = KEYS.filter((k) => data[k] !== undefined && data[k] !== false).map((k) => `${k}=${data[k]}`);
    if (Array.isArray(data.flags) && data.flags.length) fields.push(`flags=${data.flags.join('+')}`);
    if (e.conv) fields.push(`conv=${String(e.conv).slice(0, 8)}`);
    return { type: e.type, fields, simulated: data.simulated === true, src: e.src };
  }

  /** Cursor CLI status from the most recent `llm` entry of agent-log.jsonl. */
  function aiStatus(log, engine) {
    if (engine && engine.llm === false) return { cls: 'warn', text: 'AI: off · local rules engine' };
    const last = [...log].reverse().find((x) => x.kind === 'llm');
    if (!last) {
      const pending = log.some((x) => x.kind === 'llm-request');
      return { cls: 'warn', text: pending ? 'AI: asking Cursor CLI…' : 'AI: waiting for first Cursor CLI call' };
    }
    if (last.source === 'llm') return { cls: 'ok', text: `AI: Cursor CLI agent ✓ (${Math.round((last.cli?.durationMs || 0) / 1000)} s)` };
    const reason = (last.cli && last.cli.error) || 'unavailable';
    return { cls: 'bad', text: `AI: Cursor CLI unavailable (${reason}) → fallback: local rules engine` };
  }

  const api = { describeEvent, aiStatus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined' || !root.inspectorHost) return;

  const host = root.inspectorHost;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const seen = { events: 0, reasoning: 0, actions: 0 };

  function sourceTag(source) {
    return el('span', `tag ${source === 'llm' ? 'llm' : 'rules'}`, source === 'llm' ? 'AI · CURSOR CLI' : 'LOCAL RULES');
  }

  function fill(list, items, key, render) {
    const newest = items.length ? items[items.length - 1].ts : 0;
    if (list.dataset.sig === `${items.length}:${newest}`) return;
    list.dataset.sig = `${items.length}:${newest}`;
    list.replaceChildren(...items.slice().reverse().map((item) => {
      const li = render(item);
      if (item.ts > seen[key]) li.classList.add('fresh');
      return li;
    }));
    seen[key] = Math.max(seen[key], newest);
  }

  function renderEvent(e) {
    const d = describeEvent(e);
    const li = el('li');
    li.append(el('span', 't', time(e.ts)), el('span', 'type', d.type));
    li.append(el('span', `tag ${d.simulated ? 'sim' : 'real'}`, d.simulated ? 'SIMULATED' : d.src === 'ext' ? 'PET UI' : 'REAL HOOK'));
    if (d.fields.length) li.append(el('div', 'kv', d.fields.join('  ')));
    return li;
  }

  function pre(label, text) {
    const det = el('details');
    det.append(el('summary', '', label), el('pre', '', text));
    return det;
  }

  function renderReasoning(x) {
    const li = el('li');
    li.append(el('span', 't', time(x.ts)), el('span', 'type', x.kind));
    if (x.kind === 'start') {
      li.append(el('div', 'kv', `engine started · AI: ${x.llm} · tick ${x.everyMs / 1000} s`));
      return li;
    }
    if (x.kind === 'llm-request') {
      li.append(el('div', 'kv', 'sending numbers-only telemetry snapshot to the Cursor CLI agent…'));
      return li;
    }
    li.append(sourceTag(x.source));
    if (x.metrics) {
      const m = x.metrics;
      li.append(el('div', 'kv', `received: session ${m.sessionMin} min · ${m.sinceBreakMin} min since break · ${m.last60m.prompts} prompts/60m · ${Math.round(m.last60m.responseChars / 1000)}k chars read · ${m.last10m.frustration} frustration/10m · ${m.parallelConvs} chats · hour ${m.localHour}${m.onBreak ? ' · ON BREAK' : ''}`));
    }
    li.append(el('div', 'why-line', `→ ${x.why}`));
    if (x.nudge) li.append(el('div', 'kv', `nudge L${x.nudge.level}: “${x.nudge.text}”`));
    if (x.kind === 'llm' && x.cli) {
      if (x.cli.error) li.append(el('div', 'err', `Cursor CLI: ${x.cli.error} → using local rules`));
      if (x.cli.request) li.append(pre(`prompt sent to Cursor CLI (${x.cli.systemChars} chars system + snapshot)`, x.cli.request));
      if (x.cli.response) li.append(pre(`agent response (${Math.round(x.cli.durationMs / 1000)} s)`, x.cli.response));
    }
    if (x.conditions && x.conditions.length) {
      li.append(pre('evidence', x.conditions.map((c) => `${c.id} ${Math.round(c.confidence * 100)}%: ${c.evidence.join('; ')}`).join('\n')));
    }
    return li;
  }

  function renderAction(a) {
    const li = el('li');
    li.append(el('span', 't', time(a.ts)));
    if (a.messageId) li.append(el('span', 'type', `bubble → ${a.action}`), el('span', 'kv', ` ${a.messageId}`));
    else li.append(el('span', 'type', a.type), el('span', 'kv', ` ${JSON.stringify(a.data || {}).slice(0, 80)}`));
    return li;
  }

  function badge(id, cls, text) {
    const b = $(id);
    b.className = `badge ${cls}`;
    b.textContent = text;
    b.title = text;
  }

  function render(s) {
    badge('mode', s.sandbox ? 'sim' : 'ok', s.sandbox ? 'SANDBOX · simulated events' : 'LIVE · real hooks');
    const eng = s.engine || {};
    const engText = eng.external ? 'engine: external runner' : eng.running ? `engine: running (pid ${eng.pid})` : `engine: stopped${eng.error ? ` · ${eng.error}` : ''}`;
    badge('engine', eng.running ? 'ok' : 'bad', engText + (s.clock ? ` · clock ${s.clock.hour}:00 (${s.clock.tz})` : ''));
    const ai = aiStatus(s.agentLog, eng);
    badge('ai', ai.cls, ai.text);
    $('live').disabled = !s.sandbox;
    $('dir').textContent = `pet dir: ${s.dir}${s.sandbox ? `   (live: ${s.liveDir})` : ''}`;

    const sc = s.scenario;
    $('scenario-status').textContent = sc.step === null || sc.step === undefined ? 'fresh → focused → tired → bubble → break → welcome back'
      : `${sc.running ? '▶' : '✓'} step ${sc.step + 1}/${sc.steps.length}: ${sc.steps[sc.step]}`;

    fill($('events'), s.events, 'events', renderEvent);
    fill($('reasoning'), s.agentLog, 'reasoning', renderReasoning);
    const clicks = [...s.actions, ...s.events.filter((e) => e.src === 'ext' && !(e.data && e.data.simulated))].sort((a, b) => a.ts - b.ts);
    fill($('actions'), clicks, 'actions', renderAction);

    const st = s.state;
    const fresh = st && s.now - st.updatedAt < 120_000;
    const mood = fresh ? st.mood : 'offline';
    $('mood').textContent = mood;
    root.PixelPet.renderPet($('big-pet'), fresh ? mood : 'egg');
    const load = fresh ? st.load : 0;
    $('load-bar').style.width = `${load}%`;
    $('load-bar').className = load >= 85 ? 'high' : load >= 60 ? 'mid' : '';
    $('load').textContent = fresh ? `load ${load}/100 · ${st.onBreak ? 'on a break' : st.agentWorking ? 'agent working' : 'agent idle'}` : 'no fresh state.json';
    $('source').replaceChildren(el('span', 'dim', 'decided by '), fresh ? sourceTag(st.source) : el('span', 'dim', '—'));
    const lastDecision = [...s.agentLog].reverse().find((x) => x.why);
    $('why').textContent = lastDecision ? `why: ${lastDecision.why}` : '';

    const msg = s.messages && s.messages.messages && s.messages.messages[0];
    const text = (st && st.nudge && st.nudge.text) || (msg && msg.text);
    $('bubble').hidden = !fresh || !text;
    if (text) $('bubble').replaceChildren(el('span', 'who', 'Pixel: '), document.createTextNode(text));
  }

  async function refresh() {
    try {
      render(await host.get());
    } catch {
      // main process busy; try again next tick
    }
  }

  async function init() {
    const s = await host.get();
    $('sims').replaceChildren(...s.simulations.map((sim) => {
      const b = el('button', 'btn sim', sim.label);
      b.type = 'button';
      b.title = 'Appends simulated events to the sandbox events.jsonl; the real engine and AI analyze them';
      b.addEventListener('click', () => host.simulate(sim.id).then(refresh));
      return b;
    }));
    root.PixelPet.renderPet($('mini-pet'), 'happy');
    $('scenario').addEventListener('click', () => host.scenario().then(refresh));
    $('reset').addEventListener('click', () => host.reset().then(refresh));
    $('live').addEventListener('click', () => host.mode('live').then(refresh));
    $('close').addEventListener('click', () => host.close());
    document.addEventListener('keydown', (e) => e.key === 'Escape' && host.close());
    render(s);
    setInterval(refresh, 1000);
  }

  init();
})(typeof window !== 'undefined' ? window : globalThis);
