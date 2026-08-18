/* ═══════════════════════════════════════════════════════════════
   views/progress.js — bodyweight, max hang per grip, critical force.
   Chart shapes are a first pass; the data contract is the point.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast } = CT.ui, S = CT.store, dt = CT.dt;

  const GRIP_COLOR = { tfd: 'var(--spruce-mark)', half: 'var(--ember-mark)' };
  const GRIP_MARK  = { tfd: 'circle', half: 'square' };

  /* same colours CT.TYPE already assigns those dots everywhere else —
     the quick-log tiles, the schedule, the session history rows.
     Climbing has no bar of its own here — it folds into Endurance
     (see blockVolume) — but keeps its own rows once you drill in. */
  const VOLUME_SERIES = [
    { key: 'strength',  label: 'Strength',        color: 'var(--spruce)' },
    { key: 'endurance', label: 'Endurance',       color: 'var(--ink-4)' },
    { key: 'pe',        label: 'Power Endurance', color: 'var(--ember)' }
  ];

  function empty(title, line) {
    return el('div', { class: 'empty' }, [ el('h3', { text: title }), el('p', { text: line }) ]);
  }

  /* The full modality name goes in the legend, the tooltip, and the
     table; the chart only has ~90px per bar to put a label under. Cut
     at the nearest word boundary rather than a flat character count —
     "Climb — Routes" and "Climb — Bouldering" only differ after the
     word a naive first-word cut would have thrown away. */
  function shortLabel(text, max) {
    max = max || 15;
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    return (sp > max * 0.55 ? cut.slice(0, sp) : cut).trim() + '…';
  }

  /* swatch(colour, weight) — a filled block, at less than full opacity
     when it's standing in for something smaller than the biggest row
     in its list, so a breakdown carries its own rough bar chart even
     as a list of numbers. */
  function swatch(color, weight) {
    return el('span', { class: 'legend__sw', style:
      `background:${color};opacity:${weight};display:inline-block;margin-right:8px;vertical-align:middle` });
  }

  /* one label/value pair, in the same compact form the client card
     already uses for "This week" / "Streak" / "Last session" */
  function kv(label, value) {
    return el('dl', { class: 'kv' }, [ el('dt', { text: label }), el('dd', { text: value }) ]);
  }

  /* the modality/duration/metres shape — endurance (climbing folded
     in), power endurance. Everything past the session count is only
     as rich as what those modalities actually ask for — traversing
     and 1-on-1-off have no climbs list to pull a pitch count or a
     grade from, so a stat with nothing behind it just doesn't appear
     rather than showing up as a confident zero. */
  function modalityDrill(s, bd) {
    const stats = [];
    if (bd.metres) stats.push(kv('Metres climbed', CT.fmtMetres(bd.metres)));
    if (bd.durationSec) stats.push(kv('Time on the wall', CT.fmtDuration(bd.durationSec)));
    if (bd.climbs) stats.push(kv(bd.climbs === 1 ? 'Climb' : 'Climbs', String(bd.climbs)));
    if (bd.hardestRoute) stats.push(kv('Hardest route', bd.hardestRoute));
    if (bd.hardestBoulder) stats.push(kv('Hardest boulder', bd.hardestBoulder));
    if (bd.avgRpe) stats.push(kv('Average effort', bd.avgRpe + ' / 5'));
    if (bd.venues.length) stats.push(kv(bd.venues.length === 1 ? 'Venue' : 'Venues', String(bd.venues.length)));

    return el('div', { style: 'margin-top:12px' }, [
      el('p', { class: 'eyebrow', text: `${s.label} — ${bd.total} ${bd.total === 1 ? 'session' : 'sessions'}` }),
      stats.length ? el('div', { class: 'cfstats', style: 'margin-top:14px;padding-top:0;border-top:none' }, stats) : null,
      bd.rows.length
        ? el('table', { class: 'table table--rows', style: 'margin-top:16px' }, [
            el('tbody', {}, bd.rows.map(r => el('tr', {}, [
              el('td', {}, [ swatch(s.color, .35 + .65 * r.count / bd.rows[0].count), r.label ]),
              el('td', { class: 'r', text: String(r.count) })
            ])))
          ])
        : el('p', { class: 'tiny', style: 'margin-top:6px', text: `No ${s.label.toLowerCase()} sessions logged this block.` })
    ]);
  }

  /* the grip/reps/load shape — strength has no modality, so its
     breakdown is the thing it actually varies by instead: how clean
     each grip has been, and how much it's actually moved since the
     block opened (c.startLoads vs c.prescribed — the same numbers the
     +2.5 kg replay logic runs on, not a separate estimate of them). */
  function strengthDrill(s, bd) {
    const rows = [
      el('p', { class: 'eyebrow', text: `${s.label} — ${bd.total} ${bd.total === 1 ? 'session' : 'sessions'}` })
    ];
    if (bd.hangs) {
      rows.push(el('table', { class: 'table table--rows', style: 'margin-top:8px' }, [
        el('thead', {}, [ el('tr', {}, [
          el('th', { text: 'Grip' }), el('th', { class: 'r', text: 'Clean' }),
          el('th', { class: 'r', text: 'Working load' }), el('th', { class: 'r', text: 'Gained' })
        ]) ]),
        el('tbody', {}, bd.grips.map(g => el('tr', {}, [
          el('td', {}, [ swatch(s.color, g.reps ? .35 + .65 * g.clean / Math.max(1, Math.max(...bd.grips.map(x => x.clean)) || 1) : .2), g.short ]),
          el('td', { class: 'r', text: g.reps ? `${g.clean}/${g.reps}${g.cleanPct != null ? ' · ' + g.cleanPct + '%' : ''}` : '—' }),
          el('td', { class: 'r', text: g.weight != null ? CT.fmtLoad(g.weight) : '—' }),
          el('td', { class: 'r', text: g.gained != null ? (g.gained > 0 ? '+' : '') + g.gained.toFixed(1) + ' kg' : '—' })
        ])))
      ]));
    }
    if (bd.limit.count) {
      rows.push(el('p', { class: 'tiny', style: 'margin-top:10px', text:
        `Limit bouldering — ${bd.limit.count} ${bd.limit.count === 1 ? 'session' : 'sessions'} · ${bd.limit.attempts} attempts · ${bd.limit.sent} sent` +
        (bd.limit.topGrade ? ` · top ${bd.limit.topGrade}` : '') }));
    }
    if (!bd.hangs && !bd.limit.count) {
      rows.push(el('p', { class: 'tiny', style: 'margin-top:6px', text: 'No strength sessions logged this block.' }));
    }
    return el('div', { style: 'margin-top:12px' }, rows);
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

    /* ── weekly training volume ──────────────────────────────
       How training actually split across types, week by week —
       climbing folded into endurance, since a day at the crag and a
       day of route laps are the same kind of work for this purpose
       (see blockVolume). The block's own targets leave climbing out
       entirely; this doesn't. */
    const vol = S.blockVolume(c);
    wrap.appendChild(chartCard({
      title: 'Weekly training volume',
      sub: vol.total === 0 ? 'Log a session and the weekly split appears here'
         : `${vol.total} session${vol.total === 1 ? '' : 's'} across ${vol.activeWeeks} of ${vol.weeks.length} week${vol.weeks.length === 1 ? '' : 's'}`,
      hasData: vol.total > 0,
      emptyTitle: 'No sessions logged yet',
      emptyLine: 'Once sessions are logged, this shows how the block splits across strength, endurance and power endurance.',
      buildChart: n => {
        let active = null;   // selected type, or null for the weekly stack
        const head = el('div', { class: 'row', style: 'justify-content:space-between;align-items:baseline' });
        const holder = el('div');
        const legend = el('div', { class: 'legend' });
        const drill = el('div');
        n.appendChild(head);
        n.appendChild(holder);
        n.appendChild(legend);
        n.appendChild(drill);

        const select = key => { active = active === key ? null : key; paint(); };

        function paint() {
          CT.ui.clear(head);
          const s = active && VOLUME_SERIES.find(x => x.key === active);
          const bd = active && S.typeBreakdown(c, active);

          if (!active) {
            CT.charts.stackedBar(holder, {
              height: 200,
              series: VOLUME_SERIES,
              categories: vol.weeks.map(w => ({ label: 'W' + w.w, values: w.counts, total: w.total })),
              onSegmentClick: select
            });
          } else {
            const rows = bd.kind === 'strength'
              ? bd.grips.map(g => ({ label: g.short, values: { [active]: g.clean }, total: g.clean }))
                  .concat(bd.limit.count ? [{ label: 'Limit', values: { [active]: bd.limit.count }, total: bd.limit.count }] : [])
              : bd.rows.map(r => ({ label: shortLabel(r.label), full: r.label, values: { [active]: r.count }, total: r.count }));
            CT.charts.stackedBar(holder, { height: 200, series: [s], categories: rows });
            head.appendChild(el('button', { class: 'btn btn--ghost btn--sm', onclick: () => select(active) },
              [ icon('back'), 'All types' ]));
            head.appendChild(el('span', { class: 'chip', text: s.label }));
          }

          legend.classList.toggle('has-active', !!active);
          CT.ui.clear(legend);
          VOLUME_SERIES.forEach(t => legend.appendChild(el('button', {
            class: 'legend__item', 'aria-pressed': String(active === t.key),
            onclick: () => select(t.key)
          }, [
            el('i', { class: 'legend__sw', style: `background:${t.color}` }),
            t.label
          ])));

          CT.ui.clear(drill);
          if (!active) {
            drill.appendChild(el('p', { class: 'tiny', style: 'margin-top:10px',
              text: 'Tap a type below, or a bar above, to break it down.' }));
            return;
          }
          drill.appendChild(bd.kind === 'strength' ? strengthDrill(s, bd) : modalityDrill(s, bd));
        }
        paint();
      },
      buildTable: n => {
        n.appendChild(el('table', { class: 'table table--rows' }, [
          el('thead', {}, [ el('tr', {}, [
            el('th', { text: 'Week' }), el('th', { class: 'r', text: 'Strength' }),
            el('th', { class: 'r', text: 'Endurance' }), el('th', { class: 'r', text: 'PE' }),
            el('th', { class: 'r', text: 'Total' })
          ]) ]),
          el('tbody', {}, vol.weeks.map(w =>
            el('tr', {}, [
              el('td', { text: 'W' + w.w + ' · ' + dt.mini(w.start) }),
              el('td', { class: 'r', text: String(w.counts.strength) }),
              el('td', { class: 'r', text: String(w.counts.endurance) }),
              el('td', { class: 'r', text: String(w.counts.pe) }),
              el('td', { class: 'r', text: String(w.total) })
            ])
          ))
        ]));
      }
    }));

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
      buildTable: n => {
        const open = date => CT.views.maxHangLog(c, { date });
        n.appendChild(el('table', { class: 'table table--rows' }, [
          el('thead', {}, [ el('tr', {}, [
            el('th', { text: 'Date' }), el('th', { class: 'r', text: 'Three-finger drag' }),
            el('th', { class: 'r', text: 'Half-crimp' }), el('th', {})
          ]) ]),
          el('tbody', {}, c.maxHang.slice().reverse().map(m =>
            el('tr', { tabindex: 0, role: 'button',
              'aria-label': `Test on ${dt.short(m.date)}. Open to edit or delete.`,
              onclick: () => open(m.date),
              onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(m.date); } }
            }, [
              el('td', { text: dt.short(m.date) }),
              el('td', { class: 'r', text: CT.fmtLoad(m.tfd) }),
              el('td', { class: 'r', text: CT.fmtLoad(m.half) }),
              el('td', { class: 'r', style: 'width:28px' }, [ icon('fwd', 'histrow__chev') ])
            ])
          ))
        ]));
        n.appendChild(el('p', { class: 'tiny', style: 'margin-top:12px',
          text: 'Tap a test to change or remove it, or to train from it.' }));
      }
    }));

    /* ── critical force ───────────────────────────────────── */
    wrap.appendChild(cfCard(c));

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
    motion.enter(wrap);
  };

  /* ═══════════════════════════════════════════════════════════
     Critical force.

     The zones lead, because they are the only part of the test an
     athlete can act on: a band of load to pull repeaters at. The
     numbers behind them come second and the decay curve third,
     which is the reverse of how the device presents it and the
     right way round for whoever has to train off it.

     Tested per grip, so grips never share an axis or a headline —
     a half-crimp critical force says nothing about a drag.
     ═══════════════════════════════════════════════════════════ */
  function cfCard(c) {
    const grips = S.cfGrips(c);
    let grip = grips[0] || 'half';
    let showing = null;                 // a specific test, or the latest

    const head = el('div', { class: 'card__hd' });
    const body = el('div', { class: 'card__bd' });
    const card = el('section', { class: 'card' }, [ head, body ]);

    const canUpload = S.isCoach();

    function paint() {
      const runs = CT.cf.series(c.criticalForce, grip);
      const at = showing ? runs.findIndex(t => t.id === showing) : -1;
      const idx = at >= 0 ? at : runs.length - 1;
      const test = runs[idx] || null;
      const prev = idx > 0 ? runs[idx - 1] : null;
      const gripName = CT.cf.gripOf(grip).name;

      CT.ui.clear(head);
      head.appendChild(el('div', {}, [
        el('h3', { class: 'h-card', text: 'Critical force' }),
        el('p', { class: 'sub', style: 'margin-top:2px',
          text: test ? `${gripName} · 7:3 repeaters to failure · tested ${dt.relative(test.date)}`
                     : '7:3 repeaters to failure' })
      ]));
      head.appendChild(el('div', { class: 'card__act row', style: 'gap:9px' }, [
        grips.length > 1 ? el('div', { class: 'seg' }, grips.map(g =>
          el('button', { text: CT.cf.gripOf(g).short, 'aria-pressed': String(g === grip),
            onclick: () => { grip = g; showing = null; paint(); } })
        )) : null,
        canUpload ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => CT.views.cfUpload(c) },
          [ icon('plus'), 'Upload test' ]) : null
      ]));

      CT.ui.clear(body);
      if (!test) {
        body.appendChild(empty('No critical force test yet',
          canUpload ? 'Upload the files off the device and the zones appear here.'
                    : 'The first test sets the band everything else is read against.'));
        return;
      }

      const hands = CT.cf.hands(test);
      const bal = CT.cf.balance(test);

      /* ── the zones, and what to do with them ── */
      const zonePlot = el('div');
      body.appendChild(el('div', { class: 'cfz' }, [
        el('p', { class: 'eyebrow', text: 'Repeaters — what to pull at' }),
        zonePlot,
        el('div', { class: 'cfz__rows' }, hands.map(h => {
          const S_ = CT.charts.HAND[h.hand];
          return el('div', { class: 'cfz__row' }, [
            el('span', { class: 'cfz__dot', style: 'background:' + S_.color }),
            el('p', { class: 'cfz__txt', html:
              `<b>${S_.label} hand</b> — build capacity at <b>${h.zone[0].toFixed(1)}–${h.zone[1].toFixed(1)} kg</b>. ` +
              `Under ${h.zone[0].toFixed(1)} kg is easy aerobic work you could hold all session; ` +
              `above ${h.zone[1].toFixed(1)} kg you're spending reserve rather than building it.` })
          ]);
        }))
      ]));

      /* ── the numbers ── */
      const bw = test.bodyweight;
      body.appendChild(el('dl', { class: 'cfstats' }, hands.map(h => {
        const S_ = CT.charts.HAND[h.hand];
        const was = prev && prev.hands[h.hand];
        const pct = CT.cf.pctBw(h, bw);
        return el('div', { class: 'cfstat' }, [
          el('dt', {}, [ el('i', { class: 'cfstat__dot', style: 'background:' + S_.color }), S_.label + ' hand' ]),
          el('dd', {}, [
            el('div', { class: 'readout' }, [
              counter(h.cf, 1), el('span', { class: 'readout__u', text: 'kg' })
            ]),
            el('p', { class: 'tiny', style: 'margin-top:3px',
              text: pct != null ? pct + '% of bodyweight' : 'bodyweight not recorded' }),
            was ? el('span', { class: 'delta ' + (h.cf >= was.cf ? 'delta--down' : 'delta--up'),
              style: 'margin-top:5px;display:block',
              text: (h.cf > was.cf ? '+' : '') + (h.cf - was.cf).toFixed(1) + ' kg since ' + dt.mini(prev.date) }) : null
          ])
        ]);
      }).concat(bal ? [
        el('div', { class: 'cfstat' }, [
          el('dt', { text: 'Between hands' }),
          el('dd', {}, [
            el('div', { class: 'readout' }, [
              counter(bal.pct, 0), el('span', { class: 'readout__u', text: '%' })
            ]),
            el('p', { class: 'tiny', style: 'margin-top:3px',
              text: bal.pct === 0 ? 'evenly matched'
                : `${bal.weak} is ${bal.gap.toFixed(1)} kg behind` })
          ])
        ])
      ] : [])));

      /* ── the curve it was read off ── */
      const curvePlot = el('div');
      body.appendChild(el('div', { class: 'cfsec' }, [
        el('p', { class: 'eyebrow', text: 'How the force fell away' }),
        curvePlot,
        el('div', { class: 'legend', style: 'margin-top:12px' }, hands.map(h => {
          const S_ = CT.charts.HAND[h.hand];
          return el('span', {}, [
            el('i', { class: S_.dash ? 'dash' : '', style: `color:${S_.color};background:${S_.color}` }),
            `${S_.label} — ${S_.dash ? 'dashed, square markers' : 'solid, round markers'}`
          ]);
        }).concat([
          el('span', {}, [ el('i', { style: 'background:none;border:1.4px solid var(--ink-3);height:8px;width:8px;border-radius:50%' }),
            'Hollow marker — too few samples for the device to trust the rep' ])
        ])),
        el('p', { class: 'tiny', style: 'margin-top:12px;line-height:1.55', text:
          `Force decays toward an asymptote across ${hands[0].reps.length} repeaters. That asymptote is the critical ` +
          `force — the load the fingers can hold more or less indefinitely — and it's averaged from the last ` +
          `${CT.cf.CF_WINDOW} reps, shaded above.` })
      ]));

      /* ── what the device wasn't sure about ── */
      const caveats = CT.cf.caveats(test);
      if (caveats.length) {
        body.appendChild(el('div', { class: 'cfsec' }, [
          el('p', { class: 'eyebrow', text: 'Worth knowing about this test' }),
          el('div', { class: 'stack', style: 'gap:8px' }, caveats.map(cv =>
            el('p', { class: 'cfup__note cfup__note--' + cv.tone }, [
              icon('info', 'cfup__ni'), el('span', { text: cv.text })
            ])
          ))
        ]));
      }

      /* ── across tests, once there is more than one ── */
      if (runs.length > 1) {
        const trendPlot = el('div');
        body.appendChild(el('div', { class: 'cfsec' }, [
          el('p', { class: 'eyebrow', text: 'Across tests' }),
          trendPlot
        ]));
        requestAnimationFrame(() => CT.charts.line(trendPlot, {
          height: 200, unit: ' kg', decimals: 1, directLabel: true,
          series: CT.cf.HANDS.filter(h => runs.some(t => t.hands[h])).map(h => ({
            id: h, name: CT.charts.HAND[h].label, color: CT.charts.HAND[h].color,
            marker: CT.charts.HAND[h].marker, dash: CT.charts.HAND[h].dash,
            points: runs.filter(t => t.hands[h]).map(t => ({ x: t.date, y: t.hands[h].cf }))
          }))
        }));
      }

      /* ── every test on record, and the way out of a bad upload ──
         Coach-side. The athlete's screen shows the latest and the
         trend, which is what training off it needs; picking through
         old tests and deleting them is the coach's job. */
      if (canUpload) {
        body.appendChild(el('div', { class: 'cfsec' }, [
          el('p', { class: 'eyebrow', text: runs.length > 1 ? 'Tests on record' : 'This test' }),
          el('div', { class: 'cflist' }, runs.slice().reverse().map(t => {
            const on = t.id === test.id;
            const files = Object.values(t.source || {}).length;
            return el('div', { class: 'cflist__r' + (on ? ' is-on' : '') }, [
              el('button', { class: 'cflist__pick', 'aria-pressed': String(on),
                onclick: () => { showing = t.id; paint(); } }, [
                el('div', {}, [
                  el('p', { class: 'cflist__d', text: dt.short(t.date) }),
                  el('p', { class: 'tiny', text: CT.cf.hands(t).map(h =>
                    CT.charts.HAND[h.hand].label.toLowerCase() + ' ' + h.cf.toFixed(1) + ' kg').join(' · ') +
                    ` · ${files} file${files === 1 ? '' : 's'}` })
                ]),
                on ? el('span', { class: 'chip chip--spruce', text: 'Showing' }) : null
              ]),
              on ? CT.deleteButton(() => {
                S.deleteCFTest(c, t.id);
                showing = null;
                CT.render(false);
                toast('Test removed', 'Nothing else on the record changes.');
              }, 'Remove') : null
            ]);
          }))
        ]));
      }

      CT.charts.cfZones(zonePlot, test);
      CT.charts.cfCurve(curvePlot, test);
    }

    paint();
    return card;
  }

  /* a number that counts up to itself, the way every other readout
     in the app does */
  function counter(value, decimals) {
    const n = el('span', { class: 'readout__n', style: 'font-size:28px', text: '0' });
    requestAnimationFrame(() => motion.count(n, 0, value, { decimals }));
    return n;
  }

  /* one row per logged session — the way into editing anything historic */
  function histRow(c, s) {
    const T = CT.TYPE[s.type];
    return el('button', {
      class: 'histrow', 'aria-label': `${T.label} on ${dt.short(s.date)}. Open to edit or delete.`,
      onclick: () => CT.openLog(s.type, { sessionId: s.id })
    }, [
      el('span', { class: 'quick__dot quick__dot--' + T.dot }),
      el('div', { class: 'histrow__main' }, [
        el('p', { class: 'histrow__t', text: T.label }),
        el('p', { class: 'histrow__d', text: CT.describe(c, s) })
      ]),
      s.type !== 'strength' ? null
        : S.strengthMode(s) === 'limit'
          ? el('span', { class: 'chip', text: CT.topGrade(s.problems) || 'Limit' })
          : el('div', { class: 'row', style: 'gap:10px' },
              CT.GRIPS.map(g => {
                const reps = S.repsOf(s, g.id);
                if (!reps.length) return null;      // grip not trained that session
                return el('span', { class: 'pips', title: g.name },
                  reps.map(r => el('span', {
                    class: 'pip' + (r ? ' pip--on' : ''),
                    style: r ? '' : 'background:var(--clay-tint);box-shadow:inset 0 0 0 1px var(--clay)'
                  })));
              }).filter(Boolean)),
      el('span', { class: 'histrow__date', text: dt.short(s.date) }),
      icon('fwd', 'histrow__chev')
    ]);
  }
})();
