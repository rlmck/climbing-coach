/* ═══════════════════════════════════════════════════════════════
   views/progress.js — bodyweight, max hang per grip, critical force.
   Chart shapes are a first pass; the data contract is the point.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion } = CT.ui, S = CT.store, dt = CT.dt;

  const GRIP_COLOR = { tfd: 'var(--spruce-mark)', half: 'var(--ember-mark)' };
  const GRIP_MARK  = { tfd: 'circle', half: 'square' };

  function empty(title, line) {
    return el('div', { class: 'empty' }, [ el('h3', { text: title }), el('p', { text: line }) ]);
  }

  /* a card that can flip between its chart and the underlying numbers */
  function chartCard(opts) {
    const { title, sub, buildChart, buildTable, action, hasData, emptyTitle, emptyLine } = opts;
    const body = el('div', { class: 'card__bd' });
    const toggle = el('div', { class: 'seg' }, [
      el('button', { text: 'Chart', 'aria-pressed': 'true', onclick: () => set(false) }),
      el('button', { text: 'Table', 'aria-pressed': 'false', onclick: () => set(true) })
    ]);
    function set(v) {
      [...toggle.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === (v ? 1 : 0))));
      motion.swap(body, n => (v ? buildTable : buildChart)(n));
    }
    const card = el('section', { class: 'card' }, [
      el('div', { class: 'card__hd' }, [
        el('div', {}, [
          el('h3', { class: 'h-card', text: title }),
          sub ? el('p', { class: 'sub', style: 'margin-top:2px', text: sub }) : null
        ]),
        el('div', { class: 'card__act row', style: 'gap:9px' }, [ hasData ? toggle : null, action || null ])
      ]),
      body
    ]);
    if (hasData) buildChart(body); else body.appendChild(empty(emptyTitle, emptyLine));
    return card;
  }

  CT.views.progress = function (host, c) {
    const wrap = el('div', { class: 'stack', style: 'gap:14px' });

    /* ── bodyweight ───────────────────────────────────────── */
    const bw = S.bodyweightTrend(c);
    wrap.appendChild(chartCard({
      title: 'Bodyweight',
      sub: bw.empty ? 'Log a reading whenever you weigh in'
         : bw.single ? `${bw.latest.toFixed(1)} kg · first reading`
         : `${bw.latest.toFixed(1)} kg · ${bw.delta > 0 ? '+' : ''}${bw.delta.toFixed(1)} kg over the last month`,
      hasData: c.bodyweight.length > 0,
      emptyTitle: 'No readings yet',
      emptyLine: 'Add one whenever you step on the scales — weekly is plenty.',
      action: el('button', { class: 'btn btn--ghost btn--sm', onclick: () => CT.views.weightLog(c) },
        [ icon('plus'), 'Log weight' ]),
      buildChart: n => {
        const holder = el('div');
        n.appendChild(holder);
        CT.charts.line(holder, {
          height: 200, unit: ' kg', decimals: 1, directLabel: true,
          series: [{ id: 'bw', name: 'Bodyweight', color: 'var(--ink-2)', marker: 'circle',
                     points: c.bodyweight.map(b => ({ x: b.date, y: b.kg })) }]
        });
      },
      buildTable: n => {
        n.appendChild(el('table', { class: 'table table--rows' }, [
          el('thead', {}, [ el('tr', {}, [
            el('th', { text: 'Date' }), el('th', { class: 'r', text: 'Bodyweight' }), el('th', {})
          ]) ]),
          el('tbody', {}, c.bodyweight.slice().reverse().map(b =>
            el('tr', { tabindex: 0, role: 'button',
              'aria-label': `${b.kg.toFixed(1)} kg on ${dt.short(b.date)}. Open to edit or delete.`,
              onclick: () => CT.views.weightLog(c, { date: b.date }),
              onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); CT.views.weightLog(c, { date: b.date }); } }
            }, [
              el('td', { text: dt.short(b.date) }),
              el('td', { class: 'r', text: b.kg.toFixed(1) + ' kg' }),
              el('td', { class: 'r', style: 'width:28px' }, [ icon('fwd', 'histrow__chev') ])
            ])
          ))
        ]));
        n.appendChild(el('p', { class: 'tiny', style: 'margin-top:12px', text: 'Tap a reading to change or remove it.' }));
      }
    }));

    /* ── max hang per grip ────────────────────────────────── */
    wrap.appendChild(chartCard({
      title: 'Max hang',
      sub: 'Added load for a clean 7-second hang · 20 mm edge',
      hasData: c.maxHang.length > 0,
      emptyTitle: 'No max hang test yet',
      emptyLine: 'Results appear here once the first test is on record.',
      buildChart: n => {
        const holder = el('div');
        n.appendChild(holder);
        CT.charts.line(holder, {
          height: 210, unit: ' kg', decimals: 1, directLabel: true,
          series: CT.GRIPS.map(g => ({
            id: g.id, name: g.short, color: GRIP_COLOR[g.id],
            marker: GRIP_MARK[g.id], dash: g.id === 'half',
            points: c.maxHang.map(m => ({ x: m.date, y: m[g.id] }))
          }))
        });
        n.appendChild(el('div', { class: 'legend', style: 'margin-top:14px' }, CT.GRIPS.map(g =>
          el('span', {}, [
            el('i', { style: `background:${GRIP_COLOR[g.id]}${g.id === 'half' ? ';height:0;border-top:2px dashed ' + GRIP_COLOR[g.id] : ''}` }),
            g.name + ' — ' + (g.id === 'half' ? 'dashed, square markers' : 'solid, round markers')
          ])
        )));
      },
      buildTable: n => n.appendChild(table(['Date', 'Three-finger drag', 'Half-crimp'],
        c.maxHang.slice().reverse().map(m => [dt.short(m.date), '+' + m.tfd.toFixed(1) + ' kg', '+' + m.half.toFixed(1) + ' kg'])))
    }));

    /* ── critical force ───────────────────────────────────── */
    const cf = S.latestCF(c), prev = c.criticalForce[c.criticalForce.length - 2];
    wrap.appendChild(el('section', { class: 'card' }, [
      el('div', { class: 'card__hd' }, [
        el('div', {}, [
          el('h3', { class: 'h-card', text: 'Critical force' }),
          el('p', { class: 'sub', style: 'margin-top:2px',
            text: cf ? `7:3 repeaters to failure · tested ${dt.relative(cf.date)}`
                     : '7:3 repeaters to failure' })
        ]),
        el('span', { class: 'card__act chip chip--ember', text: 'Mock data shape' })
      ]),
      cf
        ? el('div', { class: 'card__bd' }, [
            el('div', { class: 'cf' }, [
              el('dl', { class: 'cf__stats' }, [
                stat('Critical force', cf.cf.toFixed(1), 'kg', prev ? +(cf.cf - prev.cf).toFixed(1) : null),
                stat('As % of max', String(cf.pct), '%', prev ? cf.pct - prev.pct : null),
                stat('W′ (reserve)', String(cf.wPrime), 'kg·s', prev ? cf.wPrime - prev.wPrime : null)
              ]),
              el('div', { id: 'cfPlot' })
            ]),
            el('p', { class: 'tiny', style: 'margin-top:16px;line-height:1.5',
              text: 'Force decays toward an asymptote across 24 repeaters. The asymptote is the critical force — the load the fingers can hold more or less indefinitely. Everything above it draws down W′.' })
          ])
        : el('div', { class: 'card__bd' }, [
            empty('No critical force test yet', 'The first test sets the baseline everything else is read against.')
          ])
    ]));

    /* ── session history ──────────────────────────────────── */
    const hist = S.history(c);
    wrap.appendChild(el('section', { class: 'card' }, [
      el('div', { class: 'card__hd', style: 'padding-bottom:14px' }, [
        el('div', {}, [
          el('h3', { class: 'h-card', text: 'Session history' }),
          el('p', { class: 'sub', style: 'margin-top:2px',
            text: hist.length ? `${hist.length} logged · open any one to edit or delete it` : 'Everything logged, newest first' })
        ])
      ]),
      hist.length
        ? el('div', { style: 'border-top:1px solid var(--line)' }, hist.map(histRow.bind(null, c)))
        : el('div', { class: 'card__bd' }, [
            empty('No strength sessions yet', 'Sessions appear here as soon as they are logged.') ])
    ]));

    host.appendChild(wrap);
    if (cf) CT.charts.cfCurve(CT.ui.$('#cfPlot', wrap), cf);
    motion.enter(wrap);
  };

  function stat(label, value, unit, delta) {
    const n = el('span', { class: 'readout__n', style: 'font-size:28px', text: '0' });
    requestAnimationFrame(() => motion.count(n, 0, parseFloat(value), { decimals: value.includes('.') ? 1 : 0 }));
    return el('div', { class: 'cf__stat' }, [
      el('dt', { text: label }),
      el('dd', {}, [
        el('div', { class: 'readout' }, [ n, el('span', { class: 'readout__u', text: unit }) ]),
        delta !== null && delta !== undefined
          ? el('span', { class: 'delta ' + (delta >= 0 ? 'delta--down' : 'delta--up'), style: 'margin-top:4px;display:block',
              text: (delta > 0 ? '+' : '') + delta + ' since last test' })
          : null
      ])
    ]);
  }

  function table(heads, rows) {
    return el('table', { class: 'table' }, [
      el('thead', {}, [ el('tr', {}, heads.map((h, i) => el('th', { class: i ? 'r' : '', text: h }))) ]),
      el('tbody', {}, rows.map(r => el('tr', {}, r.map((v, i) => el('td', { class: i ? 'r' : '', text: v })))))
    ]);
  }

  /* one row per logged session — the way into editing anything historic */
  function histRow(c, s) {
    const T = CT.TYPE[s.type];
    return el('button', {
      class: 'histrow', 'aria-label': `${T.label} on ${dt.short(s.date)}. Open to edit or delete.`,
      onclick: () => CT.openLog(s.type, { sessionId: s.id })
    }, [
      el('span', { class: 'quick__dot quick__dot--' + (s.type === 'strength' ? 's' : s.type === 'pe' ? 'p' : 'e') }),
      el('div', { class: 'histrow__main' }, [
        el('p', { class: 'histrow__t', text: T.label }),
        el('p', { class: 'histrow__d', text: CT.describe(c, s) })
      ]),
      s.type === 'strength' ? el('div', { class: 'row', style: 'gap:10px' },
        CT.GRIPS.map(g => el('span', { class: 'pips', title: g.name },
          s.reps[g.id].map(r => el('span', {
            class: 'pip' + (r ? ' pip--on' : ''),
            style: r ? '' : 'background:var(--clay-tint);box-shadow:inset 0 0 0 1px var(--clay)'
          }))))) : null,
      el('span', { class: 'histrow__date', text: dt.short(s.date) }),
      icon('fwd', 'histrow__chev')
    ]);
  }
})();
