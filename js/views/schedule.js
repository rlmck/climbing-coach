/* ═══════════════════════════════════════════════════════════════
   views/schedule.js — the week grid. Sessions are draggable
   between days (arrow keys work too); guidance is inline and
   never blocks a move.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast } = CT.ui, S = CT.store, dt = CT.dt;
  const hasDrag = !!(window.Draggable && motion.on);
  const hasFlip = !!(window.Flip && motion.on);

  CT.views.schedule = function (host, c) {
    const shell = el('div', { class: 'stack', style: 'gap:14px' });
    host.appendChild(shell);

    let week = Math.max(1, Math.min(c.block.weeks, S.currentWeek(c) + CT.state.weekOffset));
    let draggables = [];

    function killDrag() { draggables.forEach(d => d.kill()); draggables = []; }

    function dayUnderPointer(x, y) {
      return CT.ui.$$('.day', shell).find(d => {
        const r = d.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      });
    }

    /* move + animate, shared by drag and keyboard */
    function relocate(slotId, toISO, announce) {
      const before = hasFlip ? Flip.getState(CT.ui.$$('.slot', shell)) : null;
      S.moveSlot(c, slotId, toISO);
      render();
      if (before) Flip.from(before, { duration: .55, ease: 'power3.inOut', absolute: true,
        onEnter: els => gsap.fromTo(els, { opacity: 0, scale: .9 }, { opacity: 1, scale: 1, duration: .35 }) });
      const moved = CT.ui.$(`[data-slot="${slotId}"]`, shell);
      if (moved) { moved.focus({ preventScroll: true }); }
      if (announce) toast('Moved to ' + dt.short(toISO), 'Your coach sees the change straight away.');
    }

    function slotNode(slot) {
      const status = S.slotStatus(c, slot);
      const T = CT.TYPE[slot.type];
      const ses = slot.sessionId && S.session(c, slot.sessionId);
      const locked = status === 'completed';

      const node = el('div', {
        class: 'slot slot--' + slot.type + (locked ? ' slot--done' : status === 'missed' ? ' slot--missed' : ''),
        data: { slot: slot.id, flipId: slot.id },
        tabindex: 0,
        role: 'button',
        'aria-label': `${T.label}, ${dt.short(slot.date)}, ${status}` +
          (locked ? '. Open to edit or delete it.' : '. Use left and right arrow keys to move it a day.'),
        title: locked ? 'Open to edit or delete' : 'Drag to another day, or use ← →'
      }, [
        el('span', { class: 'slot__bar' }),
        locked ? icon('check', 'slot__tick') : null,
        el('p', { class: 'slot__type', text: T.short }),
        el('p', { class: 'slot__meta', text: locked && ses ? shortDesc(ses)
                                        : status === 'missed' ? 'Missed'
                                        : slot.type === 'strength' ? `+${c.prescribed.tfd}/${c.prescribed.half} kg` : T.detail })
      ]);
      node.setAttribute('data-flip-id', slot.id);

      if (locked) {
        const open = () => CT.openLog(slot.type, { sessionId: slot.sessionId });
        node.addEventListener('click', open);
        node.addEventListener('keydown', ev => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
        });
      } else {
        node.addEventListener('keydown', ev => {
          if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
          ev.preventDefault();
          const to = dt.addISO(slot.date, ev.key === 'ArrowRight' ? 1 : -1);
          const wkStart = S.weekStart(c, week);
          if (to < wkStart || to > dt.addISO(wkStart, 6)) return;
          relocate(slot.id, to, false);
        });
        node.addEventListener('dblclick', () => CT.openLog(slot.type, { date: slot.date, slotId: slot.id }));
      }
      return node;
    }

    function shortDesc(ses) {
      if (ses.type === 'strength') {
        if (S.strengthMode(ses) === 'limit') {
          const ps = ses.problems || [];
          const tries = ps.reduce((a, p) => a + p.attempts, 0);
          return [CT.topGrade(ps), tries + ' tries'].filter(Boolean).join(' · ');
        }
        const total = CT.GRIPS.reduce((a, g) => a + ses.reps[g.id].filter(Boolean).length, 0);
        return total + '/6 clean';
      }
      const mod = (CT.MODALITIES[ses.type] || []).find(m => m.id === ses.modality);
      return mod ? mod.name : 'Logged';
    }

    function render() {
      killDrag();
      CT.ui.clear(shell);

      const wkStart = S.weekStart(c, week);
      const todayISO = dt.iso(dt.today());
      const phase = S.phaseOfWeek(c, week);
      const prog = S.weekProgress(c, week);
      const nudges = S.weekNudges(c, week);

      /* header */
      shell.appendChild(el('div', { class: 'card', style: 'padding:16px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap' }, [
        el('div', { class: 'row', style: 'gap:2px' }, [
          navBtn('back', week <= 1, () => { week--; CT.state.weekOffset = week - S.currentWeek(c); render(); }),
          navBtn('fwd', week >= c.block.weeks, () => { week++; CT.state.weekOffset = week - S.currentWeek(c); render(); })
        ]),
        el('div', {}, [
          el('h2', { class: 'h-card', text: `Week ${week} of ${c.block.weeks}` }),
          el('p', { class: 'block__dates', text: `${dt.short(wkStart)} — ${dt.short(dt.addISO(wkStart, 6))}` })
        ]),
        el('span', { class: 'chip ' + (phase === 'Power Endurance' ? 'chip--ember' : 'chip--spruce'), text: phase }),
        el('span', { class: 'chip' + (prog.hit ? ' chip--ink' : ''), text: `${prog.have}/${prog.need} done` }),
        el('div', { style: 'margin-left:auto;display:flex;gap:8px' }, [
          week !== S.currentWeek(c)
            ? el('button', { class: 'btn btn--ghost btn--sm', text: 'This week',
                onclick: () => { week = S.currentWeek(c); CT.state.weekOffset = 0; render(); } })
            : null
        ])
      ]));

      /* nudges — soft, inline, dismissible by ignoring them */
      nudges.forEach(n => shell.appendChild(el('div', { class: 'nudge' }, [
        icon(n.tone === 'warn' ? 'clock' : 'info'),
        el('p', { html: n.text })
      ])));

      /* the grid */
      const grid = el('div', { class: 'week' });
      for (let i = 0; i < 7; i++) {
        const date = dt.addISO(wkStart, i);
        const isToday = date === todayISO;
        const past = date < todayISO;
        const day = el('div', {
          class: 'day' + (isToday ? ' day--today' : past ? ' day--past' : ' day--future'),
          data: { date }
        }, [
          el('div', { class: 'day__hd' }, [
            el('span', { class: 'day__dow', text: isToday ? 'Today' : dt.dow(date) }),
            el('span', { class: 'day__num', text: String(dt.parse(date).getDate()) })
          ])
        ]);
        S.slotsOn(c, date).forEach(s => day.appendChild(slotNode(s)));

        if (!past || isToday) {
          day.appendChild(el('button', {
            class: 'btn btn--quiet btn--sm', style: 'width:100%;justify-content:center;color:var(--ink-4);margin-top:auto',
            title: 'Log a session on ' + dt.short(date),
            onclick: () => CT.openLog(null, { date })
          }, [ icon('plus') ]));
        }
        grid.appendChild(day);
      }
      shell.appendChild(grid);

      shell.appendChild(el('div', { class: 'card', style: 'padding:14px 20px;display:flex;gap:22px;flex-wrap:wrap;align-items:center' }, [
        legend('var(--spruce-tint)', 'var(--spruce)', 'Completed'),
        legend('var(--surface-2)', 'var(--line-2)', 'Suggested'),
        legend('transparent', 'var(--line-2)', 'Missed'),
        el('p', { class: 'tiny', style: 'margin-left:auto',
          text: hasDrag ? 'Drag to move · ← → when focused · tap a completed session to edit it'
                        : 'Focus a session and use ← → to move it · tap a completed one to edit' })
      ]));

      motion.enter(shell);
      if (hasDrag) setupDrag();
    }

    function legend(bg, bar, label) {
      return el('span', { class: 'row', style: 'gap:8px;font-size:12.5px;color:var(--ink-2)' }, [
        el('span', { style: `width:22px;height:14px;border-radius:5px;background:${bg};box-shadow:inset 0 0 0 1px ${bar}` }),
        label
      ]);
    }

    function navBtn(dir, disabled, fn) {
      return el('button', {
        class: 'btn btn--quiet btn--sm', disabled: disabled || null, onclick: fn,
        'aria-label': dir === 'back' ? 'Previous week' : 'Next week',
        style: disabled ? 'opacity:.35;cursor:not-allowed' : ''
      }, [ icon(dir) ]);
    }

    function setupDrag() {
      CT.ui.$$('.slot', shell).forEach(node => {
        if (node.classList.contains('slot--done')) return;
        const slotId = node.dataset.slot;
        draggables.push(Draggable.create(node, {
          type: 'x,y',
          zIndexBoost: false,
          cursor: 'grab',
          activeCursor: 'grabbing',
          onDragStart() {
            node.classList.add('is-dragging');
            gsap.to(node, { scale: 1.04, rotate: -1, duration: .2 });
          },
          onDrag() {
            const target = dayUnderPointer(this.pointerX, this.pointerY);
            CT.ui.$$('.day', shell).forEach(d => d.classList.toggle('is-drop', d === target && d.dataset.date !== originDate()));
          },
          onDragEnd() {
            const target = dayUnderPointer(this.pointerX, this.pointerY);
            CT.ui.$$('.day', shell).forEach(d => d.classList.remove('is-drop'));
            node.classList.remove('is-dragging');
            gsap.to(node, { scale: 1, rotate: 0, duration: .2 });
            if (!target || target.dataset.date === originDate()) {
              gsap.to(node, { x: 0, y: 0, duration: .45, ease: 'power3.out' });
              return;
            }
            const before = hasFlip ? Flip.getState(CT.ui.$$('.slot', shell)) : null;
            gsap.set(node, { x: 0, y: 0, scale: 1, rotate: 0 });
            S.moveSlot(c, slotId, target.dataset.date);
            render();
            if (before) Flip.from(before, { duration: .5, ease: 'power3.inOut', absolute: true });
            toast('Moved to ' + dt.short(target.dataset.date), 'Rest-day guidance updated below.');
          }
        })[0]);

        function originDate() {
          const slot = c.slots.find(s => s.id === slotId);
          return slot ? slot.date : null;
        }
      });
    }

    render();
  };
})();
