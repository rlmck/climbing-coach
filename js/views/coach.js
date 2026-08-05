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

    if (CT.repo.enabled) wrap.appendChild(ownTrainingCard(mine));
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
            text: `Week ${week} of ${mine.block.weeks} · ${S.phase(mine)} · ${wp.have} of ${wp.need} this week` })
        ]),
        el('button', { class: 'card__act btn btn--ghost btn--sm', text: 'Open my training',
          onclick: () => { S.setViewing(mine.id); CT.go('dashboard'); } })
      ]),
      el('div', { style: 'padding:13px 20px;border-top:1px solid var(--line);background:var(--surface-2)' }, [
        el('p', { class: 'tiny', text:
          'This is your own dashboard, plan and progress — not a second account. Logging is disabled only while ' +
          'you’re looking at somebody you coach.' })
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
        el('p', { class: 'client__sub', text: `Week ${week} of ${c.block.weeks} · ${phase} · ends ${dt.mini(c.block.end)}` })
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

  function targetCard(c) {
    const rows = [
      ['strength',  'Strength',        'Max hangs — one per week is the floor'],
      ['endurance', 'Endurance',       'Aerobic volume across the week'],
      ['pe',        'Power Endurance', 'Only scheduled in the final 3 weeks']
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
        el('span', { class: 'quick__dot quick__dot--' + (key === 'strength' ? 's' : key === 'pe' ? 'p' : 'e') }),
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
      body, el('div', { class: 'card__bd', style: 'padding-top:0' }, [ loadsRow ]),
      el('div', { style: 'padding:13px 20px;border-top:1px solid var(--line);background:var(--surface-2)' }, [ summary ])
    ]);
  }

  function summaryText(c) {
    const t = c.targets;
    const total = t.strength + t.endurance;
    return `A complete week is ${total} sessions in the base phase, ${total + t.pe} once Power Endurance opens in week ${c.block.peFromWeek}.`;
  }
})();
