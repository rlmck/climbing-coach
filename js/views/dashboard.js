/* ═══════════════════════════════════════════════════════════════
   views/dashboard.js — the client's home. Block state, week
   targets, and the shortest possible path into a log.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, ring } = CT.ui, S = CT.store, dt = CT.dt;

  /* ── the block ribbon: one segment per week, tinted for phase ── */
  function ribbon(c) {
    const cur = S.currentWeek(c), todayISO = dt.iso(dt.today());
    const weeks = [];
    for (let w = 1; w <= c.block.weeks; w++) {
      const isPE  = w >= c.block.peFromWeek;
      const isNow = w === cur;
      const start = S.weekStart(c, w);
      const prog  = S.weekProgress(c, w);
      const fill  = w < cur ? (prog.hit ? 1 : Math.max(0.12, prog.pct))
                  : w > cur ? 0
                  : Math.max(0.06, prog.pct);
      const bar = el('span', { class: 'ribbon__bar' }, [ el('i') ]);
      const wk = el('div', {
        class: 'ribbon__wk' + (isPE ? ' ribbon__wk--pe' : '') + (isNow ? ' ribbon__wk--now' : ''),
        title: `Week ${w} · ${S.phaseOfWeek(c, w)} · ${dt.mini(start)} · ${prog.have}/${prog.need} sessions`
      }, [ bar, el('span', { class: 'ribbon__lbl', text: 'W' + w }) ]);
      wk._fill = fill;
      weeks.push(wk);
    }

    const wrap = el('div', {}, [
      el('div', { class: 'ribbon' }, weeks),
      el('div', { class: 'ribbon__legend' }, [
        el('span', {}, [ el('i', { style: 'background:var(--ink-4)' }), 'Base' ]),
        el('span', {}, [ el('i', { style: 'background:#DCB08A' }), 'Power Endurance · final 3 weeks' ]),
        el('span', {}, [ el('i', { style: 'background:var(--spruce)' }), 'This week' ])
      ])
    ]);

    requestAnimationFrame(() => {
      weeks.forEach((w, i) => {
        const bar = w.querySelector('i');
        if (!motion.on) { bar.style.transform = `scaleX(${w._fill})`; return; }
        gsap.fromTo(bar, { scaleX: 0 }, { scaleX: w._fill, duration: .7, delay: 0.06 + i * 0.035, ease: 'power3.out' });
      });
    });
    return wrap;
  }

  function blockCard(c) {
    const cur = S.currentWeek(c), phase = S.phase(c);
    const todayISO = dt.iso(dt.today());
    const pending = c.block.start > todayISO;
    const left = dt.diff(c.block.end, todayISO);
    const until = dt.diff(c.block.start, todayISO);
    return el('section', { class: 'card block' }, [
      el('div', { class: 'block__top' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow', text: 'Training block' }),
          el('h2', { class: 'block__title', style: 'margin-top:7px',
            text: pending ? `Starts ${dt.short(c.block.start)}` : `Week ${cur} of ${c.block.weeks}` }),
          el('p', { class: 'block__dates', text: `${dt.short(c.block.start)} — ${dt.short(c.block.end)} · ` +
            (pending ? `${until} ${until === 1 ? 'day' : 'days'} to go` : `${left} days left`) })
        ]),
        el('div', { class: 'block__right' }, [
          el('span', { class: 'chip ' + (phase === 'Power Endurance' ? 'chip--ember' : 'chip--spruce'), text: phase }),
          el('p', { class: 'tiny', text: phase === 'Power Endurance'
            ? 'Sharpening phase — hold strength, add intensity.'
            : `Power Endurance opens in week ${c.block.peFromWeek}.` })
        ])
      ]),
      ribbon(c)
    ]);
  }

  /* ── tiles ─────────────────────────────────────────────── */
  function tiles(c) {
    const n = S.streak(c), next = S.nextMilestone(n);
    const bw = S.bodyweightTrend(c);
    const mh = S.latestMaxHang(c);
    const wp = S.weekProgress(c, S.currentWeek(c));

    const streakTile = el('article', { class: 'card tile' }, [
      el('div', { class: 'tile__hd' }, [ el('p', { class: 'eyebrow', text: 'Streak' }) ]),
      el('div', { class: 'tile__body' }, [
        ring(next ? Math.min(1, n / next) : 1, n),
        el('div', {}, [
          el('p', { style: 'font-size:14.5px;font-weight:550;letter-spacing:-.015em',
                    text: n === 0 ? 'No full weeks yet' : n === 1 ? '1 week on target' : `${n} weeks on target` }),
          el('p', { class: 'tile__meta', text: wp.hit
            ? 'This week is already in the bag.'
            : `${wp.need - wp.have} more ${wp.need - wp.have === 1 ? 'session' : 'sessions'} ` +
              (n === 0 ? 'starts it off.' : 'keeps it going.') })
        ])
      ]),
      next ? el('p', { class: 'tile__meta', text: `Next mark at ${next} weeks.` }) : null
    ]);

    const series = c.bodyweight.map(b => b.kg);
    const bwNum = el('span', { class: 'readout__n', text: bw.empty ? '—' : bw.latest.toFixed(1) });
    const bwTile = el('article', { class: 'card tile', data: { tile: 'bodyweight' } }, [
      el('div', { class: 'tile__hd' }, [
        el('p', { class: 'eyebrow', text: 'Bodyweight' }),
        el('span', { class: 'card__act row', style: 'gap:12px' }, [
          series.length > 1 ? CT.charts.spark(series, 'var(--ink-4)') : null,
          el('button', { class: 'btn btn--quiet btn--sm', style: 'padding:0 8px',
            'aria-label': 'Log bodyweight', title: 'Log a new reading',
            onclick: () => CT.views.weightLog(c) }, [ icon('plus') ])
        ])
      ]),
      el('div', { class: 'tile__body' }, [
        el('div', { class: 'readout' }, [ bwNum, el('span', { class: 'readout__u', text: 'kg' }) ]),
        bw.empty || bw.single ? null
          : el('span', { class: 'delta ' + (bw.delta <= 0 ? 'delta--down' : 'delta--up'),
                         text: (bw.delta > 0 ? '+' : '') + bw.delta.toFixed(1) + ' kg' })
      ]),
      el('p', { class: 'tile__meta', text: bw.empty ? 'No readings yet. Add one whenever you weigh in.'
                                        : bw.single ? `First reading, ${dt.relative(bw.since)}.`
                                        : `Since ${dt.mini(bw.since)} · ${c.bodyweight.length} readings` })
    ]);

    const hangTile = el('article', { class: 'card tile' }, [
      el('div', { class: 'tile__hd' }, [ el('p', { class: 'eyebrow', text: 'Latest max hang' }) ]),
      mh
        ? el('div', { style: 'display:flex;gap:26px' }, CT.GRIPS.map(g =>
            el('div', {}, [
              el('div', { class: 'readout' }, [
                el('span', { class: 'readout__n', style: 'font-size:26px', text: '+' + mh[g.id].toFixed(1) }),
                el('span', { class: 'readout__u', text: 'kg' })
              ]),
              el('p', { class: 'tile__meta', style: 'margin-top:6px', text: g.short })
            ])
          ))
        : el('div', { class: 'readout' }, [
            el('span', { class: 'readout__n', style: 'font-size:26px;color:var(--ink-4)', text: '—' })
          ]),
      el('p', { class: 'tile__meta', text: mh ? `Tested ${dt.relative(mh.date)} · 20 mm edge, 7 s`
                                              : 'No test on record yet.' })
    ]);

    return el('div', { class: 'tiles' }, [ streakTile, bwTile, hangTile ]);
  }

  /* ── this week ─────────────────────────────────────────── */
  function weekCard(c) {
    const cur = S.currentWeek(c);
    const slots = S.slotsInWeek(c, cur);
    const wp = S.weekProgress(c, cur);
    const todayISO = dt.iso(dt.today());

    const rows = slots.map(slot => {
      const status = S.slotStatus(c, slot);
      const T = CT.TYPE[slot.type];
      const isToday = slot.date === todayISO;
      const ses = slot.sessionId && S.session(c, slot.sessionId);

      let detail = T.detail;
      if (status === 'completed' && ses) detail = CT.describe(c, ses);
      else if (status === 'missed') detail = 'Not logged';
      else if (slot.type === 'strength') detail = `+${c.prescribed.tfd} kg drag · +${c.prescribed.half} kg half-crimp`;

      return el('div', { class: 'plan__row' + (status === 'completed' ? ' plan__row--done'
                                            : status === 'missed' ? ' plan__row--missed' : '') }, [
        el('span', { class: 'plan__day', text: isToday ? 'Today' : dt.dow(slot.date) + ' ' + dt.parse(slot.date).getDate() }),
        el('span', { class: 'plan__mark' }, [ icon('check') ]),
        el('div', {}, [
          el('p', { class: 'plan__name', text: T.label }),
          el('p', { class: 'plan__detail', text: detail })
        ]),
        el('div', { class: 'plan__act' }, [
          status === 'completed'
            ? el('button', { class: 'btn btn--ghost btn--sm', text: 'Edit',
                onclick: () => CT.openLog(slot.type, { sessionId: slot.sessionId }) })
            : el('button', { class: 'btn btn--ghost btn--sm',
                onclick: () => CT.openLog(slot.type, { date: slot.date, slotId: slot.id }),
                text: status === 'missed' ? 'Log it late' : 'Log' })
        ])
      ]);
    });

    return el('section', { class: 'card' }, [
      el('div', { class: 'card__hd', style: 'padding-bottom:14px' }, [
        el('div', {}, [
          el('h3', { class: 'h-card', text: 'This week' }),
          el('p', { class: 'sub', style: 'margin-top:2px',
            text: `Target ${c.targets.strength} Strength · ${c.targets.endurance} Endurance` +
                  (S.inPEPhase(c) ? ` · ${c.targets.pe} Power Endurance` : '') })
        ]),
        el('span', { class: 'card__act chip ' + (wp.hit ? 'chip--spruce' : ''),
                     text: `${wp.have} / ${wp.need} done` })
      ]),
      el('div', { class: 'plan', style: 'border-top:1px solid var(--line)' }, rows.length ? rows : [
        el('div', { class: 'empty' }, [ el('h3', { text: 'Nothing scheduled this week' }) ])
      ]),
      !S.inPEPhase(c) ? el('p', { class: 'tiny', style: 'padding:13px 20px;border-top:1px solid var(--line)',
        text: `Power Endurance sessions are held back until week ${c.block.peFromWeek} — the final 3 weeks of the block.` }) : null
    ]);
  }

  function quickLog(c) {
    const b = (type, label, sub) => el('button', {
      class: 'card', style: 'padding:16px 18px;text-align:left;transition:box-shadow .2s,transform .12s',
      onmouseenter(e) { if (motion.on) gsap.to(e.currentTarget, { y: -2, boxShadow: 'var(--sh-2)', duration: .25 }); },
      onmouseleave(e) { if (motion.on) gsap.to(e.currentTarget, { y: 0, boxShadow: 'var(--sh-1)', duration: .25 }); },
      onclick: () => CT.openLog(type, {})
    }, [
      el('div', { class: 'row', style: 'gap:9px;margin-bottom:9px' }, [
        el('span', { class: 'quick__dot quick__dot--' + (type === 'strength' ? 's' : type === 'pe' ? 'p' : 'e') }),
        el('span', { class: 'eyebrow', text: 'Log' })
      ]),
      el('p', { style: 'font-size:15px;font-weight:600;letter-spacing:-.017em', text: label }),
      el('p', { class: 'tiny', style: 'margin-top:4px', text: sub })
    ]);

    const cards = [
      b('strength', 'Strength', 'Max hangs or limit bouldering'),
      b('endurance', 'Endurance', 'Routes, traversing, edge pulls…')
    ];
    if (S.inPEPhase(c)) cards.push(b('pe', 'Power Endurance', '4×4s, wall crawls, repeaters'));

    return el('div', { class: 'grid', style: `grid-template-columns:repeat(${cards.length},1fr)` }, cards);
  }

  CT.views.dashboard = function (host, c) {
    const wrap = el('div', { class: 'stack', style: 'gap:14px' }, [
      blockCard(c),
      tiles(c),
      weekCard(c),
      el('div', { class: 'sec' }, [
        el('h2', { class: 'h-page', text: 'Log a session' }),
        el('span', { class: 'sec__act tiny', text: `Today, or any past date back to ${dt.mini(c.block.start)}` })
      ]),
      quickLog(c),
      /* A note from your coach, unless you are your coach — then it is
         just something you wrote to yourself when you set the block up */
      c.coachNote ? el('div', { class: 'card', style: 'padding:16px 20px;display:flex;gap:12px;align-items:flex-start' }, [
        el('span', { class: 'who__av', text: CT.world.coach.initials }),
        el('div', {}, [
          el('p', { class: 'eyebrow', text: c.isSelf ? 'Note to yourself' : 'Note from ' + CT.world.coach.name }),
          el('p', { style: 'font-size:14.5px;margin-top:6px;line-height:1.5', text: c.coachNote })
        ])
      ]) : null
    ]);
    host.appendChild(wrap);
    motion.enter(wrap);
  };

  /* one-line description of a logged session, reused by schedule + coach views */
  CT.describe = function (c, ses) {
    if (ses.type === 'strength') {
      if (S.strengthMode(ses) === 'limit') {
        const ps = ses.problems || [];
        const tries = ps.reduce((a, p) => a + p.attempts, 0);
        const sent = ps.filter(p => p.sent).length;
        return ['Limit bouldering', CT.topGrade(ps), `${tries} ${tries === 1 ? 'attempt' : 'attempts'}`,
                sent ? `${sent} sent` : null].filter(Boolean).join(' · ');
      }
      const parts = CT.GRIPS.map(g => {
        const r = ses.reps[g.id];
        return `${g.short} +${ses.weights[g.id]} kg ${r.filter(Boolean).length}/${r.length}`;
      });
      return parts.join(' · ');
    }
    const mod = (CT.MODALITIES[ses.type] || []).find(m => m.id === ses.modality);
    const form = CT.FORMS[ses.modality] || [];
    const f = ses.fields || {};

    /* which grade ladder this modality counts in, if it counts climbs */
    const climbSpec = form.find(x => x[2] === 'climbs');

    /* "Hangboard" and "Edge pulls" are different exercises sharing one
       modality, so the style leads rather than the modality's name. */
    const head = f.style ? CT.choiceName('edgeStyle', f.style)
               : mod ? mod.name : CT.TYPE[ses.type].label;

    const bits = [];
    if (climbSpec && Array.isArray(f.climbs)) {
      const s = CT.climbs.short(f.climbs, climbSpec[3]);
      if (s) bits.push(s);
    }
    if (f.grip) bits.push(CT.choiceName('grip', f.grip));
    if (f.grade) bits.push(f.grade);
    if (f.load) bits.push(f.load + ' kg');
    if (f.sets) bits.push(f.sets + ' sets');
    if (f.rounds) bits.push(f.rounds + ' rounds');
    if (f.durationSec) bits.push(CT.fmtDuration(f.durationSec));

    /* effort is the one field worth keeping whatever else got trimmed */
    const rpe = CT.rpeValue(f.rpe);
    return [head].concat(bits.filter(Boolean).slice(0, 3))
      .concat(rpe ? ['RPE ' + rpe] : []).join(' · ');
  };
})();
