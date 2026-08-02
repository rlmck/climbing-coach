/* ═══════════════════════════════════════════════════════════════
   logs/strength.js — the priority flow.

   Six hangs: three per grip, seven seconds each, pass or fail.
   Pass means held clean with two seconds still in reserve.
   Two clean sessions in a row on a grip earns +2.5 kg; any failed
   rep resets that grip's counter. Both outcomes are shown the
   instant the sixth puck is tapped, not after saving.

   This file also owns the sheet shell and the date bar, both of
   which the endurance / power-endurance logs reuse.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast } = CT.ui, S = CT.store, dt = CT.dt;

  /* ═════════════════ sheet shell ═════════════════ */
  CT.sheet = {
    open(opts) {
      CT.sheet.close(true);
      const scrim = CT.ui.$('#scrim'), hostEl = CT.ui.$('#sheetHost');
      scrim.hidden = false; hostEl.hidden = false; scrim.style.opacity = 0;

      const sheet = el('div', { class: 'sheet', role: 'document' }, [
        el('div', { class: 'sheet__hd' }, [
          el('div', {}, [
            el('p', { class: 'eyebrow', text: opts.eyebrow }),
            el('h2', { class: 'sheet__title', style: 'margin-top:6px', text: opts.title }),
            opts.sub ? el('p', { class: 'sheet__sub', text: opts.sub }) : null
          ]),
          el('button', { class: 'sheet__x', 'aria-label': 'Close', onclick: () => CT.sheet.close() }, [ icon('x') ])
        ]),
        opts.body,
        opts.footer
      ]);
      hostEl.appendChild(sheet);
      motion.sheetIn(scrim, sheet);

      scrim.onclick = () => CT.sheet.close();
      document.addEventListener('keydown', esc);
      function esc(e) { if (e.key === 'Escape') CT.sheet.close(); }
      CT.sheet._esc = esc;
      setTimeout(() => { const f = sheet.querySelector('input,button,select'); f && f.focus({ preventScroll: true }); }, 340);
      return sheet;
    },
    close(instant) {
      const scrim = CT.ui.$('#scrim'), hostEl = CT.ui.$('#sheetHost');
      const sheet = hostEl.firstChild;
      if (CT.sheet._esc) { document.removeEventListener('keydown', CT.sheet._esc); CT.sheet._esc = null; }
      if (!sheet) { scrim.hidden = true; hostEl.hidden = true; return; }
      const done = () => { CT.ui.clear(hostEl); scrim.hidden = true; hostEl.hidden = true; };
      if (instant) done(); else motion.sheetOut(scrim, sheet, done);
    }
  };

  /* ═════════════════ delete, with one step of friction ═════════════════
     No second modal — the button arms itself and disarms after a few
     seconds if you walk away from it. */
  CT.deleteButton = function (onConfirm, label) {
    let armed = false, timer = null;
    const text = el('span', { text: label || 'Delete' });
    const btn = el('button', { class: 'btn btn--ghost btn--danger', onclick: () => {
      if (armed) { clearTimeout(timer); onConfirm(); return; }
      armed = true;
      btn.classList.add('is-armed');
      text.textContent = 'Tap again to confirm';
      motion.shake(btn);
      timer = setTimeout(() => {
        armed = false; btn.classList.remove('is-armed'); text.textContent = label || 'Delete';
      }, 3500);
    }}, [ icon('x'), text ]);
    return btn;
  };

  /* ═════════════════ date bar — retro logging is first-class ═════════════════ */
  CT.dateBar = function (c, initial, onChange) {
    const todayISO = dt.iso(dt.today());
    const min = c.block.start, max = todayISO;
    let value = initial && initial >= min && initial <= max ? initial : todayISO;

    const input = el('input', { type: 'date', value, min, max,
      'aria-label': 'Session date',
      oninput: e => set(e.target.value || todayISO) });

    const banner = el('div');
    const quick = el('div', { class: 'quickdates' }, [
      qb('Today', todayISO), qb('Yesterday', dt.addISO(todayISO, -1))
    ]);

    function qb(label, iso) {
      return el('button', { text: label, 'aria-pressed': String(value === iso),
        onclick: () => { input.value = iso; set(iso); } });
    }

    /* `silent` on the first paint: callers legitimately build their form
       after the date bar, so firing onChange during construction would
       reach into bindings that don't exist yet. */
    function set(v, silent) {
      value = v < min ? min : v > max ? max : v;
      input.value = value;
      [...quick.children].forEach(b => b.setAttribute('aria-pressed',
        String(value === (b.textContent === 'Today' ? todayISO : dt.addISO(todayISO, -1)))));
      CT.ui.clear(banner);
      if (value !== todayISO) {
        const b = el('div', { class: 'backdate' }, [
          icon('clock'),
          el('p', { html: `Logging for <b>${dt.short(value)}</b> — ${dt.relative(value)}. It lands on that day in your week.` })
        ]);
        banner.appendChild(b);
        motion.pop(b, .96);
      }
      if (!silent && onChange) onChange(value);
    }

    const wrap = el('div', { class: 'stack', style: 'gap:12px' }, [
      el('div', { class: 'datebar' }, [
        el('label', { class: 'datepick' }, [ icon('calendar'), input ]),
        quick,
        el('span', { class: 'tiny', style: 'margin-left:auto',
          text: `Block runs ${dt.mini(min)} — ${dt.mini(c.block.end)}` })
      ]),
      banner
    ]);
    wrap.get = () => value;
    set(value, true);
    return wrap;
  };

  /* ═════════════════ strength log ═════════════════
     Two shapes of strength session share one sheet: the hangboard, which
     carries a prescribed load and drives the progression rule, and limit
     bouldering, which is attempts at a grade and advances nothing. The
     mode picker only appears when creating — changing an existing
     session's mode would throw away the shape it was logged in. */
  CT.views.strengthLog = function (c, opts) {
    opts = opts || {};
    const editing = opts.sessionId ? S.session(c, opts.sessionId) : null;

    let mode = editing ? S.strengthMode(editing)
             : CT.STRENGTH_MODES.some(m => m.id === opts.mode) ? opts.mode : 'hangs';
    let form = null, sheet = null;

    const summary = el('p', { class: 'sub' });
    const saveBtn = el('button', { class: 'btn btn--primary', disabled: true, onclick: save },
      [ icon('check'), editing ? 'Save changes' : 'Save session' ]);

    const dateBar = CT.dateBar(c, editing ? editing.date : opts.date, () => form && form.refresh());
    const host = el('div', { class: 'stack', style: 'gap:16px' });

    const picker = editing ? null : el('div', { class: 'picker' }, CT.STRENGTH_MODES.map(m =>
      el('button', { class: 'pick', 'aria-pressed': String(m.id === mode), onclick: () => setMode(m.id) }, [
        el('p', { class: 'pick__n', text: m.name }),
        el('p', { class: 'pick__d', text: m.desc })
      ])
    ));

    function setMode(id) {
      if (form && id === mode) return;
      mode = id;
      if (picker) [...picker.children].forEach((b, i) =>
        b.setAttribute('aria-pressed', String(CT.STRENGTH_MODES[i].id === id)));

      CT.ui.clear(host);
      form = (id === 'limit' ? limitForm : hangForm)(c, editing, { summary, saveBtn });
      host.appendChild(form.node);
      form.refresh();

      if (!sheet) return;                       // first build — the sheet isn't open yet
      CT.ui.$('.sheet__title', sheet).textContent = form.title;
      CT.ui.$('.sheet__sub', sheet).textContent = form.sub;
      motion.enter(form.node);
    }

    function save() {
      const date = dateBar.get();
      const payload = Object.assign({ date, mode }, form.payload());

      if (editing) {
        S.updateSession(c, editing.id, payload);
        CT.sheet.close();
        CT.render(false);
        toast('Session updated', dt.short(date) + ' · ' + form.savedSub());
        return;
      }

      const before = S.streak(c);
      S.logSession(c, Object.assign({ type: 'strength' }, payload));
      CT.sheet.close();
      toast(date === dt.iso(dt.today()) ? 'Logged' : 'Logged for ' + dt.short(date), form.savedSub());
      CT.afterLog(c, before);
    }

    setMode(mode);

    const body = el('div', { class: 'sheet__bd' }, [
      dateBar,
      picker ? el('div', {}, [
        el('p', { class: 'eyebrow', style: 'margin-bottom:10px', text: 'What did you do' }),
        picker
      ]) : null,
      host
    ]);

    const footer = el('div', { class: 'sheet__ft' }, [
      editing ? CT.deleteButton(() => {
        S.deleteSession(c, editing.id);
        CT.sheet.close();
        CT.render(false);
        toast('Session deleted', mode === 'limit'
          ? dt.short(editing.date) + ' cleared from your week.'
          : 'Loads recalculated from what is left.');
      }) : null,
      summary, saveBtn
    ]);

    sheet = CT.sheet.open({
      eyebrow: editing ? 'Editing · ' + dt.short(editing.date) : 'Strength',
      title: form.title,
      sub: form.sub,
      body, footer
    });
  };

  /* ═════════════════ hangboard ═════════════════ */
  function hangForm(c, editing, ctx) {
    const P = CT.PROTOCOL;
    const reps = editing
      ? { tfd: editing.reps.tfd.slice(), half: editing.reps.half.slice() }
      : { tfd: [null, null, null], half: [null, null, null] };
    const shown = { tfd: false, half: false };          // is the +2.5 reveal on screen?

    const gripNodes = {};

    /* When editing, the baseline is the athlete's state with this session
       taken back out — otherwise the session would be counted twice. */
    const baseline = S.replay(c, editing ? editing.id : null);

    /* ── one grip channel ── */
    function gripCard(g, idx) {
      const base = editing ? { weight: editing.weights[g.id], streak: baseline[g.id].streak }
                           : baseline[g.id];

      const num  = el('span', { class: 'load__n', text: base.weight.toFixed(1) });
      const bump = el('div', { class: 'load__bump' }, [ icon('arrowUp'), el('span', { text: `+${P.increment} kg` }) ]);
      const lbl  = el('p', { class: 'load__lbl', text: 'Prescribed' });

      const pips = el('div', { class: 'pips' },
        [0, 1].map(i => el('span', { class: 'pip' + (i < base.streak ? ' pip--on' : '') })));
      const streakTxt = el('span', { class: 'grip__streaktxt', text: `${base.streak}/${P.cleanTarget} clean sessions` });

      const pucks = [0, 1, 2].map(i => {
        const glyph = el('span', { class: 'rep__glyph' }, [ icon('grip') ]);
        const label = el('span', { class: 'rep__lbl', text: 'Rep ' + (i + 1) });
        const flash = el('span', { class: 'rep__flash' });
        const btn = el('button', {
          class: 'rep',
          onclick: () => cycle(g.id, i, btn, glyph, label, flash)
        }, [ flash, glyph, label ]);
        paint(btn, glyph, label, g, i, reps[g.id][i]);
        return btn;
      });

      const nextTxt = el('span', { class: 'grip__next' });

      const card = el('section', { class: 'grip' }, [
        el('div', { class: 'grip__hd' }, [
          el('span', { class: 'grip__idx', text: 'GRIP ' + String(idx + 1).padStart(2, '0') }),
          el('h3', { class: 'grip__name', text: g.name }),
          el('span', { class: 'chip', text: g.edge }),
          el('div', { class: 'grip__streak' }, [ pips, streakTxt ])
        ]),
        el('div', { class: 'grip__body' }, [
          el('div', { class: 'load' }, [
            el('div', { class: 'load__val' }, [
              el('span', { class: 'load__sign', text: '+' }), num,
              el('span', { class: 'load__u', text: 'KG' })
            ]),
            lbl, bump
          ]),
          el('div', { class: 'reps' }, pucks)
        ]),
        el('div', { class: 'grip__foot' }, [
          icon('info'),
          el('span', { text: 'Tap a hang to mark it clean · tap again for failed · once more to clear' }),
          nextTxt
        ])
      ]);

      gripNodes[g.id] = { card, num, bump, lbl, pips, streakTxt, pucks, nextTxt, base };
      return card;
    }

    /* ── one puck's appearance for a given state ── */
    function paint(btn, glyph, label, g, i, state) {
      btn.classList.toggle('rep--pass', state === true);
      btn.classList.toggle('rep--fail', state === false);
      CT.ui.clear(glyph).appendChild(icon(state === true ? 'check' : state === false ? 'x' : 'grip'));
      label.textContent = state === true ? 'Clean' : state === false ? 'Failed' : 'Rep ' + (i + 1);
      btn.setAttribute('aria-label',
        `${g.name}, rep ${i + 1}: ${state === true ? 'clean' : state === false ? 'failed' : 'not logged'}`);
    }

    /* ── pass → fail → clear ── */
    function cycle(gripId, i, btn, glyph, label, flash) {
      const cur = reps[gripId][i];
      const next = cur === null ? true : cur === true ? false : null;
      reps[gripId][i] = next;
      paint(btn, glyph, label, CT.GRIPS.find(g => g.id === gripId), i, next);

      if (motion.on) {
        gsap.fromTo(btn, { scale: .93 }, { scale: 1, duration: .42, ease: 'back.out(3)' });
        if (next === true) gsap.fromTo(flash, { opacity: .55 }, { opacity: 0, duration: .5, ease: 'power2.out' });
        if (next === false) motion.shake(btn);
      }
      refresh();
    }

    /* ── recompute every dependent surface ── */
    function refresh() {
      if (!gripNodes.tfd) return;              // the date bar can fire before the grips exist
      let cleanCount = 0, total = 0;
      CT.GRIPS.forEach(g => {
        const n = gripNodes[g.id];
        const p = S.projectGrip(c, g.id, reps[g.id], n.base);
        reps[g.id].forEach(r => { if (r !== null) total++; if (r === true) cleanCount++; });

        /* streak pips */
        [...n.pips.children].forEach((pip, i) => {
          const on = p.earned ? true : i < p.streak;
          if (on !== pip.classList.contains('pip--on')) {
            pip.classList.toggle('pip--on', on);
            if (on) motion.pop(pip, .3);
          }
        });
        n.streakTxt.textContent = `${p.earned ? P.cleanTarget : p.streak}/${P.cleanTarget} clean sessions`;

        /* the reveal */
        if (p.earned && !shown[g.id]) {
          shown[g.id] = true;
          n.card.classList.add('is-armed');
          n.lbl.textContent = 'Prescribed next session';
          motion.count(n.num, p.baseWeight, p.weight, { decimals: 1, duration: .85 });
          if (motion.on) {
            gsap.fromTo(n.bump, { opacity: 0, y: 8, scale: .85 },
              { opacity: 1, y: 0, scale: 1, duration: .55, ease: 'back.out(2.4)', delay: .12 });
            gsap.fromTo(n.card, { boxShadow: '0 0 0 0 rgba(46,94,78,0)' },
              { boxShadow: '0 0 0 3px rgba(46,94,78,.09)', duration: .5 });
          } else { n.bump.style.opacity = 1; }
        } else if (!p.earned && shown[g.id]) {
          shown[g.id] = false;
          n.card.classList.remove('is-armed');
          n.lbl.textContent = 'Prescribed';
          motion.count(n.num, p.baseWeight + P.increment, p.baseWeight, { decimals: 1, duration: .45 });
          if (motion.on) gsap.to(n.bump, { opacity: 0, y: 6, duration: .25 });
          else n.bump.style.opacity = 0;
          if (p.failed) motion.shake(n.card);
        }

        n.nextTxt.innerHTML = p.done
          ? (p.earned ? `Next session &nbsp;<b>+${p.weight.toFixed(1)} kg</b>`
                      : `Next session &nbsp;<b>+${p.weight.toFixed(1)} kg</b> — hold`)
          : '';
      });

      const complete = total === 6;
      ctx.saveBtn.disabled = !complete;
      const earned = CT.GRIPS.filter(g => shown[g.id]);
      ctx.summary.innerHTML = !complete
        ? `<b>${total}</b> of 6 hangs logged`
        : earned.length
          ? `<b>${cleanCount}/6 clean</b> · +${P.increment} kg on ${earned.map(g => g.short.toLowerCase()).join(' and ')}`
          : `<b>${cleanCount}/6 clean</b> · load holds next session`;
    }

    const notes = el('textarea', { class: 'input', text: editing ? editing.notes : '',
      placeholder: 'Skin, warm-up, anything worth remembering next time.' });

    const node = el('div', { class: 'stack', style: 'gap:16px' }, [
      el('dl', { class: 'proto' }, [
        el('div', {}, [ el('dt', { text: 'Edge' }),   el('dd', { text: '20 mm' }) ]),
        el('div', {}, [ el('dt', { text: 'Hang' }),   el('dd', { text: P.hangSec + ' s' }) ]),
        el('div', {}, [ el('dt', { text: 'Reserve' }),el('dd', { text: P.reserveSec + ' s' }) ]),
        el('div', {}, [ el('dt', { text: 'Rest' }),   el('dd', { text: P.restSec / 60 + ' min' }) ]),
        el('div', {}, [ el('dt', { text: 'Reps' }),   el('dd', { text: '3 per grip' }) ])
      ]),
      ...CT.GRIPS.map(gripCard),
      el('div', { class: 'field' }, [ el('label', { text: 'Notes' }), notes ])
    ]);

    return {
      node, refresh,
      title: 'Max hangs',
      sub: `Six hangs · ${P.hangSec} seconds · pass means ${P.reserveSec} seconds still in reserve`,
      payload() {
        const weights = {}; CT.GRIPS.forEach(g => weights[g.id] = gripNodes[g.id].base.weight);
        return { weights, reps: { tfd: reps.tfd.slice(), half: reps.half.slice() }, notes: notes.value.trim() };
      },
      savedSub() {
        const earned = CT.GRIPS.filter(g => shown[g.id]);
        return earned.length
          ? `+${P.increment} kg on ${earned.map(g => g.short.toLowerCase()).join(' and ')} next session.`
          : 'Load holds next session.';
      }
    };
  }

  /* ═════════════════ limit bouldering ═════════════════
     One row per problem: the grade, and how many goes went into it. No
     prescribed load, so nothing here advances — the record is the point. */
  function limitForm(c, editing, ctx) {
    const L = CT.LIMIT;
    const problems = editing && editing.problems && editing.problems.length
      ? editing.problems.map(p => ({ grade: p.grade, attempts: p.attempts, sent: !!p.sent }))
      : [ { grade: L.defaultGrade, attempts: L.defaultAttempts, sent: false } ];

    const list = el('div', { class: 'stack', style: 'gap:10px' });
    const tally = {};
    const cell = (label, id) => {
      tally[id] = el('dd', { text: '—' });
      return el('div', {}, [ el('dt', { text: label }), tally[id] ]);
    };
    const strip = el('dl', { class: 'proto' }, [
      cell('Problems', 'problems'), cell('Attempts', 'attempts'),
      cell('Sent', 'sent'), cell('Hardest', 'top')
    ]);

    const notes = el('textarea', { class: 'input', text: editing ? editing.notes : '',
      placeholder: 'What shut you down, what finally worked, how the skin held.' });

    /* ── one problem ── */
    function rowNode(p, i) {
      const count = el('span', { text: String(p.attempts) });
      const step = d => {
        const nv = Math.max(1, Math.min(L.maxAttempts, p.attempts + d));
        if (nv === p.attempts) return;
        p.attempts = nv;
        count.textContent = String(nv);
        motion.pop(count, .7);
        refresh();
      };

      const seg = el('div', { class: 'seg' }, [
        el('button', { text: 'Worked', 'aria-pressed': String(!p.sent), onclick: () => setSent(false) }),
        el('button', { text: 'Sent',   'aria-pressed': String(p.sent),  onclick: () => setSent(true) })
      ]);
      function setSent(v) {
        if (p.sent === v) return;
        p.sent = v;
        [...seg.children].forEach((b, k) => b.setAttribute('aria-pressed', String(k === (v ? 1 : 0))));
        refresh();
      }

      return el('section', { class: 'bp' }, [
        el('div', { class: 'bp__hd' }, [
          el('span', { class: 'bp__idx', text: 'PROBLEM ' + String(i + 1).padStart(2, '0') }),
          problems.length > 1
            ? el('button', { class: 'bp__x', 'aria-label': 'Remove problem ' + (i + 1),
                onclick: () => remove(i) }, [ icon('x') ])
            : null
        ]),
        el('div', { class: 'bp__body' }, [
          el('div', { class: 'field' }, [
            el('label', { text: 'Grade' }),
            el('select', { class: 'input', 'aria-label': `Problem ${i + 1} grade`,
              onchange: e => { p.grade = e.target.value; refresh(); } },
              L.grades.map(g => el('option', { value: g, text: g, selected: g === p.grade || null })))
          ]),
          el('div', { class: 'field' }, [
            el('label', { text: 'Attempts' }),
            el('div', { class: 'stepper' }, [
              el('button', { onclick: () => step(-1), 'aria-label': `Fewer attempts on problem ${i + 1}` }, [ icon('minus') ]),
              count,
              el('button', { onclick: () => step(1), 'aria-label': `More attempts on problem ${i + 1}` }, [ icon('plus') ])
            ])
          ]),
          el('div', { class: 'field' }, [ el('label', { text: 'Outcome' }), seg ])
        ])
      ]);
    }

    /* indices and the remove button shift, so add / remove repaints the list */
    function paintList() {
      CT.ui.clear(list);
      problems.forEach((p, i) => list.appendChild(rowNode(p, i)));
    }

    function add() {
      const last = problems[problems.length - 1];
      problems.push({ grade: last ? last.grade : L.defaultGrade, attempts: L.defaultAttempts, sent: false });
      paintList();
      motion.pop(list.lastChild, .96);
      refresh();
    }

    function remove(i) {
      problems.splice(i, 1);
      paintList();
      refresh();
    }

    function totals() {
      return {
        attempts: problems.reduce((a, p) => a + p.attempts, 0),
        sent: problems.filter(p => p.sent).length,
        top: CT.topGrade(problems)
      };
    }

    function refresh() {
      const t = totals();
      tally.problems.textContent = String(problems.length);
      tally.attempts.textContent = String(t.attempts);
      tally.sent.textContent = String(t.sent);
      tally.top.textContent = t.top || '—';

      ctx.saveBtn.disabled = !problems.length;
      ctx.summary.innerHTML =
        `<b>${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}</b> · ` +
        `${t.attempts} ${t.attempts === 1 ? 'attempt' : 'attempts'} · ` +
        `${t.sent} sent`;
    }

    paintList();

    const node = el('div', { class: 'stack', style: 'gap:16px' }, [
      strip,
      list,
      el('button', { class: 'btn btn--ghost', style: 'align-self:flex-start', onclick: add },
        [ icon('plus'), 'Add a problem' ]),
      el('div', { class: 'grip__foot', style: 'border-top:0;border-radius:var(--r-md)' }, [
        icon('info'),
        el('span', { text: `Limit bouldering is recruitment work — ${L.problemsHint} problems at your ceiling, ${L.restMin} minutes between goes.` })
      ]),
      el('div', { class: 'field' }, [ el('label', { text: 'Notes' }), notes ])
    ]);

    return {
      node, refresh,
      title: 'Limit bouldering',
      sub: 'Maximal problems — log the attempts that went into each grade',
      payload() {
        return {
          problems: problems.map(p => ({ grade: p.grade, attempts: p.attempts, sent: p.sent })),
          notes: notes.value.trim()
        };
      },
      savedSub() {
        const t = totals();
        return `${t.attempts} ${t.attempts === 1 ? 'attempt' : 'attempts'} across ` +
               `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}` +
               (t.sent ? ` · ${t.sent} sent.` : '.');
      }
    };
  }
})();
