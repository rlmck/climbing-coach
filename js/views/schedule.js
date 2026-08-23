/* ═══════════════════════════════════════════════════════════════
   views/schedule.js — the week grid. Sessions are picked up with a
   press and hold and dropped on another day, or above or below the
   other session sharing their own (arrow keys do both too);
   guidance is inline and never blocks a move.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast } = CT.ui, S = CT.store, dt = CT.dt;
  const hasDrag = !!(window.gsap && motion.on);
  const hasFlip = !!(window.Flip && motion.on);

  /* How far a press may travel and still be a tap.
     A finger is not a mouse pointer. Pressing a tile with a thumb and
     lifting it drifts two or three pixels every time, and at a threshold
     of two that was a drag: the tile picked itself up, sprang back to the
     day it came from, and the release was swallowed as "that was a move,
     not a tap". So on a phone, tapping a planned session did nothing at
     all — and tapping a planned session is the only way to the sheet that
     removes one from the plan. A mouse doesn't drift, which is why this
     only ever went wrong on the installed app. */
  const TAP_SLOP = 9;

  /* How long a press has to last before the tile is in the hand.
     A tile that starts moving the moment a finger touches it cannot
     share a screen with a list that scrolls: every attempt to scroll the
     week began by grabbing whatever session was under the thumb, and the
     page stayed put while a tile flew about. So the press has to be held
     still for this long first. Under it, the gesture belongs to the page
     — a flick scrolls, a tap opens the sheet — and only a hand that has
     stopped and waited is a hand meaning to move something.

     Long enough not to fire during a flick, short enough that holding it
     doesn't feel like waiting. It is one threshold doing both halves of
     the job: a press held this long is a lift, and a press *released*
     after this long was a lift too, so it is not also a tap. */
  const HOLD_MS = 400;

  /* The line drawn on whichever edge of the sitting tile the dragged one
     would take. Which edge depends on how the day is laid out, and only
     the day knows that. */
  const YIELD = ['slot--yield-top', 'slot--yield-bottom', 'slot--yield-left', 'slot--yield-right'];

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

    /* One finger, one gesture. There is never a second tile in the air,
       so the press being handled lives here rather than on the tile. */
    let press = null;

    /* Whether the page may scroll under the finger is decided on the
       first move of a touch, and a passive listener gets no say in it.
       This one is on the view rather than the document so it goes when
       the view does, and it refuses the scroll only once a tile has
       actually been lifted — before that the gesture is the page's. */
    shell.addEventListener('touchmove', ev => {
      if (press && press.lifted) ev.preventDefault();
    }, { passive: false });

    /* Android raises the context menu on a long press of its own, at
       about the same moment the tile comes up. */
    shell.addEventListener('contextmenu', ev => { if (press) ev.preventDefault(); });

    /* A re-render, or leaving the screen, is the end of whatever was in
       the air. */
    function killDrag() {
      if (press) { press.node.classList.remove('is-dragging'); endPress(); }
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

    /* move + animate, shared by drag and keyboard.

       `index` is a position within the destination day — null appends,
       which is what moving a day sideways means. A destination equal to
       the day the slot is already on is a reorder.

       `before` is a Flip state the caller captured earlier. A drag has
       one: it is taken while the tile is still under the finger, so the
       tile flies from where it was let go rather than from the gap it
       left behind. Everything else lets this take its own. */
    function relocate(slotId, toISO, index, announce, before) {
      const slot = c.slots.find(s => s.id === slotId);
      const fromISO = slot ? slot.date : null;
      if (fromISO !== toISO && S.dayIsFull(c, toISO, slotId)) { dayFullToast(toISO); return false; }
      if (before === undefined) before = hasFlip ? Flip.getState(CT.ui.$$('.slot', shell)) : null;
      if (!S.placeSlot(c, slotId, toISO, index)) return false;
      render();
      if (before) Flip.from(before, { duration: .55, ease: 'power3.inOut', absolute: true,
        onEnter: els => gsap.fromTo(els, { opacity: 0, scale: .9 }, { opacity: 1, scale: 1, duration: .35 }) });
      const moved = CT.ui.$(`[data-slot="${slotId}"]`, shell);
      if (moved) { moved.focus({ preventScroll: true }); }
      if (announce) announceMove(fromISO, toISO);
      return true;
    }

    function announceMove(fromISO, toISO) {
      /* A reorder is a change to one day, and the day itself is the
         answer: whatever now leads it is what the athlete does first. */
      if (fromISO === toISO) {
        const first = S.slotsOn(c, toISO)[0];
        toast(dt.short(toISO) + ' reordered',
          first ? CT.TYPE[first.type].label + ' comes first now.' : 'New order saved.');
        return;
      }
      /* Three states, not two: a coach moving something on a client's
         plan, an athlete moving something on their own — and a coach
         moving something on their own, who is the top of the chain and
         has no coach to be told about it. */
      toast('Moved to ' + dt.short(toISO), S.forOther(c)
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
                  : 'Open to log or remove it, left and right arrow keys move it a day, '
                    + 'up and down move it earlier or later within the day.'),
        title: locked ? 'Open to edit or delete'
                      : 'Tap to log or remove · press and hold to drag'
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
           anything called preventDefault on the press, which a drag has
           to. So the click arrived on a desktop and, depending on the
           engine, never arrived on a phone, and the sheet behind this
           tile — the one holding "Remove from plan" — could not be opened
           on the device the plan is read on.

           pointerdown and pointerup are the real events and both always
           arrive. A press that stayed put and was brief is a tap; anything
           that travelled, or was held, is a hand doing something else.
           None of that has to be guessed from a click that may or may not
           come. */
        const open = () => CT.views.slotSheet(c, slot);
        node.addEventListener('pointerdown', ev => beginPress(node, slot, open, ev));
        node.addEventListener('keydown', ev => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); return; }
          /* Sideways moves the day, up and down moves it within the day.
             Which is the whole of the drag, without one. */
          if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
            ev.preventDefault();
            const to = dt.addISO(slot.date, ev.key === 'ArrowRight' ? 1 : -1);
            const wkStart = S.weekStart(c, week);
            if (to < wkStart || to > dt.addISO(wkStart, 6)) return;
            relocate(slot.id, to, null, false);
            return;
          }
          if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
          ev.preventDefault();
          const line = S.slotsOn(c, slot.date);
          const to = line.findIndex(s => s.id === slot.id) + (ev.key === 'ArrowDown' ? 1 : -1);
          if (to < 0 || to >= line.length) return;
          relocate(slot.id, slot.date, to, false);
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
          text: hasDrag ? 'Tap a session to log or remove it · press and hold to drag it'
                        : 'Tap a session to log or remove it · focus one and use ← → ↑ ↓ to move it' })
      ]));

      motion.enter(shell);
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

    /* ── press, hold, drag ───────────────────────────────────
       Written out by hand rather than handed to a drag library, because
       the thing that matters here is what happens in the first four
       hundred milliseconds — before there is a drag at all — and that is
       the one part a library takes out of your hands. */

    function beginPress(node, slot, open, ev) {
      if (press) return;                         // a second finger is not a second drag
      if (ev.button != null && ev.button > 0) return;   // a right-click is not a press
      press = {
        node, open, id: ev.pointerId, slotId: slot.id, from: slot.date,
        x: ev.clientX, y: ev.clientY, t: Date.now(),
        lifted: false, drop: null, timer: null
      };
      if (hasDrag) press.timer = setTimeout(lift, HOLD_MS);
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    }

    /* Held still long enough: the tile is now in the hand. The tick of
       haptics is the only thing that says so before the finger moves,
       and on a phone it is the difference between a gesture that feels
       deliberate and one that feels like a glitch. */
    function lift() {
      const p = press;
      if (!p) return;
      if (stale()) { endPress(); return; }
      p.timer = null;
      p.lifted = true;
      /* Ask the layout which way a day runs, once. It is a column of
         tiles on a wide screen and a row of them on a phone, and
         "above" and "before" are only the same word on one of those.
         Every day in the grid is laid out alike, and none of them is
         going to change its mind mid-drag. */
      const day = CT.ui.$('.day', shell);
      p.row = !!day && getComputedStyle(day).flexDirection.indexOf('row') === 0;
      try { p.node.setPointerCapture(p.id); } catch (e) { /* mouse already implicit */ }
      p.node.classList.add('is-dragging');
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* not everywhere */ } }
      gsap.to(p.node, { scale: 1.04, rotate: -1, duration: .2 });
      paint(p.x, p.y);
    }

    /* Navigating away with a finger still down — a second thumb on the
       tab bar while the first holds a tile — leaves these listeners
       holding a tile on a screen that no longer exists. */
    function stale() { return !shell.isConnected; }

    function onMove(ev) {
      const p = press;
      if (!p || ev.pointerId !== p.id) return;
      if (stale()) { endPress(); return; }
      if (!p.lifted) {
        /* Travelled before the hold was up: this was a scroll, or the
           start of one. The page keeps it. */
        if (Math.abs(ev.clientX - p.x) + Math.abs(ev.clientY - p.y) > TAP_SLOP) endPress();
        return;
      }
      ev.preventDefault();                       // no text selection under the drag
      gsap.set(p.node, { x: ev.clientX - p.x, y: ev.clientY - p.y });
      paint(ev.clientX, ev.clientY);
    }

    function onUp(ev) {
      const p = press;
      if (!p || ev.pointerId !== p.id) return;
      if (stale()) { endPress(); return; }
      if (p.lifted) { drop(); return; }
      const moved = Math.abs(ev.clientX - p.x) + Math.abs(ev.clientY - p.y);
      const held = Date.now() - p.t;
      const open = p.open;
      endPress();
      /* Still, and brief. The hold check matters where there is no drag
         to have started — a lifted tile has already cleared the press. */
      if (moved <= TAP_SLOP && held <= HOLD_MS) open();
    }

    function onCancel(ev) {
      const p = press;
      if (!p || ev.pointerId !== p.id) return;
      if (p.lifted) { p.drop = null; drop(); return; }
      endPress();
    }

    /* Where the tile would land if it were let go here: a day, and a
       position within it. Both, because a day can already hold one and
       dropping above or below it is the whole of reordering. */
    function plan(x, y) {
      const p = press;
      const day = dayUnderPointer(x, y);
      if (!day) return null;
      const iso = day.dataset.date, row = p.row;
      const others = CT.ui.$$('.slot', day).filter(n => n.dataset.slot !== p.slotId);

      let index = 0;
      others.forEach(n => {
        const r = n.getBoundingClientRect();
        if (row ? x > (r.left + r.right) / 2 : y > (r.top + r.bottom) / 2) index++;
      });

      const mark = !others.length ? null
        : index < others.length
          ? { node: others[index], cls: row ? 'slot--yield-left' : 'slot--yield-top' }
          : { node: others[others.length - 1], cls: row ? 'slot--yield-right' : 'slot--yield-bottom' };

      const at = S.slotsOn(c, p.from).findIndex(s => s.id === p.slotId);
      return {
        day, iso, index, mark,
        full: S.dayIsFull(c, iso, p.slotId),
        /* Dropping a tile back where it already is is not a move, and
           should leave the plan — and the toast — alone. */
        changes: iso !== p.from || index !== at
      };
    }

    function paint(x, y) {
      const p = press;
      const d = p.drop = plan(x, y);
      const live = d && d.changes;
      CT.ui.$$('.day', shell).forEach(n => {
        n.classList.toggle('is-drop', !!live && n === d.day && !d.full);
        n.classList.toggle('is-full', !!live && n === d.day && d.full);
      });
      CT.ui.$$('.slot', shell).forEach(n => n.classList.remove(...YIELD));
      if (live && !d.full && d.mark) d.mark.node.classList.add(d.mark.cls);
    }

    function drop() {
      const p = press, d = p.drop;
      p.node.classList.remove('is-dragging');
      clearMarks();

      if (!d || d.full || !d.changes) {
        gsap.to(p.node, { x: 0, y: 0, scale: 1, rotate: 0, duration: .45, ease: 'power3.out' });
        const refused = d && d.full;
        const iso = d && d.iso;
        endPress();
        if (refused) dayFullToast(iso);
        return;
      }

      /* Captured while the tile is still where the finger left it, so
         what follows animates from there and not from the gap behind. */
      const before = hasFlip ? Flip.getState(CT.ui.$$('.slot', shell)) : null;
      gsap.set(p.node, { x: 0, y: 0, scale: 1, rotate: 0 });
      const slotId = p.slotId, iso = d.iso, index = d.index;
      endPress();
      relocate(slotId, iso, index, true, before);
    }

    function clearMarks() {
      CT.ui.$$('.day', shell).forEach(n => n.classList.remove('is-drop', 'is-full'));
      CT.ui.$$('.slot', shell).forEach(n => n.classList.remove(...YIELD));
    }

    function endPress() {
      const p = press;
      if (!p) return;
      press = null;
      if (p.timer) clearTimeout(p.timer);
      try { p.node.releasePointerCapture(p.id); } catch (e) { /* never had it */ }
      window.removeEventListener('pointermove', onMove, { passive: false });
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      clearMarks();
    }

    render();
  };
})();
