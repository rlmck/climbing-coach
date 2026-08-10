/* ═══════════════════════════════════════════════════════════════
   logs/session.js — endurance and power-endurance logs.
   Pick a modality, fill a short form, pick a date. The field sets
   are a deliberate first pass: shapes to react to, not a spec.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast } = CT.ui, S = CT.store, dt = CT.dt;

  const UNIT = { kg: 'kg', number: '' };

  /* ═══════════════ field controls ═══════════════
     One function per kind in CT.FORMS. Each takes the value it starts
     at and a setter, and hands back a node — the form itself never
     knows what any of them are made of. */

  /* ── effort ──────────────────────────────────────────────
     Five buttons rather than a slider: the scale is now short enough
     to show whole, and every point on it has a sentence attached.
     The sentences are one tap away rather than on screen permanently,
     because after the first few sessions nobody needs them — but the
     first few sessions are exactly when a number gets anchored. */
  function rpeControl(init, set) {
    let value = CT.rpeValue(init) || CT.RPE.default;
    let open = false;

    const label = el('p', { class: 'rpeset__l' });
    const rows = CT.RPE.scale.map(s => el('div', { class: 'rpeguide__r', 'data-v': s.v }, [
      el('span', { class: 'rpeguide__n', text: String(s.v) }),
      el('div', {}, [
        el('p', { class: 'rpeguide__t', text: s.name }),
        el('p', { class: 'rpeguide__d', text: s.desc })
      ])
    ]));
    const guide = el('div', { class: 'rpeguide', style: 'display:none' }, rows);

    const toggle = el('button', {
      type: 'button', class: 'rpeset__help', 'aria-expanded': 'false',
      onclick: () => {
        open = !open;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.firstChild.textContent = open ? 'Hide the scale' : 'What the numbers mean';
        motion.collapse(guide, open);
      }
    }, [ el('span', { text: 'What the numbers mean' }), icon('info') ]);

    const btns = CT.RPE.scale.map(s => el('button', {
      type: 'button', class: 'rpeset__b', text: String(s.v),
      'aria-label': `${s.v} — ${s.name}. ${s.desc}`,
      onclick: () => paint(s.v, true)
    }));

    function paint(v, fire) {
      value = v;
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(CT.RPE.scale[i].v === v)));
      rows.forEach(r => r.classList.toggle('is-on', +r.dataset.v === v));
      const s = CT.RPE.scale.find(x => x.v === v);
      label.textContent = s ? s.v + ' · ' + s.name + ' — ' + s.desc : '';
      if (fire) set(v);
    }
    paint(value, false);
    set(value);

    return el('div', { class: 'rpeset' }, [
      el('div', { class: 'rpeset__row' }, btns),
      label,
      toggle,
      guide
    ]);
  }

  /* ── minutes and seconds ─────────────────────────────────
     Stored as whole seconds. Two boxes because that is how anyone
     reads a stopwatch, and 3:30 was previously either "3" or "4". */
  function durationControl(init, set) {
    let total = Math.max(0, Math.round(init || 0));

    const mins = el('input', { class: 'input', type: 'number', min: 0, step: 1,
      'aria-label': 'Minutes', value: Math.floor(total / 60), oninput: read });
    const secs = el('input', { class: 'input', type: 'number', min: 0, max: 59, step: 5,
      'aria-label': 'Seconds', value: total % 60, oninput: read });

    /* The two boxes are added, not validated against each other — 90
       typed into the seconds box is a minute and a half, which is what
       whoever typed it meant. The spinner still stops at 59. */
    function read() {
      const m = Math.max(0, Math.floor(+mins.value || 0));
      const s = Math.max(0, Math.floor(+secs.value || 0));
      total = m * 60 + s;
      set(total);
    }
    set(total);

    return el('div', { class: 'dur' }, [
      mins, el('span', { class: 'dur__u', text: 'min' }),
      secs, el('span', { class: 'dur__u', text: 'sec' })
    ]);
  }

  /* ── one of two named things ─────────────────────────── */
  function choiceControl(setName, init, set) {
    const opts = CT.CHOICES[setName] || [];
    let value = opts.some(o => o.id === init) ? init : (opts[0] || {}).id;
    const btns = opts.map(o => el('button', {
      type: 'button', class: 'choice', 'aria-pressed': String(o.id === value),
      onclick: () => paint(o.id, true)
    }, [
      el('span', { class: 'choice__n', text: o.name }),
      el('span', { class: 'choice__d', text: o.desc })
    ]));
    function paint(v, fire) {
      value = v;
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i].id === v)));
      if (fire) set(v);
    }
    set(value);
    return el('div', { class: 'choices' }, btns);
  }

  /* ── a grade, if there was one ───────────────────────────
     Traversing rarely has a grade anybody would defend, and being
     made to pick one turns the field into noise. Off by default,
     and off is stored as nothing rather than as a guess. */
  function gradeControl(ladderName, init, set) {
    const ladder = CT.GRADES[ladderName] || CT.GRADES.route;
    let value = init || null;
    let on = !!value;

    const select = el('select', { class: 'input', disabled: !on,
      onchange: e => { value = e.target.value; set(value); } },
      ladder.map(g => el('option', { value: g, text: g,
        selected: g === (value || CT.GRADE_DEFAULT[ladderName]) || null })));

    const sw = el('button', { type: 'button', class: 'switch', role: 'switch',
      'aria-checked': String(on), 'aria-label': 'Record a grade',
      onclick: () => {
        on = !on;
        sw.setAttribute('aria-checked', String(on));
        select.disabled = !on;
        value = on ? select.value : null;
        set(value);
      }
    }, [ el('span', { class: 'switch__k' }) ]);

    set(value);
    return el('div', { class: 'optgrade' }, [
      el('div', { class: 'optgrade__hd' }, [
        sw, el('span', { class: 'optgrade__l', text: 'Record a grade' })
      ]),
      select
    ]);
  }

  /* ── a distance, if anybody counted one ──────────────────
     The other half of "what you climbed". Some people leave the wall
     knowing they did 2 × 6a and 3 × 6a+; some leave knowing they did
     600 m; plenty know both and plenty only one. So this sits beside
     the grade rows rather than instead of them, and — like them — an
     empty box is stored as nothing, not as zero. A session with no
     distance against it wasn't measured, which is a different fact
     from a session where nothing was climbed. */
  function metresControl(init, set) {
    const input = el('input', { class: 'input', type: 'number', min: 0, step: 10,
      placeholder: 'Leave blank if you didn’t count',
      value: CT.metres(init) || '',
      oninput: read });

    const note = el('p', { class: 'tiny' });

    function read() {
      /* One normaliser, shared with the line that prints it back — the
         rule that blank is not zero has to mean the same thing in both
         places or a distance can be stored that can never be shown. */
      const value = CT.metres(+input.value);
      note.textContent = value === null
        ? 'Optional, and so are the grades above — record either, both or neither.'
        : value + ' m of climbing on the record for this session.';
      set(value);
    }
    read();

    return el('div', { class: 'stack', style: 'gap:7px' }, [
      el('div', { class: 'row', style: 'gap:9px' }, [
        input, el('span', { class: 'readout__u', style: 'flex:none', text: 'm' })
      ]),
      note
    ]);
  }

  /* ── what you actually climbed ───────────────────────────
     "2 × 6a, then 3 × 6a+, then 4 × 5c" is a session. The hardest
     thing in it is not, and asking only for that threw away the
     volume — which for endurance work is the point of the session.
     Rows in the order they were entered, because that is the order
     they were climbed in. */
  function climbsControl(ladderName, init, set) {
    const ladder = CT.GRADES[ladderName] || CT.GRADES.route;
    const rows = (Array.isArray(init) ? init : [])
      .filter(r => r && r.grade)
      .map(r => ({ grade: r.grade, count: Math.max(1, r.count || 1) }));

    const list = el('div', { class: 'climbs__list' });
    const summary = el('p', { class: 'climbs__sum' });
    const add = el('button', { type: 'button', class: 'btn btn--quiet btn--sm climbs__add',
      onclick: () => {
        const last = rows[rows.length - 1];
        rows.push({ grade: last ? last.grade : (CT.GRADE_DEFAULT[ladderName] || ladder[0]), count: 1 });
        paint(rows.length - 1);
      } }, [ icon('plus'), 'Add a grade' ]);

    function paint(focusRow) {
      CT.ui.clear(list);
      rows.forEach((r, i) => {
        const count = el('span', { class: 'climbs__n', text: String(r.count) });
        const step = d => {
          r.count = Math.max(1, Math.min(99, r.count + d));
          count.textContent = String(r.count);
          motion.pop(count, .7);
          commit();
        };
        list.appendChild(el('div', { class: 'climbs__r' }, [
          el('div', { class: 'stepper stepper--sm' }, [
            el('button', { type: 'button', onclick: () => step(-1), 'aria-label': 'One fewer' }, [ icon('minus') ]),
            count,
            el('button', { type: 'button', onclick: () => step(1), 'aria-label': 'One more' }, [ icon('plus') ])
          ]),
          el('span', { class: 'climbs__x', text: '×' }),
          el('select', { class: 'input climbs__g', 'aria-label': 'Grade',
            onchange: e => { r.grade = e.target.value; commit(); } },
            ladder.map(g => el('option', { value: g, text: g, selected: g === r.grade || null }))),
          el('button', { type: 'button', class: 'climbs__rm', 'aria-label': 'Remove this grade',
            onclick: () => { rows.splice(i, 1); paint(); } }, [ icon('x') ])
        ]));
      });
      if (!rows.length) list.appendChild(el('p', { class: 'tiny climbs__none',
        text: 'Nothing added yet — one row per grade you climbed.' }));
      commit();
      if (focusRow != null && motion.on) motion.pop(list.children[focusRow], .94);
    }

    function commit() {
      const clean = rows.filter(r => r.count > 0).map(r => ({ grade: r.grade, count: r.count }));
      const n = CT.climbs.total(clean);
      const top = CT.climbs.hardest(clean, ladderName);
      summary.textContent = !n ? 'No climbs logged yet'
        : `${n} ${n === 1 ? 'climb' : 'climbs'}${top ? ' · hardest ' + top : ''}`;
      set(clean);
    }

    paint();
    return el('div', { class: 'climbs' }, [ list, el('div', { class: 'climbs__ft' }, [ add, summary ]) ]);
  }

  /* ═══════════════ which kind of session? ═══════════════
     Nothing in the app opens a log without knowing what it is.

     All three kinds are always on offer, Power Endurance included. It
     used to be withheld until the block reached its power-endurance
     weeks, which quietly made the log a record of the plan: an athlete
     who did 4×4s in week two had done them, and the app's answer was
     that they couldn't have. The phase is still said out loud — it is
     real, and doing anaerobic work early is worth knowing about — it
     simply no longer refuses the entry. */
  CT.views.chooseLog = function (c, opts) {
    const date = opts.date || dt.iso(dt.today());
    /* By the week the session happened in, not the week the athlete is
       in today — a backdated log belongs to the day it was climbed. */
    const peOpen = S.weekIndex(c, date) >= c.block.peFromWeek;
    const kinds = [
      ['strength',  'Strength',        'Hangboard max hangs, or limit bouldering'],
      ['endurance', 'Endurance',       'Routes, traversing, edge pulls, 1-on-1-off'],
      ['pe',        'Power Endurance', 'Boulder 4×4s, wall crawls, repeaters']
    ];

    const body = el('div', { class: 'sheet__bd' }, [
      el('div', { class: 'picker', style: 'grid-template-columns:1fr' }, kinds.map(([id, name, desc]) =>
        el('button', { class: 'pick', onclick: () => { CT.sheet.close(true); CT.openLog(id, opts); } }, [
          el('div', { class: 'row', style: 'gap:10px' }, [
            el('span', { class: 'quick__dot quick__dot--' + (id === 'strength' ? 's' : id === 'pe' ? 'p' : 'e') }),
            el('p', { class: 'pick__n', text: name }),
            id === 'pe' && !peOpen
              ? el('span', { class: 'chip', style: 'margin-left:auto', text: 'Outside the plan' }) : null
          ]),
          el('p', { class: 'pick__d', style: 'margin-left:17px', text: desc })
        ])
      )),
      peOpen
        ? null
        : el('p', { class: 'tiny', text:
            `The plan holds Power Endurance back until week ${c.block.peFromWeek}, the final three of the ` +
            `block. Log one anyway if that is what was climbed — it goes on the record and into the ` +
            `history like any other session, it just isn’t filling a target this week.` })
    ]);

    /* Which day and whose are separate questions, and asking the first
       one first used to swallow the answer to the second. The dated
       path is the one reached by tapping a past day on somebody's
       calendar — the likeliest place in the app to file against the
       wrong athlete, and the only way into this sheet carrying a date. */
    const backdated = opts.date && opts.date !== dt.iso(dt.today());
    const who = S.forOther(c) ? c.name : 'you';
    CT.sheet.open({
      eyebrow: S.forOther(c) ? 'New session · ' + c.name : 'New session',
      title: backdated ? `What did ${who} do on ${dt.short(opts.date)}?`
           : S.forOther(c) ? `What did ${c.name} do?`
           : 'What are you logging?',
      sub: 'You can change the date on the next screen.',
      body
    });
  };

  /* ═══════════════ planning a future day ═══════════════
     A day that hasn't happened yet can't be logged — pick the kind of
     session and it lands on the plan as a placeholder, to be logged on
     the day itself. Power Endurance is offered whatever week the date
     falls in — a coach who wants one on the calendar in week two is
     making a decision about training, not making a mistake. The week
     it opens is still on screen. */
  CT.views.planSlot = function (c, date) {
    /* The block, because the block is what the next line reads. A
       record can briefly exist without one — onboarding writes the
       athlete and its plan as two steps — and the guard that used to
       stand here tested something else entirely while naming this. */
    if (!c || !c.block) {
      toast('Nothing to plan against', 'There’s no block on this record yet.');
      return;
    }
    /* The true week, not the week clamped into the plan: a day past the
       end of the block is outside it, not in its final week. */
    const peOpen = S.weekIndex(c, date) >= c.block.peFromWeek;
    const kinds = [
      ['strength',  'Strength',        'Max hangs or limit bouldering'],
      ['endurance', 'Endurance',       'Routes, traversing, edge pulls, 1-on-1-off'],
      ['pe',        'Power Endurance', 'Boulder 4×4s, wall crawls, repeaters']
    ];

    const place = type => {
      if (!S.addPlannedSlot(c, date, type)) {
        toast('That day is full', `${dt.short(date)} already has ${S.maxPerDay} sessions.`);
        return;
      }
      CT.sheet.close();
      CT.render(false);
      toast(CT.TYPE[type].label + ' planned',
        `${dt.short(date)} · ${S.forOther(c) ? c.name + ' logs it on the day.' : 'log it on the day.'}`);
    };

    const body = el('div', { class: 'sheet__bd' }, [
      el('div', { class: 'picker', style: 'grid-template-columns:1fr' }, kinds.map(([id, name, desc]) =>
        el('button', { class: 'pick', onclick: () => place(id) }, [
          el('div', { class: 'row', style: 'gap:10px' }, [
            el('span', { class: 'quick__dot quick__dot--' + (id === 'strength' ? 's' : id === 'pe' ? 'p' : 'e') }),
            el('p', { class: 'pick__n', text: name }),
            id === 'pe' && !peOpen
              ? el('span', { class: 'chip', style: 'margin-left:auto', text: 'Outside the plan' }) : null
          ]),
          el('p', { class: 'pick__d', style: 'margin-left:17px', text: desc })
        ])
      )),
      el('p', { class: 'tiny', text: peOpen
        ? `It joins ${S.whose(c)} plan as a suggested session — drag it to another day any time.`
        : `It joins ${S.whose(c)} plan as a suggested session. Power Endurance isn’t scheduled until ` +
          `week ${c.block.peFromWeek}, so one placed here is an addition to the block rather than part of it.` })
    ]);

    CT.sheet.open({
      eyebrow: 'Plan ahead',
      title: S.forOther(c)
        ? `What are you planning for ${c.name} on ${dt.short(date)}?`
        : 'What are you planning for ' + dt.short(date) + '?',
      sub: dt.relative(date) + ' — nothing is logged until the day itself',
      body
    });
  };

  /* ═══════════════ a planned session ═══════════════
     Nothing is recorded against it yet, so there are only two things to do
     with one: log it, or get rid of it. Which of those is on offer depends
     on whether the day has happened. Removing takes the usual one step of
     friction — the button arms itself first. */
  CT.views.slotSheet = function (c, slot) {
    const T = CT.TYPE[slot.type];
    const todayISO = dt.iso(dt.today());
    const future = slot.date > todayISO;
    const missed = S.slotStatus(c, slot) === 'missed';

    /* how thin the week gets if this one goes */
    const asks = slot.type === 'pe' && slot.week < c.block.peFromWeek ? 0 : c.targets[slot.type];
    const planned = c.slots.filter(s => s.week === slot.week && s.type === slot.type).length;

    const cell = (label, value) => el('div', {}, [ el('dt', { text: label }), el('dd', { text: value }) ]);

    const body = el('div', { class: 'sheet__bd' }, [
      el('dl', { class: 'proto' }, [
        cell('Day', dt.short(slot.date)),
        cell('When', dt.relative(slot.date)),
        cell('Status', missed ? 'Missed' : 'Suggested')
      ]),
      el('p', { class: 'sub', text: slot.type === 'strength'
        ? `Prescribed ${CT.fmtLoad(c.prescribed.tfd)} drag · ${CT.fmtLoad(c.prescribed.half)} half-crimp`
        : T.detail }),
      planned <= asks
        ? el('div', { class: 'nudge' }, [ icon('info'), el('p', {
            html: `${S.Whose(c)} week asks for <b>${asks} ${T.label}</b>. ` +
                  `Remove this and ${planned - 1} ` +
                  `${planned - 1 === 1 ? 'is' : 'are'} left planned — one can still be logged on any day.` }) ])
        : null,
      el('p', { class: 'tiny', text: future
        ? 'Nothing is logged against a planned session until the day itself.'
        : 'Drag it to another day, or use ← → when it’s focused.' })
    ]);

    const footer = el('div', { class: 'sheet__ft' }, [
      CT.deleteButton(() => {
        S.removeSlot(c, slot.id);
        CT.sheet.close();
        CT.render(false);
        toast(`Removed from ${S.whose(c)} plan`, `${T.label} on ${dt.short(slot.date)} is gone. Nothing was logged.`);
      }, 'Remove from plan'),
      el('p', { class: 'sub', text: future ? 'Planned · ' + dt.relative(slot.date) : missed ? 'Not logged' : 'Due today' }),
      future ? null : el('button', { class: 'btn btn--primary',
        onclick: () => { CT.sheet.close(true); CT.openLog(slot.type, { date: slot.date, slotId: slot.id }); } },
        [ icon('check'), missed ? 'Log it late' : 'Log it' ])
    ]);

    CT.sheet.open({
      eyebrow: future ? 'Planned' : missed ? 'Missed' : 'Today',
      title: T.label,
      sub: `${dt.short(slot.date)} · nothing logged against it yet`,
      body, footer
    });
  };

  /* ═══════════════ bodyweight ═══════════════ */
  CT.views.weightLog = function (c, opts) {
    opts = opts || {};
    const editing = opts.date ? c.bodyweight.find(b => b.date === opts.date) : null;
    /* Read fresh rather than captured: the list below can delete the
       reading these lines are describing. */
    const last = () => c.bodyweight[c.bodyweight.length - 1] || null;
    const first = last();
    const dateBar = CT.dateBar(c, editing ? editing.date : null, () => sync());

    const input = el('input', { class: 'input', type: 'number', step: 0.1, min: 20, max: 200,
      value: editing ? editing.kg.toFixed(1) : first ? first.kg.toFixed(1) : '', placeholder: '00.0',
      style: 'font-size:28px;height:64px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums',
      oninput: () => sync() });

    const delta = el('p', { class: 'tiny' });
    const footNote = el('p', { class: 'sub' });
    const saveBtn = el('button', { class: 'btn btn--primary', onclick: save },
      [ icon('check'), editing ? 'Save changes' : 'Save reading' ]);

    function sync() {
      const v = parseFloat(input.value);
      const ok = !isNaN(v) && v >= 20 && v <= 200;
      const prev = last();
      saveBtn.disabled = !ok;
      const existing = c.bodyweight.find(b => b.date === dateBar.get());
      delta.textContent = !ok ? 'Enter a weight between 20 and 200 kg.'
        : existing ? `Replaces the ${existing.kg.toFixed(1)} kg reading already on ${dt.short(dateBar.get())}.`
        : prev ? `${(v - prev.kg) >= 0 ? '+' : ''}${(v - prev.kg).toFixed(1)} kg since ${dt.short(prev.date)}.`
        : `This becomes ${S.whose(c)} first reading.`;
      footNote.textContent = prev ? `Last reading ${prev.kg.toFixed(1)} kg, ${dt.relative(prev.date)}` : 'No readings yet';
    }

    function save() {
      const v = parseFloat(input.value), date = dateBar.get();
      const prev = last();
      const who = S.forOther(c) ? c.name + ' · ' : '';
      /* moving an edited reading to a different day leaves nothing behind */
      if (editing && date !== editing.date) S.deleteBodyweight(c, editing.date);
      S.logBodyweight(c, date, +v.toFixed(1));
      CT.sheet.close();
      CT.render(false);
      if (editing) return toast('Reading updated', who + dt.short(date) + ' · ' + v.toFixed(1) + ' kg');
      toast(date === dt.iso(dt.today()) ? 'Weight logged' : 'Logged for ' + dt.short(date),
            who + v.toFixed(1) + ' kg' + (prev ? ` · ${(v - prev.kg) >= 0 ? '+' : ''}${(v - prev.kg).toFixed(1)} kg since last time` : ''));
    }

    /* ── what's already on record ──
       A number typed once and regretted — a guess at onboarding, a
       reading in boots — sits in the trend and drags every chart that
       reads off it. Removing one used to mean knowing to open Progress,
       flip the bodyweight card to Table and tap a row; that path still
       works and this is the same act, put where somebody who has just
       realised the old number is wrong is already standing. */
    const listHost = el('div');

    function paintList() {
      CT.ui.clear(listHost);
      if (!c.bodyweight.length) return;
      const all = c.bodyweight.slice().reverse();
      const rows = all.slice(0, 8);

      listHost.appendChild(el('p', { class: 'eyebrow',
        text: all.length > rows.length ? `On record · latest ${rows.length} of ${all.length}` : 'On record' }));
      listHost.appendChild(el('div', { class: 'cflist', style: 'margin-top:10px' }, rows.map(b => {
        const on = !!editing && b.date === editing.date;
        return el('div', { class: 'cflist__r' + (on ? ' is-on' : '') }, [
          el('button', { class: 'cflist__pick', 'aria-pressed': String(on),
            title: 'Open ' + dt.short(b.date) + ' to change it',
            onclick: () => CT.views.weightLog(c, { date: b.date }) }, [
            el('div', {}, [
              el('p', { class: 'cflist__d', text: b.kg.toFixed(1) + ' kg' }),
              el('p', { class: 'tiny', text: dt.short(b.date) })
            ]),
            on ? el('span', { class: 'chip chip--spruce', text: 'Editing' }) : null
          ]),
          CT.armButton(() => {
            S.deleteBodyweight(c, b.date);
            CT.render(false);
            toast('Reading deleted',
              `${S.forOther(c) ? c.name + ' · ' : ''}${b.kg.toFixed(1)} kg on ${dt.short(b.date)} is off the trend.`);
            /* Deleting the one this sheet was opened to edit leaves it
               editing nothing, so it gets out of the way. */
            if (on) return CT.sheet.close();
            paintList();
            sync();
          }, 'Delete', 'Tap again', 'btn btn--quiet btn--sm')
        ]);
      })));
      listHost.appendChild(el('p', { class: 'tiny', style: 'margin-top:10px', text:
        'Tap a reading to change it, or delete it outright. Only the trend and the charts move — ' +
        `${S.whose(c)} loads keep the bodyweight they were actually worked out from.` }));
    }

    CT.sheet.open({
      eyebrow: CT.logEyebrow(c, 'Bodyweight', editing),
      title: editing ? 'Edit reading' : 'Log a reading',
      sub: S.forOther(c)
        ? `A reading on ${c.name}’s record — the trend matters more than any one number`
        : 'Whenever you weigh in — the trend matters more than any one number',
      body: el('div', { class: 'sheet__bd' }, [
        dateBar,
        el('div', { class: 'field' }, [
          el('label', { text: 'Weight' }),
          el('div', { class: 'row', style: 'gap:10px' }, [
            input, el('span', { class: 'readout__u', style: 'flex:none', text: 'kg' })
          ]),
          delta
        ]),
        listHost
      ]),
      footer: el('div', { class: 'sheet__ft' }, [
        editing ? CT.deleteButton(() => {
          S.deleteBodyweight(c, editing.date);
          CT.sheet.close(); CT.render(false);
          toast('Reading deleted',
            `${S.forOther(c) ? c.name + ' · ' : ''}${dt.short(editing.date)} removed from the trend.`);
        }) : null,
        footNote,
        saveBtn
      ])
    });
    paintList();
    sync();
  };

  CT.views.sessionLog = function (c, type, opts) {
    const editing = opts.sessionId ? S.session(c, opts.sessionId) : null;
    if (editing) type = editing.type;
    const mods = CT.MODALITIES[type];
    const T = CT.TYPE[type];
    let modality = editing ? editing.modality : opts.modality || null;
    const values = {};

    let sheet = null;
    const dateBar = CT.dateBar(c, editing ? editing.date : opts.date, () => syncPhase());
    const formHost = el('div', { style: 'display:none' });
    const saveBtn = el('button', { class: 'btn btn--primary', disabled: true, onclick: save },
      [ icon('check'), editing ? 'Save changes' : 'Save session' ]);
    const summary = el('p', { class: 'sub', text: 'Pick what you did' });

    const picker = el('div', { class: 'picker' }, mods.map(m =>
      el('button', {
        class: 'pick', 'aria-pressed': String(modality === m.id),
        onclick: () => choose(m.id)
      }, [
        el('p', { class: 'pick__n', text: m.name }),
        el('p', { class: 'pick__d', text: m.desc })
      ])
    ));

    function choose(id) {
      /* Is the form still folded away? Asked of the node, because the
         thing that has to be undone is the node being hidden — and the
         proxy that used to stand in for it ("no modality picked yet")
         is false on the one path that needs it most. A sheet opened to
         edit arrives with the modality already chosen, so that test
         said "not the first time", the reveal was skipped, and the
         whole form stayed at display:none behind a picker with nothing
         under it. */
      const folded = formHost.style.display === 'none';
      modality = id;
      [...picker.children].forEach((b, i) => b.setAttribute('aria-pressed', String(mods[i].id === id)));
      buildForm();
      summary.textContent = mods.find(m => m.id === id).name;
      saveBtn.disabled = false;
      if (folded) motion.collapse(formHost, true);
      else if (motion.on) motion.enter(formHost, '.field');
    }

    function buildForm() {
      CT.ui.clear(formHost);
      Object.keys(values).forEach(k => delete values[k]);
      const grid = el('div', { class: 'formgrid' });

      const prior = editing && editing.modality === modality ? editing.fields : null;

      /* Only a field the athlete had already answered is carried over —
         an absent one falls back to the schema's default, and for the
         optional grade "absent" is itself an answer. */
      const held = k => prior && Object.prototype.hasOwnProperty.call(prior, k);

      CT.FORMS[modality].forEach(([key, label, kind, def]) => {
        const set = v => values[key] = v;
        const options = kind === 'select' ? String(def).split(',') : null;
        let init = options ? options[Math.floor(options.length / 2)] : def;
        if (kind === 'climbs') init = [];
        if (kind === 'grade') init = null;                  // absent unless it was answered
        if (kind === 'metres') init = null;                 // ditto — blank is an answer
        if (held(key) && prior[key] !== null) init = prior[key];

        let control, wide = false;
        if (options) {
          set(init);
          control = el('select', { class: 'input', onchange: e => set(e.target.value) },
            options.map(o => el('option', { value: o, text: o, selected: o === init || null })));
        } else if (kind === 'rpe') {
          wide = true;
          /* Stored alongside the number: which scale it is on. Without
             it a 4 from before the change reads as "had to try hard"
             when it meant something nearer the opposite. */
          values[CT.RPE.key] = CT.RPE.max;
          control = rpeControl(init, set);
        } else if (kind === 'duration') {
          control = durationControl(init, set);
        } else if (kind === 'choice') {
          wide = true;
          control = choiceControl(def, init, set);
        } else if (kind === 'grade') {
          control = gradeControl(def, init, set);
        } else if (kind === 'metres') {
          control = metresControl(init, set);
        } else if (kind === 'climbs') {
          wide = true;
          control = climbsControl(def, init, set);
        } else {
          set(init);
          control = el('div', { class: 'row', style: 'gap:9px' }, [
            el('input', { class: 'input', type: 'number', value: init, min: 0, step: kind === 'kg' ? 0.5 : 1,
              oninput: e => set(+e.target.value) }),
            UNIT[kind] ? el('span', { class: 'readout__u', style: 'flex:none', text: UNIT[kind] }) : null
          ]);
        }

        grid.appendChild(el('div', { class: 'field' + (wide ? ' span2' : '') }, [
          el('label', { text: label + (kind === 'rpe' ? ' — RPE 1 to 5'
                                     : kind === 'metres' ? ' — optional' : '') }),
          control
        ]));
      });

      formHost.appendChild(grid);
      formHost.appendChild(el('div', { class: 'field', style: 'margin-top:14px' }, [
        el('label', { text: 'Notes' }),
        el('textarea', { class: 'input', id: 'eNotes', text: editing ? editing.notes : '',
          placeholder: type === 'pe' ? 'How the last set felt. Where it fell apart.' : 'Terrain, partners, how it felt.' })
      ]));
    }

    function save() {
      const date = dateBar.get();
      const notesEl = CT.ui.$('#eNotes', formHost);
      const payload = { date, modality, fields: Object.assign({}, values),
                        notes: notesEl ? notesEl.value.trim() : '' };

      const who = S.forOther(c) ? c.name + ' · ' : '';

      if (editing) {
        S.updateSession(c, editing.id, payload);
        CT.sheet.close(); CT.render(false);
        toast('Session updated', who + dt.short(date) + ' · ' + mods.find(m => m.id === modality).name);
        return;
      }

      const before = S.streak(c);
      S.logSession(c, Object.assign({ type }, payload));
      CT.sheet.close();
      toast(date === dt.iso(dt.today()) ? 'Logged' : 'Logged for ' + dt.short(date),
            mods.find(m => m.id === modality).name + ` added to ${S.whose(c)} week.`);
      CT.afterLog(c, before);
    }

    const body = el('div', { class: 'sheet__bd' }, [
      dateBar,
      el('div', {}, [
        el('p', { class: 'eyebrow', style: 'margin-bottom:10px',
          text: S.forOther(c) ? `What ${c.name} did` : 'What did you do' }),
        picker
      ]),
      formHost
    ]);

    /* Power endurance in a week the plan doesn't schedule it is a
       session that happened, so the sheet says where it stands rather
       than refusing it — and says it about the date on the bar, which
       is still being edited. Read once at open, the line went on
       insisting a session was in phase after it had been backdated out
       of one, and the other way round. */
    function phaseSub() {
      if (type !== 'pe') return 'Aerobic capacity — the volume that carries the block';
      return S.weekIndex(c, dateBar.get()) < c.block.peFromWeek
        ? `Anaerobic work — the plan schedules it from week ${c.block.peFromWeek}, but a session done ` +
          `earlier still counts toward the history`
        : 'Anaerobic work — scheduled in the final three weeks of the block';
    }
    function syncPhase() {
      const n = sheet && CT.ui.$('.sheet__sub', sheet);
      if (n) n.textContent = phaseSub();
    }

    sheet = CT.sheet.open({
      eyebrow: CT.logEyebrow(c, T.label, editing),
      title: type === 'pe' ? 'Power Endurance' : 'Endurance',
      sub: phaseSub(),
      body,
      footer: el('div', { class: 'sheet__ft' }, [
        editing ? CT.deleteButton(() => {
          S.deleteSession(c, editing.id);
          CT.sheet.close(); CT.render(false);
          toast('Session deleted', `${dt.short(editing.date)} cleared from ${S.whose(c)} week.`);
        }) : null,
        summary, saveBtn
      ])
    });

    if (modality) choose(modality);
  };
})();
