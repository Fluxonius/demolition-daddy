// Settings window. The field list comes from lib/settings.js through the preload bridge,
// so the form, the defaults and the validation never drift apart.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const host = window.settingsHost;
  const form = $('form');
  const status = $('status');
  let groups = [];
  let current = null;
  let filePath = '';

  const getPath = (obj, key) => key.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
  function setPath(obj, key, value) {
    const parts = key.split('.');
    let o = obj;
    for (const k of parts.slice(0, -1)) o = o[k] || (o[k] = {});
    o[parts[parts.length - 1]] = value;
  }

  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const c of children) if (c) n.append(c);
    return n;
  }

  function control(f) {
    const id = `f-${f.key}`;
    switch (f.type) {
      case 'bool':
        return el('label', { class: 'switch' },
          el('input', { type: 'checkbox', id, 'data-key': f.key }),
          el('span', { class: 'knob', 'aria-hidden': 'true' }));
      case 'number': {
        const attrs = { type: 'number', id, 'data-key': f.key, min: f.min, max: f.max, step: f.step || 1 };
        return el('span', { class: 'num' }, el('input', attrs), f.unit ? el('span', { class: 'unit', text: f.unit }) : null);
      }
      case 'time':
        return el('input', { type: 'time', id, 'data-key': f.key });
      case 'text':
        return el('input', { type: 'text', id, 'data-key': f.key, maxlength: f.maxLength, spellcheck: 'false' });
      case 'select': {
        const s = el('select', { id, 'data-key': f.key });
        for (const o of f.options) s.append(el('option', { value: o.value, text: o.label }));
        return s;
      }
      case 'multi': {
        const wrap = el('span', { class: 'chips', id, 'data-key': f.key, 'data-multi': '1' });
        for (const o of f.options) {
          wrap.append(el('label', { class: 'chip' }, el('input', { type: 'checkbox', value: o.value }), el('span', { text: o.label })));
        }
        return wrap;
      }
      default:
        return null;
    }
  }

  function build() {
    form.textContent = '';
    for (const g of groups) {
      const fs = el('fieldset', { class: `group group-${g.id}` }, el('legend', { text: g.title }));
      for (const f of g.fields) {
        const row = el('div', { class: `row row-${f.type}`, 'data-row': f.key });
        row.append(el('label', { class: 'name', for: `f-${f.key}`, text: f.label }), control(f));
        if (f.help) row.append(el('small', { class: 'help', text: f.help }));
        if (f.warning) row.append(el('small', { class: 'warning', text: `⚠ ${f.warning}` }));
        fs.append(row);
      }
      form.append(fs);
    }
  }

  function fill(s) {
    current = s;
    for (const f of groups.flatMap((g) => g.fields)) {
      const node = form.querySelector(`[data-key="${f.key}"]`);
      const v = getPath(s, f.key);
      if (f.type === 'bool') node.checked = !!v;
      else if (f.type === 'multi') node.querySelectorAll('input').forEach((i) => (i.checked = v.includes(i.value)));
      else if (document.activeElement !== node) node.value = v;
      if (f.enabledBy) {
        const on = !!getPath(s, f.enabledBy);
        node.disabled = !on;
        form.querySelector(`[data-row="${f.key}"]`).classList.toggle('off', !on);
      }
    }
    $('title').textContent = `${s.pet.name} · settings`;
    document.body.classList.toggle('lock-on', !!s.lock.enabled);
  }

  function read() {
    const next = JSON.parse(JSON.stringify(current));
    for (const f of groups.flatMap((g) => g.fields)) {
      const node = form.querySelector(`[data-key="${f.key}"]`);
      let v;
      if (f.type === 'bool') v = node.checked;
      else if (f.type === 'multi') v = [...node.querySelectorAll('input:checked')].map((i) => i.value);
      else if (f.type === 'number') v = Number(node.value);
      else v = node.value;
      setPath(next, f.key, v);
    }
    return next;
  }

  function flash(text) {
    status.textContent = text;
    status.classList.remove('flash');
    void status.offsetWidth;
    status.classList.add('flash');
  }

  async function save(e) {
    const t = e && e.target;
    if (t && t.dataset.key === 'lock.enabled' && t.checked) {
      const ok = window.confirm(
        'Soft prompt-lock can stop Cursor from sending a prompt while you are overworked, until you take a short break.\n\n' +
        'Prompts starting with "!urgent" always pass (limited per day). Enable it?');
      if (!ok) {
        t.checked = false;
        return;
      }
    }
    const saved = await host.save(read());
    fill(saved);
    flash('saved ✓');
  }

  function renderMiniPet() {
    try {
      window.PixelPet.renderPet($('mini-pet'), 'happy');
    } catch {
      // decorative only
    }
  }

  async function init() {
    renderMiniPet();
    if (!host) {
      status.textContent = 'Open settings from the desktop overlay.';
      return;
    }
    const res = await host.get();
    groups = res.groups;
    filePath = res.path;
    build();
    fill(res.settings);
    status.textContent = filePath.replace(/^\/(Users|home)\/[^/]+/, '~');
    status.title = filePath;
    form.addEventListener('change', save);
    host.onChanged((s) => fill(s));
    $('reset').addEventListener('click', async () => {
      fill(await host.reset());
      flash('defaults restored');
    });
  }

  const close = () => (host ? host.close() : window.close());
  $('close').addEventListener('click', close);
  $('done').addEventListener('click', close);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  init();
})();
