/* ═══════════════════════════════════════════════════════════════
   views/coach.js — roster at a glance, then straight into a
   client's own screens. Weekly targets are editable here.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast, ring } = CT.ui, S = CT.store, dt = CT.dt;

  CT.views.coach = function (host) {
    const wrap = el('div', { class: 'stack', style: 'gap:14px' });
    const roster = S.roster();
    const mine = S.selfAthlete();

    wrap.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'card__hd', style: 'padding-bottom:16px' }, [
        el('div', {}, [
          el('h3', { class: 'h-card', text: 'Clients' }),
          el('p', { class: 'sub', style: 'margin-top:2px',
            text: roster.length + ' athletes on active blocks' })
        ]),
        el('button', { class: 'card__act btn btn--primary btn--sm', onclick: () => CT.views.onboard() },
          [ icon('plus'), 'Onboard a client' ])
      ]),
      el('div', { style: 'border-top:1px solid var(--line)' }, roster.length
        ? roster.map(clientRow)
        : [ el('div', { class: 'empty' }, [
            el('h3', { text: 'No athletes yet' }),
            el('p', { text: 'Onboard one and their block, plan and starting loads are set up in a single step.' })
          ]) ])
    ]));

    if (CT.repo.enabled) {
      const nc = nameCard();
      if (nc) wrap.appendChild(nc);
      wrap.appendChild(ownTrainingCard(mine));
    }
    if (mine) wrap.appendChild(targetCard(mine));
    roster.forEach(c => wrap.appendChild(targetCard(c)));

    host.appendChild(wrap);
    motion.enter(wrap);
  };

  /* ── the coach's own block ───────────────────────────────
     Kept out of the roster above, because a coach isn't one of their
     own clients — but built from the same record, so everything the
     app already knows how to do with an athlete works here unchanged. */
  function ownTrainingCard(mine) {
    if (!mine) {
      return el('section', { class: 'card' }, [
        el('div', { class: 'card__hd' }, [
          el('div', {}, [
            el('h3', { class: 'h-card', text: 'Your own training' }),
            el('p', { class: 'sub', style: 'margin-top:2px',
              text: 'Coaches climb too. Give yourself a block and log against it like anyone else.' })
          ]),
          el('button', { class: 'card__act btn btn--ghost btn--sm',
            onclick: () => CT.views.onboard({ self: true }) }, [ icon('plus'), 'Set up my block' ])
        ]),
        el('div', { style: 'padding:13px 20px;border-top:1px solid var(--line);background:var(--surface-2)' }, [
          el('p', { class: 'tiny', text:
            'You pick your own days, dates and starting loads — nobody is prescribing them to you. No code is involved: ' +
            'the record is claimed by this account the moment you make it.' })
        ])
      ]);
    }

    const week = S.currentWeek(mine), wp = S.weekProgress(mine, week);
    return el('section', { class: 'card' }, [
      el('div', { class: 'card__hd' }, [
        el('span', { class: 'client__av', style: 'width:30px;height:30px;font-size:11px', text: mine.initials }),
        el('div', {}, [
          el('h3', { class: 'h-card', text: 'Your own training' }),
          el('p', { class: 'sub', style: 'margin-top:2px',
            text: `Week ${week} of ${mine.block.weeks} · ${S.phase(mine)} · ` +
                  (wp.need ? `${wp.have} of ${wp.need} this week` : 'nothing prescribed this week') })
        ]),
        el('button', { class: 'card__act btn btn--ghost btn--sm', text: 'Open my training',
          onclick: () => { S.setViewing(mine.id); CT.go('dashboard'); } })
      ]),
      el('div', { style: 'padding:13px 20px;border-top:1px solid var(--line);background:var(--surface-2)' }, [
        el('p', { class: 'tiny', text:
          'This is your own dashboard, plan and progress — not a second account. Opening somebody you coach ' +
          'swaps the record underneath those screens; anything logged there is logged as them.' })
      ])
    ]);
  }

  /* ── your own name ───────────────────────────────────────
     A coach's profile is the one account in the app with an address on
     it, and it is created by hand in the Firestore console — which is
     how a display name ends up being whatever was typed at three in
     the morning, or an email local part standing in for a person.
     Every screen that names the coach reads it, and until now there
     was nowhere in the app to change it.

     It writes `users/{uid}`, which the rules already let you edit as
     long as the role stays put — so this can never be a way to become
     something you aren't. Athletes are unaffected: their records carry
     their own names and none of them is denormalised from here. */
  function nameCard() {
    const p = CT.repo.profile;
    if (!p) return null;

    const input = el('input', { class: 'input', type: 'text', maxlength: 40,
      value: p.full || p.name || '', placeholder: 'Coach', oninput: sync });
    const note = el('p', { class: 'tiny' });
    const save = el('button', { class: 'btn btn--primary btn--sm', onclick: commit },
      [ icon('check'), 'Save name' ]);

    function typed() { return input.value.trim(); }

    function sync() {
      const v = typed();
      save.disabled = !v || v === (p.full || p.name);
      note.textContent = !v ? 'A name is what every screen calls you — it can’t be blank.'
        : v === (p.full || p.name) ? `Shown as “${v}” wherever the app names you.`
        : `Will read “${v}” — in the switcher, on the coach note your athletes see, and on this screen.`;
    }

    /* Nothing is awaited: the write goes into the same queue as every
       session logged out of signal, and the name is the app's from the
       moment it is typed. If the server ever refuses it, that arrives
       as its own toast rather than as a button that never came back. */
    function commit() {
      const full = typed();
      if (!full) return;
      CT.repo.saveProfile({ name: full.split(/\s+/)[0], full, initials: CT.initialsOf(full) });
      CT.render(false);
      toast('Name updated', `The app calls you ${full} from here on.`);
    }

    sync();
    return el('section', { class: 'card' }, [
      el('div', { class: 'card__hd' }, [
        el('span', { class: 'client__av', style: 'width:30px;height:30px;font-size:11px',
                     text: CT.world.coach.initials }),
        el('div', {}, [
          el('h3', { class: 'h-card', text: 'Your name' }),
          el('p', { class: 'sub', style: 'margin-top:2px', text: 'What the app calls you' })
        ])
      ]),
      el('div', { class: 'card__bd' }, [
        el('div', { class: 'field' }, [
          el('label', { text: 'Display name' }),
          el('div', { class: 'row', style: 'gap:10px' }, [ input, save ]),
          note
        ])
      ])
    ]);
  }

  function clientRow(c) {
    const week = S.currentWeek(c), phase = S.phase(c);
    const last = S.lastSession(c);
    const n = S.streak(c), next = S.nextMilestone(n);
    const wp = S.weekProgress(c, week);
    const waiting = CT.repo.enabled && !c.clientUid;

    return el('div', { class: 'client' }, [
      el('span', { class: 'client__av', text: c.initials }),
      el('div', {}, [
        el('p', { class: 'client__name', text: c.full }),
        el('p', { class: 'client__sub', text: `Week ${week} of ${c.block.weeks} · ${phase} · peaks ${dt.mini(S.peakDate(c))}` })
      ]),
      el('dl', { class: 'kv' }, [
        el('dt', { text: 'This week' }),
        el('dd', { text: `${wp.have} / ${wp.need}` })
      ]),
      el('dl', { class: 'kv' }, [
        el('dt', { text: 'Streak' }),
        el('dd', { text: n + (n === 1 ? ' wk' : ' wks') })
      ]),
      el('dl', { class: 'kv' }, [
        el('dt', { text: 'Last session' }),
        el('dd', { text: last ? dt.relative(last.date) : '—' })
      ]),
      el('div', { class: 'row', style: 'gap:8px' }, [
        /* An athlete who hasn't typed their code yet has no history to
           be on target with, so the code is the more useful thing to
           show — and it's the thing the coach is about to be asked for. */
        waiting
          ? el('button', { class: 'chip chip--code', title: 'Their code',
              onclick: () => CT.views.inviteCode(c) },
              [ c.invitePin || 'No code' ])
          : wp.hit ? el('span', { class: 'chip chip--spruce', text: 'On target' })
                   : el('span', { class: 'chip', text: `${wp.need - wp.have} left` }),
        /* A block set up for yourself through the ordinary onboarding
           form is an athlete record nobody has claimed, sitting in the
           roster as if it were a client. Saying so puts it where it
           belongs — under your own view — without touching a single
           session on it. */
        waiting ? CT.armButton(() => claimSelf(c), 'This is me',
            'Tap again — it leaves the roster', 'btn btn--quiet btn--sm', 'check') : null,
        CT.repo.enabled && !waiting
          ? el('button', { class: 'btn btn--quiet btn--sm', text: 'Access',
              onclick: () => CT.views.inviteCode(c) })
          : null,
        el('button', { class: 'btn btn--ghost btn--sm', text: 'Open',
          onclick: () => { S.setViewing(c.id); CT.go('dashboard'); } })
      ])
    ]);
  }

  /* Claiming a record as your own. Nothing about the training moves —
     the only thing that changes is who holds it, and it was already
     only ever you. Any code still outstanding is withdrawn with it,
     since there is nobody left to hand it to. */
  async function claimSelf(c) {
    try {
      await CT.repo.claimSelf(c.id);
    } catch (e) {
      toast('Couldn’t claim that record', CT.fb.message(e));
      return;
    }
    c.isSelf = true;
    c.clientUid = CT.repo.user ? CT.repo.user.uid : null;
    c.invitePin = null;
    S.setViewing(c.id);
    CT.render(false);
    toast('That’s your training now', `${c.full} is off the roster and under your own view.`);
  }

  /* The three the block is built from. Climbing is a fourth kind of
     session and deliberately not a fourth row: it has no target because
     nobody prescribes going climbing, and a stepper here would invite
     a coach to set one and then wonder why the week never counted it. */
  function targetCard(c) {
    const rows = [
      ['strength',  'Strength',        'Max hangs — one per week is the floor'],
      ['endurance', 'Endurance',       'Aerobic volume across the week'],
      ['pe',        'Power Endurance', 'Only scheduled in the four weeks before the rest']
    ];

    const body = el('div', { class: 'card__bd' }, rows.map(([key, name, desc]) => {
      const val = el('span', { text: String(c.targets[key]) });
      const set = d => {
        const nv = Math.max(0, Math.min(7, c.targets[key] + d));
        if (nv === c.targets[key]) return;
        S.setTarget(c, key, nv);
        val.textContent = String(nv);
        motion.pop(val, .7);
        summary.textContent = summaryText(c);
        toast(`${c.isSelf ? 'Your' : c.name + '’s'} ${name.toLowerCase()} target set to ${nv}`,
              'The plan updated from this week onwards. Logged sessions stay put.');
      };
      return el('div', { class: 'target' }, [
        el('span', { class: 'quick__dot quick__dot--' + CT.TYPE[key].dot }),
        el('div', {}, [
          el('p', { class: 'target__n', text: name }),
          el('p', { class: 'target__d', text: desc })
        ]),
        el('div', { class: 'stepper' }, [
          el('button', { onclick: () => set(-1), 'aria-label': `Fewer ${name} sessions` }, [ icon('minus') ]),
          val,
          el('button', { onclick: () => set(1), 'aria-label': `More ${name} sessions` }, [ icon('plus') ])
        ])
      ]);
    }));

    const summary = el('p', { class: 'tiny', text: summaryText(c) });

    /* The date the whole block is aimed at, and the only handle on its
       length. It sits with the weekly targets because it is the same
       question at a different scale: what the week asks for, and how
       many weeks are left to ask it in. */
    const peakRow = peakControl(c, () => { summary.textContent = summaryText(c); });

    /* The hangboard's prescribed load, and the max it is a share of.
       Kept next to the weekly targets because it is the other half of
       the same question: what the week asks for, and how heavy. */
    const loadsRow = CT.loadsRow(c);

    return el('section', { class: 'card' }, [
      el('div', { class: 'card__hd' }, [
        el('span', { class: 'client__av', style: 'width:30px;height:30px;font-size:11px', text: c.initials }),
        el('div', {}, [
          el('h3', { class: 'h-card', text: c.isSelf ? 'Your weekly targets' : c.name + '’s weekly targets' }),
          el('p', { class: 'sub', style: 'margin-top:2px', text: 'What counts as a complete week' })
        ]),
        el('button', { class: 'card__act btn btn--ghost btn--sm', text: 'View schedule',
          onclick: () => { S.setViewing(c.id); CT.go('schedule'); } })
      ]),
      body, el('div', { class: 'card__bd', style: 'padding-top:0' }, [ peakRow, loadsRow ]),
      el('div', { style: 'padding:13px 20px;border-top:1px solid var(--line);background:var(--surface-2)' }, [ summary ])
    ]);
  }

  /* ── the day the block is for ────────────────────────────
     A coach picks the date first — the trip, the comp, the weekend the
     conditions come good — and the length of the block is whatever fits
     in front of it. So this asks for the peak and lets `weeks` fall out,
     rather than asking for a number of weeks and making somebody count
     backwards on a calendar.

     Mondays only, because a block runs Monday to Sunday and a peak
     mid-week would leave the phases straddling two of them. Anything
     else typed snaps to the nearest one, visibly, in the box — a date
     silently corrected by three days is a date nobody trusts again. */
  function peakControl(c, onChange) {
    const min = dt.addISO(c.block.start, CT.BLOCK.minWeeks * 7);
    const max = dt.addISO(c.block.start, CT.BLOCK.maxWeeks * 7);
    const desc = el('p', { class: 'target__d' });

    const input = el('input', {
      class: 'input', type: 'date', min, max, value: S.peakDate(c),
      style: 'width:auto;margin-left:auto;flex:none',
      'aria-label': (c.isSelf ? 'Your' : c.name + '’s') + ' peak date',
      onchange: e => commit(e.target.value)
    });

    function say() {
      const peak = S.peakDate(c);
      desc.textContent = `${dt.short(peak)} · ${c.block.weeks} weeks · Power Endurance from week ` +
        `${S.peFromWeek(c)}, week ${S.restFromWeek(c)} rest`;
      input.value = peak;
    }
    say();

    function commit(raw) {
      if (!raw) { say(); return; }
      /* Snapped to a Monday, then held inside the range a block can be.
         The box is rewritten with the answer either way, so a date that
         was moved is a date you can see was moved. */
      let want = dt.nearestMonday(raw);
      if (want < min) want = min;
      if (want > max) want = max;
      const moved = want !== raw;

      const was = c.block.weeks;
      const weeks = S.setPeak(c, want);

      /* Nothing to say when nothing changed — unless what was typed was
         moved to get there, in which case silence looks like the box
         ignoring you. */
      if (weeks == null) {
        say();
        if (moved) toast('Left where it was', `A block runs ${CT.BLOCK.minWeeks} to ${CT.BLOCK.maxWeeks} ` +
          `weeks from ${dt.short(c.block.start)}, and peaks on a Monday. ${dt.short(want)} is where it ` +
          `already peaks.`);
        return;
      }

      say();
      onChange();
      CT.render(false);
      toast(`${c.isSelf ? 'Your block' : c.name + '’s block'} peaks ${dt.short(want)}`,
        `${weeks} weeks, ${weeks > was ? 'longer' : 'shorter'} than before${moved ? ' — Mondays only' : ''}. ` +
        `Power Endurance now runs weeks ${S.peFromWeek(c)} to ${S.restFromWeek(c) - 1}, then week ` +
        `${S.restFromWeek(c)} is rest. Logged sessions stay exactly where they are.`);
    }

    return el('div', { class: 'target' }, [
      el('span', { class: 'quick__dot quick__dot--p' }),
      el('div', {}, [ el('p', { class: 'target__n', text: 'Peaks on' }), desc ]),
      input
    ]);
  }

  function summaryText(c) {
    const t = c.targets;
    const total = t.strength + t.endurance;
    return `A complete week is ${total} sessions in the base phase, ${total + t.pe} once Power Endurance opens ` +
           `in week ${S.peFromWeek(c)}. Week ${S.restFromWeek(c)} prescribes nothing at all — it is the rest ` +
           `week before ${dt.short(S.peakDate(c))}.`;
  }
})();
