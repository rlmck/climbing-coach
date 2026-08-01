/* ═══════════════════════════════════════════════════════════════
   views/coach.js — roster at a glance, then straight into a
   client's own screens. Weekly targets are editable here.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast, ring } = CT.ui, S = CT.store, dt = CT.dt;

  CT.views.coach = function (host) {
    const wrap = el('div', { class: 'stack', style: 'gap:14px' });

    wrap.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'card__hd', style: 'padding-bottom:16px' }, [
        el('div', {}, [
          el('h3', { class: 'h-card', text: 'Clients' }),
          el('p', { class: 'sub', style: 'margin-top:2px',
            text: S.clients().length + ' athletes on active blocks' })
        ]),
        el('button', { class: 'card__act btn btn--primary btn--sm', onclick: () => CT.views.onboard() },
          [ icon('plus'), 'Onboard a client' ])
      ]),
      el('div', { style: 'border-top:1px solid var(--line)' }, S.clients().map(clientRow))
    ]));

    S.clients().forEach(c => wrap.appendChild(targetCard(c)));

    host.appendChild(wrap);
    motion.enter(wrap);
  };

  function clientRow(c) {
    const week = S.currentWeek(c), phase = S.phase(c);
    const last = S.lastSession(c);
    const n = S.streak(c), next = S.nextMilestone(n);
    const wp = S.weekProgress(c, week);

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
        wp.hit ? el('span', { class: 'chip chip--spruce', text: 'On target' })
               : el('span', { class: 'chip', text: `${wp.need - wp.have} left` }),
        el('button', { class: 'btn btn--ghost btn--sm', text: 'Open',
          onclick: () => { CT.state.activeClient = c.id; CT.go('dashboard'); } })
      ])
    ]);
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
        toast(`${c.name}: ${name.toLowerCase()} target set to ${nv}`,
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

    return el('section', { class: 'card' }, [
      el('div', { class: 'card__hd' }, [
        el('span', { class: 'client__av', style: 'width:30px;height:30px;font-size:11px', text: c.initials }),
        el('div', {}, [
          el('h3', { class: 'h-card', text: c.name + '’s weekly targets' }),
          el('p', { class: 'sub', style: 'margin-top:2px', text: 'What counts as a complete week' })
        ]),
        el('button', { class: 'card__act btn btn--ghost btn--sm', text: 'View schedule',
          onclick: () => { CT.state.activeClient = c.id; CT.go('schedule'); } })
      ]),
      body,
      el('div', { style: 'padding:13px 20px;border-top:1px solid var(--line);background:var(--surface-2)' }, [ summary ])
    ]);
  }

  function summaryText(c) {
    const t = c.targets;
    const total = t.strength + t.endurance;
    return `A complete week is ${total} sessions in the base phase, ${total + t.pe} once Power Endurance opens in week ${c.block.peFromWeek}.`;
  }
})();
