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
    /* A block that has run out is worth saying out loud. It used to
       show the final week for as long as nobody set up another one,
       which reads like a week that never ends. */
    const done = c.block.end < todayISO;
    const left = dt.diff(c.block.end, todayISO);
    const until = dt.diff(c.block.start, todayISO);
    return el('section', { class: 'card block' }, [
      el('div', { class: 'block__top' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow', text: 'Training block' }),
          el('h2', { class: 'block__title', style: 'margin-top:7px',
            text: pending ? `Starts ${dt.short(c.block.start)}`
                : done ? 'Block finished'
                : `Week ${cur} of ${c.block.weeks}` }),
          el('p', { class: 'block__dates', text: `${dt.short(c.block.start)} — ${dt.short(c.block.end)} · ` +
            (pending ? `${until} ${until === 1 ? 'day' : 'days'} to go`
             : done ? `ended ${dt.relative(c.block.end)}`
             : `${left} days left`) })
        ]),
        el('div', { class: 'block__right' }, done
          ? [ el('span', { class: 'chip', text: 'No block running' }),
              el('p', { class: 'tiny', text: c.isSelf
                ? 'Keep logging — it all still counts. Set up a new block when you know what it’s for.'
                : 'Keep logging — it all still counts toward your loads and your history, until your coach sets up the next one.' }) ]
          : [ el('span', { class: 'chip ' + (phase === 'Power Endurance' ? 'chip--ember' : 'chip--spruce'), text: phase }),
              el('p', { class: 'tiny', text: phase === 'Power Endurance'
                ? 'Sharpening phase — hold strength, add intensity.'
                : `Power Endurance opens in week ${c.block.peFromWeek}.` }) ])
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
      el('div', { class: 'tile__hd' }, [
        el('p', { class: 'eyebrow', text: 'Latest max hang' }),
        el('span', { class: 'card__act row', style: 'gap:12px' }, [
          el('button', { class: 'btn btn--quiet btn--sm', style: 'padding:0 8px',
            'aria-label': 'Log max hang test', title: 'Log a new test',
            onclick: () => CT.views.maxHangLog(c) }, [ icon('plus') ])
        ])
      ]),
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

  function quickLog(c) {
    const b = (type, label, sub) => el('button', {
      class: 'card', style: 'padding:16px 18px;text-align:left;transition:box-shadow .2s,transform .12s',
      onmouseenter(e) { if (motion.on) gsap.to(e.currentTarget, { y: -2, boxShadow: 'var(--sh-2)', duration: .25 }); },
      onmouseleave(e) { if (motion.on) gsap.to(e.currentTarget, { y: 0, boxShadow: 'var(--sh-1)', duration: .25 }); },
      onclick: () => CT.openLog(type, {})
    }, [
      el('div', { class: 'row', style: 'gap:9px;margin-bottom:9px' }, [
        el('span', { class: 'quick__dot quick__dot--' + CT.TYPE[type].dot }),
        el('span', { class: 'eyebrow', text: 'Log' })
      ]),
      el('p', { style: 'font-size:15px;font-weight:600;letter-spacing:-.017em', text: label }),
      el('p', { class: 'tiny', style: 'margin-top:4px', text: sub })
    ]);

    /* All four, whatever week the block is in. Power endurance done
       before the plan asks for it is still power endurance done, and
       climbing nobody asked for is still climbing done. */
    const cards = [
      b('strength', 'Strength', 'Max hangs or limit bouldering'),
      b('endurance', 'Endurance', 'Routes, traversing, edge pulls…'),
      b('pe', 'Power Endurance', S.inPEPhase(c)
        ? '4×4s, wall crawls, repeaters'
        : `4×4s, wall crawls, repeaters — outside the plan until week ${c.block.peFromWeek}`),
      b('climbing', 'Climbing', 'A session on the wall or at the crag')
    ];

    /* Sized by what fits rather than by how many there are: a fourth
       card turned four equal columns into four unreadable ones on a
       phone, and the count is now something this row can survive
       changing. */
    return el('div', { class: 'grid quicklog' }, cards);
  }

  CT.views.dashboard = function (host, c) {
    const wrap = el('div', { class: 'stack', style: 'gap:14px' }, [
      blockCard(c),
      tiles(c),
      /* What the hangboard is asking for, and the way to change it.
         The coach has this on the Clients screen; the athlete needs it
         too, because they are the one who finds out on the wall that
         the number is wrong. */
      el('section', { class: 'card' }, [
        el('div', { class: 'card__bd' }, [ CT.loadsRow(c) ])
      ]),
      el('div', { class: 'sec' }, [
        el('h2', { class: 'h-page', text: S.forOther(c) ? 'Log a session for ' + c.name : 'Log a session' }),
        el('span', { class: 'sec__act tiny', text: 'Today, or any day before it — block or no block' })
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
      /* A grip with no hangs against it wasn't trained, so it is left
         out rather than reported as zero of zero. */
      const parts = CT.GRIPS.map(g => {
        const r = S.repsOf(ses, g.id);
        if (!r.length) return null;
        const w = (ses.weights || {})[g.id];
        return `${g.short} ${w == null ? '' : CT.fmtLoad(w) + ' '}${r.filter(Boolean).length}/${r.length}`;
      }).filter(Boolean);
      return parts.length ? parts.join(' · ') : 'Max hangs';
    }
    const mod = (CT.MODALITIES[ses.type] || []).find(m => m.id === ses.modality);
    const f = ses.fields || {};

    /* which grade ladder this modality counts in, if it counts climbs */
    const climbSpec = CT.climbs.specFor(ses.modality);

    /* "Hangboard" and "Edge pulls" are different exercises sharing one
       modality, so the style leads rather than the modality's name. */
    const head = f.style ? CT.choiceName('edgeStyle', f.style)
               : mod ? mod.name : CT.TYPE[ses.type].label;

    const bits = [];
    if (climbSpec && Array.isArray(f.climbs)) {
      /* Where it was, when the routes say so. A day at the crag is
         better identified by the crag than by anything else on the
         line, so it leads — and a day that wandered to a second one
         is counted rather than named, because a summary that lists
         two crags has no room left for what was climbed at either. */
      const at = CT.climbs.venues(f.climbs);
      if (at.length) bits.push(at[0] + (at.length > 1 ? ' +' + (at.length - 1) : ''));
      const s = CT.climbs.short(f.climbs, climbSpec.set);
      if (s) bits.push(s);
    }
    if (f.metres) bits.push(CT.fmtMetres(f.metres));
    if (f.grip) bits.push(CT.choiceName('grip', f.grip));
    if (f.grade) bits.push(f.grade);
    if (f.load) bits.push(f.load + ' kg');
    if (f.sets) bits.push(f.sets + ' sets');
    /* The rounds carry their own clocks now that the clocks vary —
       "10 rounds" of a minute and "10 rounds" of four are not the same
       session, and the line used to call them the same thing. */
    const rounds = CT.fmtRounds(f.rounds, f.workSec, f.restSec);
    if (rounds) bits.push(rounds);
    if (f.durationSec) bits.push(CT.fmtDuration(f.durationSec));

    /* effort is the one field worth keeping whatever else got trimmed */
    const rpe = CT.rpeValue(f.rpe);
    return [head].concat(bits.filter(Boolean).slice(0, 3))
      .concat(rpe ? ['RPE ' + rpe] : []).join(' · ');
  };
})();
