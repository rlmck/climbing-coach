/* ═══════════════════════════════════════════════════════════════
   ui.js — DOM helpers, icons, GSAP motion vocabulary.
   Every animation degrades to an instant state change if GSAP or
   reduced-motion says so.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT;
  const G = window.gsap || null;
  const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ON = !!G && !REDUCE;

  if (G) G.defaults({ ease: 'power3.out', duration: 0.5 });

  /* ── DOM ─────────────────────────────────────────────────── */
  const el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'data') for (const d in v) n.dataset[d] = v[d];
      else n.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : kids ? [kids] : []).forEach(c => {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  };
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

  /* ── icons ───────────────────────────────────────────────── */
  const P = {
    dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm9 0h7v-9h-7v9Zm0-16v5h7V4h-7Z',
    calendar:  'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
    chart:     'M4 20V9m5 11V4m5 16v-7m5 7V7',
    people:    'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.4 4.6a3.5 3.5 0 0 1 0 6.8',
    check:     'M4 12.5 9 17.5 20 6.5',
    x:         'M5 5l14 14M19 5 5 19',
    plus:      'M12 5v14M5 12h14',
    minus:     'M5 12h14',
    clock:     'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3.5 2',
    info:      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-9v5m0-8.5v.01',
    back:      'M15 6l-6 6 6 6',
    fwd:       'M9 6l6 6-6 6',
    arrowUp:   'M12 19V5m-6 6 6-6 6 6',
    grip:      'M8 5v9m4-9v9m4-9v9M6 14a6 6 0 0 0 12 0',
    spark:     'M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1'
  };
  const icon = (name, cls) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = `<path d="${P[name] || ''}" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>`;
    return s;
  };

  /* ── motion vocabulary ───────────────────────────────────── */
  const motion = {
    on: ON,

    /* staggered entrance for a view's top-level blocks */
    enter(container, sel) {
      if (!ON) return;
      const items = sel ? $$(sel, container) : [...container.children];
      G.fromTo(items,
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: .55, stagger: .045, ease: 'power3.out', clearProps: 'transform' });
    },

    /* cross-fade between routes */
    swap(node, build) {
      if (!ON) { clear(node); build(node); return; }
      G.to(node, { opacity: 0, y: -6, duration: .16, ease: 'power2.in', onComplete() {
        clear(node); build(node);
        G.fromTo(node, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .34, ease: 'power3.out' });
      }});
    },

    /* number count-up on any element holding a numeric string */
    count(node, from, to, opts) {
      const o = Object.assign({ decimals: 1, duration: .8, prefix: '', suffix: '' }, opts);
      const write = v => node.textContent = o.prefix + v.toFixed(o.decimals) + o.suffix;
      if (!ON) { write(to); return; }
      const proxy = { v: from };
      G.to(proxy, { v: to, duration: o.duration, ease: 'power2.out', onUpdate: () => write(proxy.v) });
    },

    pop(node, scale) {
      if (!ON) return;
      G.fromTo(node, { scale: scale || .82, opacity: 0 },
        { scale: 1, opacity: 1, duration: .45, ease: 'back.out(2.2)' });
    },

    shake(node) {
      if (!ON) return;
      G.fromTo(node, { x: -5 }, { x: 0, duration: .5, ease: 'elastic.out(1, 0.32)' });
    },

    collapse(node, open) {
      if (!ON) { node.style.display = open ? '' : 'none'; return; }
      if (open) {
        node.style.display = '';
        G.fromTo(node, { height: 0, opacity: 0 },
          { height: 'auto', opacity: 1, duration: .42, ease: 'power3.out', clearProps: 'height' });
      } else {
        G.to(node, { height: 0, opacity: 0, duration: .28, ease: 'power2.in',
          onComplete: () => { node.style.display = 'none'; node.style.height = ''; } });
      }
    },

    sheetIn(scrim, sheet) {
      if (!ON) { scrim.style.opacity = 1; return; }
      G.to(scrim, { opacity: 1, duration: .28 });
      G.fromTo(sheet, { y: 26, scale: .985, opacity: 0 },
        { y: 0, scale: 1, opacity: 1, duration: .48, ease: 'power4.out' });
    },
    sheetOut(scrim, sheet, done) {
      if (!ON) { done(); return; }
      G.to(scrim, { opacity: 0, duration: .22 });
      G.to(sheet, { y: 16, scale: .99, opacity: 0, duration: .22, ease: 'power2.in', onComplete: done });
    },

    /* draw an SVG path on */
    draw(path, delay) {
      if (!ON || !path.getTotalLength) return;
      const L = path.getTotalLength();
      G.fromTo(path, { strokeDasharray: L, strokeDashoffset: L },
        { strokeDashoffset: 0, duration: 1.05, ease: 'power2.inOut', delay: delay || 0,
          onComplete: () => { path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; } });
    },

    ringTo(circle, pct, circumference) {
      const off = circumference * (1 - pct);
      if (!ON) { circle.style.strokeDashoffset = off; return; }
      G.fromTo(circle, { strokeDashoffset: circumference }, { strokeDashoffset: off, duration: .95, ease: 'power3.out' });
    }
  };

  /* ── toasts ──────────────────────────────────────────────── */
  function toast(title, sub) {
    const host = $('#toasts');
    const t = el('div', { class: 'toast' }, [
      icon('check'),
      el('div', {}, [ el('span', { text: title }), sub ? el('small', { text: sub }) : null ])
    ]);
    host.appendChild(t);
    const kill = () => t.remove();
    const HOLD = 1.5;                       // seconds on screen before it starts leaving
    if (!ON) { setTimeout(kill, HOLD * 1000 + 250); return; }
    G.fromTo(t, { y: 18, opacity: 0, scale: .95 }, { y: 0, opacity: 1, scale: 1, duration: .38, ease: 'back.out(1.7)' });
    G.to(t, { y: 10, opacity: 0, duration: .25, delay: HOLD, ease: 'power2.in', onComplete: kill });
  }

  /* ── milestone — quiet, brief, no confetti ───────────────── */
  function milestone(n, label, sub) {
    const wrap = el('div', { class: 'milestone' }, [
      el('div', { class: 'milestone__card' }, [
        el('div', { class: 'milestone__n', text: '0' }),
        el('div', { class: 'milestone__t', text: label }),
        sub ? el('div', { class: 'milestone__s', text: sub }) : null
      ])
    ]);
    document.body.appendChild(wrap);
    const card = $('.milestone__card', wrap), num = $('.milestone__n', wrap);
    if (!ON) { num.textContent = n; setTimeout(() => wrap.remove(), 2200); return; }
    G.fromTo(card, { scale: .9, opacity: 0, y: 10 }, { scale: 1, opacity: 1, y: 0, duration: .6, ease: 'back.out(1.6)' });
    motion.count(num, 0, n, { decimals: 0, duration: .9 });
    G.to(card, { scale: .96, opacity: 0, duration: .38, delay: 2.1, ease: 'power2.in', onComplete: () => wrap.remove() });
  }

  /* ── small composed pieces reused across views ───────────── */
  function statusChip(status) {
    const map = {
      completed: ['chip chip--spruce', 'Completed'],
      missed:    ['chip chip--clay',   'Missed'],
      suggested: ['chip',              'Suggested']
    };
    const [c, t] = map[status] || map.suggested;
    return el('span', { class: c, text: t });
  }

  function ring(pct, value, size) {
    const s = size || 52, r = (s - 6) / 2, C = 2 * Math.PI * r;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${s} ${s}`);
    svg.innerHTML =
      `<circle cx="${s/2}" cy="${s/2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="4"/>` +
      `<circle class="ring__p" cx="${s/2}" cy="${s/2}" r="${r}" fill="none" stroke="var(--spruce)" stroke-width="4"
        stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>`;
    const wrap = el('div', { class: 'ring', style: `width:${s}px;height:${s}px` }, [
      el('div', { class: 'ring__n', text: String(value) })
    ]);
    wrap.insertBefore(svg, wrap.firstChild);
    requestAnimationFrame(() => motion.ringTo(svg.querySelector('.ring__p'), pct, C));
    return wrap;
  }

  CT.ui = { el, $, $$, clear, icon, motion, toast, milestone, statusChip, ring, ON };
  CT.views = CT.views || {};
})();
