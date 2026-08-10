/* ═══════════════════════════════════════════════════════════════
   views/schedule.js — the week grid. Sessions are draggable
   between days (arrow keys work too); guidance is inline and
   never blocks a move.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast } = CT.ui, S = CT.store, dt = CT.dt;
  const hasDrag = !!(window.Draggable && motion.on);
  const hasFlip = !!(window.Flip && motion.on);

  /* How far a press may travel and still be a tap.
     A finger is not a mouse pointer. Pressing a tile with a thumb and
     lifting it drifts two or three pixels every time, and at Draggable's
     default threshold of two that was a drag: the tile picked itself up,
     sprang back to the day it came from, and the release was swallowed as
     "that was a move, not a tap". So on a phone, tapping a planned session
     did nothing at all — and tapping a planned session is the only way to
     the sheet that removes one from the plan. A mouse doesn't drift, which
     is why this only ever went wrong on the installed app. */
  const TAP_SLOP = 9;

  /* How long a press has to last before it stops being a tap and becomes a
     reach for the bin. */
  const HOLD_MS = 400;

  /* ═══════════════ the bin ═══════════════
     Press a planned session and hold, or simply start dragging one, and a
     bin rises from the bottom of the screen. Drop the session on it and it
     comes off the plan.

     This is the way to remove one on a phone, and it is a better way than
     the sheet it supplements: dragging a thing into a bin is a gesture a
     thumb already knows, it needs no second tap to confirm because nobody
     drags something into a bin by accident, and — the part that matters —
     it rides on the drag machinery, which is the one input path on this
     screen that a touch device has never had any trouble with.

     One node for the whole app, parked on the body so it sits above the
     grid, the tab bar and anything else. It has no handlers of its own; it
     is a rectangle the drag hit-tests against. */
  function theBin() {
    let b = CT.ui.$('#dropBin');
    if (b) return b;
    b = el('div', { id: 'dropBin', class: 'bin', 'aria-hidden': 'true' }, [
      icon('bin', 'bin__i')
    ]);
    document.body.appendChild(b);
    return b;
  }

  let binShown = false, dragging = false;

  function showBin() {
    if (binShown) return;
    binShown = true;
    const b = theBin();
    b.classList.add('is-on');
    if (motion.on) gsap.fromTo(b, { y: 26, opacity: 0 },
      { y: 0, opacity: 1, duration: .32, ease: 'power3.out' });
  }

  function hideBin() {
    const b = CT.ui.$('#dropBin');
    binShown = false;
    if (!b) return;
    b.classList.remove('is-on', 'is-over');
    if (motion.on) gsap.set(b, { clearProps: 'transform,opacity' });
  }

  /* Read live, and only ever while the bin is up — the drop is decided
     before anything puts it away. */
  function overBin(x, y) {
    const b = CT.ui.$('#dropBin');
    if (!binShown || !b) return false;
    const r = b.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /* A press that lingers summons the bin without waiting for movement,
     which is what "press and hold" means. A press that ends before the
     timer, or turns into a scroll, leaves nothing behind. */
  function holdBin(node) {
    clearTimeout(node._hold);
    node._hold = setTimeout(showBin, HOLD_MS);
    const off = () => {
      clearTimeout(node._hold);
      node.removeEventListener('pointerup', off);
      node.removeEventListener('pointercancel', off);
      /* Deferred, because the drop is settled in onDragEnd and this fires
         first on some engines. A drag still running keeps its bin. */
      setTimeout(() => { if (!dragging) hideBin(); }, 120);
    };
    node.addEventListener('pointerup', off);
    node.addEventListener('pointercancel', off);
  }

  CT.views.schedule = function (host, c) {
    const shell = el('div', { class: 'stack', style: 'gap:14px' });
    host.appendChild(shell);

    /* How far the grid can walk. The block is the middle of it, not the
       whole of it: training happens before one opens and after one
       shuts, and a session logged on such a day has to be reachable or
       it may as well not have been logged. So the range stretches to
       cover everything on record and today as well, and stops there —
       there is nothing to see in an empty week nobody can get to. */
    function span() {
      const dates = c.slots.map(s => s.date).concat(c.sessions.map(s => s.date));
      const todayISO = dt.iso(dt.today());
      const lo = dates.reduce((a, b) => (b < a ? b : a), c.block.start);
      const hi = dates.reduce((a, b) => (b > a ? b : a), c.block.end);
      return { first: Math.min(1, S.weekIndex(c, lo), S.weekIndex(c, todayISO)),
               last:  Math.max(c.block.weeks, S.weekIndex(c, hi), S.weekIndex(c, todayISO)) };
    }

    /* `weekOffset` is measured from the week the athlete is actually in,
       which after the block has ended is a week the block doesn't
       contain — so the anchor is the honest index, not the clamped one. */
    function here() { return S.weekIndex(c, dt.iso(dt.today())); }

    const range = span();
    let week = Math.max(range.first, Math.min(range.last, here() + CT.state.weekOffset));
    let draggables = [];

    /* Also the bin: a re-render, or leaving the screen, is the end of
       whatever was in the air. */
    function killDrag() {
      draggables.forEach(d => d.kill());
      draggables = [];
      dragging = false;
      hideBin();
    }

    function dayUnderPointer(x, y) {
      return CT.ui.$$('.day', shell).find(d => {
        const r = d.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      });
    }

    function dayFullToast(iso) {
      toast('That day is full', `${dt.short(iso)} already has ${S.maxPerDay} sessions. Two is the most a day holds.`);
    }

    /* move + animate, shared by drag and keyboard */
    function relocate(slotId, toISO, announce) {
      if (S.dayIsFull(c, toISO, slotId)) { dayFullToast(toISO); return; }
      const before = hasFlip ? Flip.getState(CT.ui.$$('.slot', shell)) : null;
      S.moveSlot(c, slotId, toISO);
      render();
      if (before) Flip.from(before, { duration: .55, ease: 'power3.inOut', absolute: true,
        onEnter: els => gsap.fromTo(els, { opacity: 0, scale: .9 }, { opacity: 1, scale: 1, duration: .35 }) });
      const moved = CT.ui.$(`[data-slot="${slotId}"]`, shell);
      if (moved) { moved.focus({ preventScroll: true }); }
      /* Three states, not two: a coach moving something on a client's
         plan, an athlete moving something on their own — and a coach
         moving something on their own, who is the top of the chain and
         has no coach to be told about it. */
      if (announce) toast('Moved to ' + dt.short(toISO), S.forOther(c)
        ? c.name + ' sees the change straight away.'
        : S.isCoach() ? 'Your own plan — nobody else to tell.'
        : 'Your coach sees the change straight away.');
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
        'aria-label': `${T.label}, ${dt.short(slot.date)}, ${status}. ` +
          (locked ? 'Open to edit or delete it.'
                  : 'Open to log or remove it, or use left and right arrow keys to move it a day.'),
        title: locked ? 'Open to edit or delete'
                      : 'Tap to log or remove · hold and drag to another day, or onto the bin'
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
        /* The tap is recognised from the pointer events themselves rather
           than waited for as a `click`.

           A click on a touch screen is not an event the finger produces —
           it is synthesised afterwards, and the browser withholds it if
           anything called preventDefault on the press. Draggable does
           exactly that on every element that isn't a real <a> or <button>,
           which this tile isn't. So the click arrived on a desktop and,
           depending on the engine, never arrived on a phone, and the sheet
           behind this tile — the one holding "Remove from plan" — could not
           be opened on the device the plan is read on.

           pointerdown and pointerup are the real events and both always
           arrive. A press that stayed put and was brief is a tap; anything
           that travelled is a drag, and anything held is a reach for the
           bin. None of that has to be guessed from a click that may or may
           not come. */
        const open = () => CT.views.slotSheet(c, slot);
        node.addEventListener('pointerdown', ev => {
          node._press = { x: ev.clientX, y: ev.clientY, t: Date.now() };
          holdBin(node);
        });
        node.addEventListener('pointerup', ev => {
          const p = node._press;
          node._press = null;
          if (!p) return;
          const moved = Math.abs(ev.clientX - p.x) + Math.abs(ev.clientY - p.y);
          if (moved > TAP_SLOP || Date.now() - p.t > HOLD_MS) return;
          open();
        });
        node.addEventListener('keydown', ev => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); return; }
          if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
          ev.preventDefault();
          const to = dt.addISO(slot.date, ev.key === 'ArrowRight' ? 1 : -1);
          const wkStart = S.weekStart(c, week);
          if (to < wkStart || to > dt.addISO(wkStart, 6)) return;
          relocate(slot.id, to, false);
        });
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
        const planned = S.repCount(ses);
        return planned ? S.cleanCount(ses) + '/' + planned + ' clean' : 'Max hangs';
      }
      /* a day cell is narrow, so the style beats the modality's name
         wherever one was recorded — "Hangboard" says more than
         "Hangboard / Edge Pulls" in the same width */
      const f = ses.fields || {};
      if (f.style) return CT.choiceName('edgeStyle', f.style) || 'Logged';
      const mod = (CT.MODALITIES[ses.type] || []).find(m => m.id === ses.modality);
      return mod ? mod.name : 'Logged';
    }

    function render() {
      killDrag();
      CT.ui.clear(shell);

      const wkStart = S.weekStart(c, week);
      const todayISO = dt.iso(dt.today());
      const bounds = span();
      /* Outside the block there is no phase to be in and no target to
         hit, so the chips and the guidance stay away rather than
         inventing a plan for a week that never had one. The grid
         underneath is the same grid: what was logged is still there,
         and a day still logs. */
      const planned = S.inBlock(c, week);
      const phase = planned ? S.phaseOfWeek(c, week) : null;
      const prog = planned ? S.weekProgress(c, week) : null;
      const nudges = planned ? S.weekNudges(c, week) : [];

      /* header */
      shell.appendChild(el('div', { class: 'card', style: 'padding:16px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap' }, [
        el('div', { class: 'row', style: 'gap:2px' }, [
          navBtn('back', week <= bounds.first, () => { week--; CT.state.weekOffset = week - here(); render(); }),
          navBtn('fwd', week >= bounds.last, () => { week++; CT.state.weekOffset = week - here(); render(); })
        ]),
        el('div', {}, [
          el('h2', { class: 'h-card', text: planned ? `Week ${week} of ${c.block.weeks}`
                                          : week < 1 ? 'Before the block' : 'After the block' }),
          el('p', { class: 'block__dates', text: `${dt.short(wkStart)} — ${dt.short(dt.addISO(wkStart, 6))}` })
        ]),
        phase ? el('span', { class: 'chip ' + (phase === 'Power Endurance' ? 'chip--ember' : 'chip--spruce'), text: phase }) : null,
        prog ? el('span', { class: 'chip' + (prog.hit ? ' chip--ink' : ''), text: `${prog.have}/${prog.need} done` })
             : el('span', { class: 'chip', text: 'No targets' }),
        el('div', { style: 'margin-left:auto;display:flex;gap:8px' }, [
          week !== here()
            ? el('button', { class: 'btn btn--ghost btn--sm', text: 'This week',
                onclick: () => { week = here(); CT.state.weekOffset = 0; render(); } })
            : null
        ])
      ]));

      /* "your" or "Maksym’s" — a coach reading a client's plan is not
         reading their own, and a line that says otherwise is one more
         chance to log against the wrong person. */
      const whose = S.whose(c), Whose = S.Whose(c);
      if (!planned) shell.appendChild(el('div', { class: 'nudge' }, [
        icon('info'),
        el('p', { html: week < 1
          ? `This is before ${whose} block opened on <b>${dt.short(c.block.start)}</b>. Anything logged here counts toward ${whose} loads and ${whose} history — it just isn’t part of a planned week.`
          : `${Whose} block finished on <b>${dt.short(c.block.end)}</b>. Logging can carry on: it all counts toward ${whose} loads and ${whose} history, there’s simply no weekly target to measure it against until a new block is set up.` })
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

        /* Today and the past get a log — the session either happened or it
           didn't. A future day gets a placeholder: there is nothing to
           record yet. Either way, a full day has no room for another. */
        const future = date > todayISO;
        if ((!past || isToday) && !S.dayIsFull(c, date)) {
          day.appendChild(el('button', {
            class: 'btn btn--quiet btn--sm', style: 'width:100%;justify-content:center;color:var(--ink-4);margin-top:auto',
            title: (future ? 'Plan a session for ' : 'Log a session on ') + dt.short(date),
            'aria-label': (future ? 'Plan a session for ' : 'Log a session on ') + dt.short(date),
            onclick: () => future ? CT.views.planSlot(c, date) : CT.openLog(null, { date })
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
          text: hasDrag ? 'Tap a session to log it · hold and drag to move it, or drop it on the bin to remove it'
                        : 'Tap a session to log or remove it · focus one and use ← → to move it' })
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
          minimumMovement: TAP_SLOP,           // thumb drift is not a drag
          onDragStart() {
            dragging = true;
            node._press = null;                // this press is a move, not a tap
            node._onBin = false;
            node.classList.add('is-dragging');
            showBin();
            gsap.to(node, { scale: 1.04, rotate: -1, duration: .2 });
          },
          onDrag() {
            /* Over the bin, no day is a candidate — the two are alternatives
               and lighting both would be a lie about where it will land. */
            const onBin = overBin(this.pointerX, this.pointerY);
            const b = CT.ui.$('#dropBin');
            if (b) b.classList.toggle('is-over', onBin);
            /* Over the bin the session shrinks small enough to sit inside
               it and fades back, which says what dropping will do and
               leaves the bin itself legible underneath at the one moment
               it has to be. */
            if (onBin !== node._onBin) {
              node._onBin = onBin;
              gsap.to(node, { scale: onBin ? .38 : 1.04, opacity: onBin ? .5 : 1,
                              duration: .18, ease: 'power2.out' });
            }
            const target = onBin ? null : dayUnderPointer(this.pointerX, this.pointerY);
            CT.ui.$$('.day', shell).forEach(d => {
              const over = d === target && d.dataset.date !== originDate();
              const full = over && S.dayIsFull(c, d.dataset.date, slotId);
              d.classList.toggle('is-drop', over && !full);
              d.classList.toggle('is-full', !!full);
            });
          },
          onDragEnd() {
            dragging = false;
            /* Decided before anything puts the bin away or resets the
               transform. */
            const onBin = overBin(this.pointerX, this.pointerY);
            const target = onBin ? null : dayUnderPointer(this.pointerX, this.pointerY);
            hideBin();
            CT.ui.$$('.day', shell).forEach(d => d.classList.remove('is-drop', 'is-full'));
            node.classList.remove('is-dragging');

            /* Before the tile is put back to its resting size — binDrop has
               its own way of seeing it off, and two tweens arguing over the
               same scale is not it. */
            if (onBin && binDrop(slotId, node)) return;

            /* Opacity as well as scale: a session carried over the bin and
               then dropped somewhere else must not keep the faded look of
               one that was on its way out. */
            gsap.to(node, { scale: 1, rotate: 0, opacity: 1, duration: .2 });

            const refused = target && target.dataset.date !== originDate()
                         && S.dayIsFull(c, target.dataset.date, slotId);
            if (!target || target.dataset.date === originDate() || refused) {
              gsap.to(node, { x: 0, y: 0, duration: .45, ease: 'power3.out' });
              if (refused) dayFullToast(target.dataset.date);
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

    /* Dropped on the bin. No arm-then-confirm here: the gesture is its own
       confirmation, and nothing that was logged can reach this — a session
       on the record locks its tile and never gets a Draggable. */
    function binDrop(slotId, node) {
      const slot = c.slots.find(s => s.id === slotId);
      if (!slot || !S.removeSlot(c, slot.id)) return false;
      const T = CT.TYPE[slot.type];
      const done = () => render();
      if (motion.on) gsap.to(node, { scale: .5, opacity: 0, duration: .24, ease: 'power2.in', onComplete: done });
      else done();
      toast(`Removed from ${S.whose(c)} plan`,
        `${T.label} on ${dt.short(slot.date)} is gone. Nothing was logged.`);
      return true;
    }

    render();
  };
})();
