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
  /* Routes picked out of the guidebook carry their own lengths, so the
     box can fill itself — but only until somebody disagrees with it.
     `touched` is that line: once a number has been typed here by hand
     it is an answer, and an answer is not something the app gets to
     overwrite because a row moved. A total that no longer matches is
     then offered rather than applied, which is the difference between
     a convenience and a correction nobody asked for.

     A session opened for editing arrives touched, because whatever is
     on the record was typed by somebody once already. */
  function metresControl(init, set) {
    let touched = CT.metres(init) !== null;
    let fromRoutes = 0;

    const input = el('input', { class: 'input', type: 'number', min: 0, step: 10,
      placeholder: 'Leave blank if you didn’t count',
      value: CT.metres(init) || '',
      oninput: () => { touched = true; read(); } });

    const note = el('p', { class: 'tiny' });
    const use = el('button', { type: 'button', class: 'btn btn--quiet btn--sm', style: 'display:none',
      onclick: () => { input.value = fromRoutes; touched = false; read(); } });

    function read() {
      /* One normaliser, shared with the line that prints it back — the
         rule that blank is not zero has to mean the same thing in both
         places or a distance can be stored that can never be shown. */
      const value = CT.metres(+input.value);
      const matches = value === fromRoutes;
      const offer = fromRoutes > 0 && !matches;

      use.style.display = offer ? '' : 'none';
      if (offer) use.textContent = 'Use ' + fromRoutes + ' m';

      note.textContent =
        offer && value === null ? `The routes you picked add up to ${fromRoutes} m.`
        : offer                 ? `${value} m recorded — the routes you picked add up to ${fromRoutes} m.`
        : matches && value      ? `${value} m, added up from the routes you picked.`
        : value === null        ? 'Optional, and so are the grades above — record either, both or neither.'
        : value + ' m of climbing on the record for this session.';
      set(value);
    }
    read();

    const node = el('div', { class: 'stack', style: 'gap:7px' }, [
      el('div', { class: 'row', style: 'gap:9px' }, [
        input, el('span', { class: 'readout__u', style: 'flex:none', text: 'm' }), use
      ]),
      note
    ]);

    /* What the climbs above it add up to, handed down every time they
       change. Nothing is filled in once the box has been typed in. */
    node.auto = function (metres) {
      fromRoutes = Math.max(0, Math.round(metres || 0));
      if (!touched) input.value = fromRoutes || '';
      read();
    };
    return node;
  }

  /* ── what you actually climbed ───────────────────────────
     "2 × 6a, then 3 × 6a+, then 4 × 5c" is a session. The hardest
     thing in it is not, and asking only for that threw away the
     volume — which for endurance work is the point of the session.
     Rows in the order they were entered, because that is the order
     they were climbed in. */
  function climbsControl(ladderName, init, set, opts) {
    const o = opts || {};
    const ladder = CT.GRADES[ladderName] || CT.GRADES.route;
    /* Which half of the guidebook this log is allowed to search, or
       nothing at all — indoor modalities keep the control they had. */
    const systems = CT.crags ? CT.crags.systemsFor(o.modality) : null;

    /* A row survives if it says what was climbed: a grade off the
       ladder, or a route out of the guidebook. Trad has the second
       without the first, which is exactly why the test is an either. */
    const rows = (Array.isArray(init) ? init : [])
      .filter(r => r && (r.grade || (r.route && r.route.name)))
      .map(r => ({
        grade: r.grade || null,
        count: Math.max(1, r.count || 1),
        route: r.route ? Object.assign({}, r.route) : null
      }));

    const list = el('div', { class: 'climbs__list' });
    const summary = el('p', { class: 'climbs__sum' });
    const add = el('button', { type: 'button', class: 'btn btn--quiet btn--sm climbs__add',
      onclick: () => {
        const last = rows.filter(r => !r.route).pop();
        rows.push({ grade: last ? last.grade : (CT.GRADE_DEFAULT[ladderName] || ladder[0]),
                    count: 1, route: null });
        paint(rows.length - 1);
      } }, [ icon('plus'), 'Add a grade' ]);

    /* Where a route is and how long it is, as one line. The search
       results and the rows they turn into say exactly the same thing
       about a route, so they say it through one function — two
       versions of this drifted apart within a day of each other
       existing, and the version in the row was the worse one. */
    function routeMeta(route, length) {
      return [
        route.grade,
        [ route.crag, route.area ].filter(Boolean).join(' › '),
        length ? length + ' m' : null
      ].filter(Boolean).join(' · ');
    }

    /* ── one row ─────────────────────────────────────────────
       Two shapes on one grid, so a list holding both lines up down
       its edges instead of stepping in and out as the rows change
       kind. Count first either way — the stepper is what says how
       many, and the × that used to follow it only ever read properly
       against a grade. Beside a route name it was a stray mark, and
       keeping it for one kind of row and not the other was what put
       the two kinds twenty pixels out of line with each other.

       A grade somebody chose is a dropdown: the ladder is the whole
       of what they're saying. A route out of the guidebook is a name
       and a fact underneath it — its grade is not a choice, so it is
       shown rather than offered.

       The meta is one ellipsising line rather than a row of chips and
       spans. Those wrapped, and a wrapped route row pushed the ones
       under it around every time somebody typed. */
    function rowShell(r, i, label, body, extra) {
      return el('div', { class: 'climbs__r' + (r.route ? ' climbs__r--route' : '') }, [
        el('div', { class: 'stepper stepper--sm' }, [
          el('button', { type: 'button', onclick: () => step(r, -1), 'aria-label': 'One fewer' }, [ icon('minus') ]),
          countNode(r),
          el('button', { type: 'button', onclick: () => step(r, 1), 'aria-label': 'One more' }, [ icon('plus') ])
        ]),
        el('div', { class: 'climbs__body' }, extra ? [ body, extra ] : [ body ]),
        el('button', { type: 'button', class: 'climbs__rm', 'aria-label': label,
          onclick: () => { rows.splice(i, 1); paint(); } }, [ icon('x') ])
      ]);
    }

    function routeRow(r, i) {
      const known = typeof r.route.length === 'number' && r.route.length > 0;

      const body = el('div', { class: 'climbs__rt' }, [
        el('p', { class: 'climbs__rn', text: r.route.name }),
        el('p', { class: 'climbs__rmeta', text: routeMeta(r.route, known ? r.route.length : null) })
      ]);

      /* A line of its own rather than a box wedged into the meta. It
         is a question being asked, which is a different kind of thing
         from the three facts above it, and it needs room to be one. */
      let ask = null;
      if (!known) {
        const lenBox = el('input', {
          class: 'input climbs__len', type: 'number', min: 1, max: 200, step: 1,
          placeholder: '—', 'aria-label': 'Length of ' + r.route.name + ' in metres',
          oninput: () => {
            const m = Math.round(+lenBox.value);
            r.route.length = isFinite(m) && m > 0 && m <= 200 ? m : null;
            commit();
          },
          /* Shared only once it has stopped being typed. On `input` the
             first digit of "24" is a 2, and a 2 is what everybody else
             would then have been told the route is. */
          onchange: () => {
            if (typeof r.route.length === 'number') shareLength(r.route.id, r.route.length);
          }
        });
        /* Box first, explanation after. The other way round the note
           took the whole width on a phone and left the input stranded
           on a line of its own. */
        ask = el('div', { class: 'climbs__ask' }, [
          lenBox,
          el('span', { class: 'tiny', text: 'm' }),
          el('span', { class: 'tiny climbs__asknote', text: 'no length on record' })
        ]);
      }

      return rowShell(r, i, 'Remove ' + r.route.name, body, ask);
    }

    function gradeRow(r, i) {
      const select = el('select', { class: 'input climbs__g', 'aria-label': 'Grade',
        onchange: e => { r.grade = e.target.value; commit(); } },
        ladder.map(g => el('option', { value: g, text: g, selected: g === r.grade || null })));
      return rowShell(r, i, 'Remove this grade', select, null);
    }

    function countNode(r) {
      const n = el('span', { class: 'climbs__n', text: String(r.count) });
      r._n = n;
      return n;
    }
    function step(r, d) {
      r.count = Math.max(1, Math.min(99, r.count + d));
      r._n.textContent = String(r.count);
      motion.pop(r._n, .7);
      commit();
    }

    function paint(focusRow) {
      CT.ui.clear(list);
      rows.forEach((r, i) => list.appendChild(r.route ? routeRow(r, i) : gradeRow(r, i)));
      if (!rows.length) list.appendChild(el('p', { class: 'tiny climbs__none',
        text: systems
          ? 'Nothing added yet — find the routes you climbed, or add grades by hand.'
          : 'Nothing added yet — one row per grade you climbed.' }));
      commit();
      if (focusRow != null && motion.on) motion.pop(list.children[focusRow], .94);
    }

    function commit() {
      const clean = rows.filter(r => r.count > 0).map(r => {
        const out = { grade: r.grade || null, count: r.count };
        if (r.route) out.route = {
          id: r.route.id, name: r.route.name, crag: r.route.crag,
          area: r.route.area || '', grade: r.route.grade,
          length: typeof r.route.length === 'number' ? r.route.length : null
        };
        return out;
      });
      const n = CT.climbs.total(clean);
      const top = CT.climbs.hardest(clean, ladderName);
      /* Trad routes count as climbs and win no comparisons, so a day
         entirely on them reads "4 climbs" with nothing after it. That
         is the whole of what the app can honestly say about it. */
      summary.textContent = !n ? 'No climbs logged yet'
        : `${n} ${n === 1 ? 'climb' : 'climbs'}${top ? ' · hardest ' + top : ''}`;
      set(clean);
      if (o.onMetres) o.onMetres(CT.climbs.metres(clean));
    }

    /* A length typed against a route the guidebook left blank. It
       counts for this session either way; sharing it is a bonus that
       is allowed to fail — no signal at the crag, or somebody else
       filled the same blank first, and neither is worth a word on
       screen while the athlete is mid-log. */
    function shareLength(id, m) {
      if (CT.crags) CT.crags.overrides[id] = m;
      if (CT.repo && CT.repo.saveRouteLength) CT.repo.saveRouteLength(id, m);
    }

    paint();

    const foot = el('div', { class: 'climbs__ft' }, [ add, summary ]);
    const wrap = el('div', { class: 'climbs' }, [ list, foot ]);
    if (systems) buildSearch(wrap, foot, systems, route => {
      rows.push({ grade: route.rung || null, count: 1, route: CT.crags.stored(route) });
      paint(rows.length - 1);
    });
    return wrap;

    /* ── finding a route ─────────────────────────────────────
       Inline, because a sheet cannot open over a sheet — CT.sheet.open
       closes whatever is already there, which would take the half-
       filled log with it. So the picker unfolds inside the form, the
       same way the effort scale does. */
    function buildSearch(host, footer, systems, pick) {
      let open = false;

      const results = el('div', { class: 'rsearch__list' });
      const cragSel = el('select', { class: 'input', 'aria-label': 'Crag',
        onchange: run },
        [ el('option', { value: '', text: 'All crags' }) ].concat(
          CT.crags.cragsFor(systems).map(c => el('option', { value: c, text: c }))));

      const box = el('input', { class: 'input', type: 'search', autocomplete: 'off',
        placeholder: 'Route name', 'aria-label': 'Search ' + CT.crags.venue + ' by route name',
        oninput: run,
        onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); const f = results.firstChild;
                          if (f && f.tagName === 'BUTTON') f.click(); } } });

      function run() {
        const hits = CT.crags.search(box.value, { systems, crag: cragSel.value || null, limit: 25 });
        CT.ui.clear(results);
        if (!hits.length) {
          results.appendChild(el('p', { class: 'tiny', style: 'padding:8px 2px',
            text: box.value.trim() ? 'Nothing at ' + CT.crags.venue + ' by that name.'
                                   : 'Type a route name.' }));
          return;
        }
        hits.forEach(r => {
          const len = CT.crags.length(r.id);
          results.appendChild(el('button', { type: 'button', class: 'rsearch__r',
            onclick: () => { pick(r); toggle(false); box.value = ''; run(); } }, [
            el('p', { class: 'rsearch__n', text: r.name }),
            el('p', { class: 'rsearch__d',
              text: routeMeta(r, len) + (len ? '' : ' · no length on record') })
          ]));
        });
      }

      const panel = el('div', { class: 'rsearch', style: 'display:none' }, [
        el('div', { class: 'rsearch__hd' }, [ cragSel, box ]),
        results
      ]);

      const find = el('button', { type: 'button', class: 'btn btn--quiet btn--sm climbs__add',
        'aria-expanded': 'false', onclick: () => toggle(!open) },
        [ icon('spark'), 'Find a route' ]);

      function toggle(next) {
        open = next;
        find.setAttribute('aria-expanded', String(open));
        motion.collapse(panel, open);
        if (open) setTimeout(() => box.focus({ preventScroll: true }), 60);
      }

      /* Beside "Add a grade", not instead of it — a day at the crag is
         usually some routes you can name and some you can't. */
      footer.insertBefore(find, footer.firstChild.nextSibling);
      host.appendChild(panel);
      run();
    }
  }

  /* ═══════════════ which kind of session? ═══════════════
     Nothing in the app opens a log without knowing what it is.

     All four kinds are always on offer, Power Endurance included. It
     used to be withheld until the block reached its power-endurance
     weeks, which quietly made the log a record of the plan: an athlete
     who did 4×4s in week two had done them, and the app's answer was
     that they couldn't have. The phase is still said out loud — it is
     real, and doing anaerobic work early is worth knowing about — it
     simply no longer refuses the entry.

     Climbing sits last and is marked as outside the plan, which is not
     a demotion — it is the one kind here nobody prescribed. */
  CT.views.chooseLog = function (c, opts) {
    const date = opts.date || dt.iso(dt.today());
    /* By the week the session happened in, not the week the athlete is
       in today — a backdated log belongs to the day it was climbed. */
    const peOpen = S.weekIndex(c, date) >= S.peFromWeek(c);
    const kinds = [
      ['strength',  'Strength',        'Hangboard max hangs, or limit bouldering'],
      ['endurance', 'Endurance',       'Routes, traversing, edge pulls, intervals'],
      ['pe',        'Power Endurance', 'Boulder 4×4s, wall crawls, repeaters'],
      ['climbing',  'Climbing',        'A session on the wall or at the crag — routes or problems']
    ];

    const body = el('div', { class: 'sheet__bd' }, [
      el('div', { class: 'picker', style: 'grid-template-columns:1fr' }, kinds.map(([id, name, desc]) =>
        el('button', { class: 'pick', onclick: () => { CT.sheet.close(true); CT.openLog(id, opts); } }, [
          el('div', { class: 'row', style: 'gap:10px' }, [
            el('span', { class: 'quick__dot quick__dot--' + CT.TYPE[id].dot }),
            el('p', { class: 'pick__n', text: name }),
            id === 'climbing'
              ? el('span', { class: 'chip', style: 'margin-left:auto', text: 'Not a target' })
              : id === 'pe' && !peOpen
              ? el('span', { class: 'chip', style: 'margin-left:auto', text: 'Outside the plan' }) : null
          ]),
          el('p', { class: 'pick__d', style: 'margin-left:17px', text: desc })
        ])
      )),
      peOpen
        ? null
        : el('p', { class: 'tiny', text:
            `The plan holds Power Endurance back until week ${S.peFromWeek(c)}, the four before the rest ` +
            `week. Log one anyway if that is what was climbed — it goes on the record and into the ` +
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
    /* Nothing is planned into the rest week. Said here, at the door,
       rather than behind a tap: a picker that refuses all four choices
       is a worse answer than the sentence explaining why. Logging is
       untouched — whatever actually happens that week still goes on the
       record, and lands on this calendar when it does. */
    if (S.restWeekHolds(c, date)) {
      CT.sheet.open({
        eyebrow: 'Rest week',
        title: dt.short(date) + ' is in the rest week',
        sub: `The last week before ${dt.short(S.peakDate(c))}`,
        body: el('div', { class: 'sheet__bd' }, [
          el('p', { class: 'tiny', text:
            `This week prescribes nothing at all — that is what it is for, and a session planned into it ` +
            `would be working against the block rather than finishing it. Nothing is stopping the day ` +
            `itself: if ${S.forOther(c) ? c.name + ' climbs' : 'you climb'}, log it and it lands here like ` +
            `any other session. Moving the peak on the Clients screen moves which week this is.` })
        ])
      });
      return;
    }

    /* The true week, not the week clamped into the plan: a day past the
       end of the block is outside it, not in its final week. */
    const peOpen = S.weekIndex(c, date) >= S.peFromWeek(c);
    const kinds = [
      ['strength',  'Strength',        'Max hangs or limit bouldering'],
      ['endurance', 'Endurance',       'Routes, traversing, edge pulls, intervals'],
      ['pe',        'Power Endurance', 'Boulder 4×4s, wall crawls, repeaters'],
      ['climbing',  'Climbing',        'A day on the wall or at the crag — routes or problems']
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
            el('span', { class: 'quick__dot quick__dot--' + CT.TYPE[id].dot }),
            el('p', { class: 'pick__n', text: name }),
            id === 'climbing'
              ? el('span', { class: 'chip', style: 'margin-left:auto', text: 'Not a target' })
              : id === 'pe' && !peOpen
              ? el('span', { class: 'chip', style: 'margin-left:auto', text: 'Outside the plan' }) : null
          ]),
          el('p', { class: 'pick__d', style: 'margin-left:17px', text: desc })
        ])
      )),
      el('p', { class: 'tiny', text: peOpen
        ? `It joins ${S.whose(c)} plan as a suggested session — drag it to another day any time.`
        : `It joins ${S.whose(c)} plan as a suggested session. Power Endurance isn’t scheduled until ` +
          `week ${S.peFromWeek(c)}, so one placed here is an addition to the block rather than part of it.` }),
      /* Said once, here, because a planned climbing day looks exactly
         like a planned session and is not one: nothing counts it, and
         nothing goes wrong if it doesn't happen. */
      el('p', { class: 'tiny', text:
        'A planned Climbing day is a note to yourself. It fills no weekly target, and missing one ' +
        'costs nothing — the week is still measured on the sessions the block asks for.' })
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

    /* How thin the week gets if this one goes. Zero for a type the week
       never asks for — Climbing has no target anywhere, Power Endurance
       has none before its phase opens, and the rest week asks for
       nothing at all, so in none of those cases is there anything here
       to warn anybody about. */
    const asks = S.prescribed(c, slot.week, slot.type);
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
      slot.type === 'climbing'
        ? el('p', { class: 'tiny', text: 'Climbing fills no weekly target — this is a note to yourself, and missing it costs nothing.' })
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

  /* ═══════════════ an endurance / PE / climbing session ═══════════════
     One session, however many pieces of work were in it.

     It used to be one modality and one form. An evening that was ten
     rounds of intervals and then twenty minutes of traversing had to be
     logged as two sessions, which then ate two of the week's endurance
     target for one evening's training — the app counting exercises
     where it meant to count trips to the wall. So the sheet holds a
     list of blocks, each with its own picker and its own form, and the
     whole list saves as one session against one slot.

     Edge pulls are the same problem at a smaller scale. Nobody trains
     one grip and stops, so a session is fifteen minutes on the drag and
     fifteen on the half-crimp — two blocks, and the second opens
     already set to the grip the first one didn't use. */
  CT.views.sessionLog = function (c, type, opts) {
    const editing = opts.sessionId ? S.session(c, opts.sessionId) : null;
    if (editing) type = editing.type;
    const mods = CT.MODALITIES[type];
    const T = CT.TYPE[type];

    /* Four is where a sheet stops being one. Nobody does five different
       exercises in an evening and calls it a session, and a form that
       scrolls further than that is a form nobody finishes. */
    const MAX_PARTS = 4;

    let sheet = null;
    const dateBar = CT.dateBar(c, editing ? editing.date : opts.date, () => syncPhase());
    const partsHost = el('div', {});
    const saveBtn = el('button', { class: 'btn btn--primary', disabled: true, onclick: save },
      [ icon('check'), editing ? 'Save changes' : 'Save session' ]);
    const summary = el('p', { class: 'sub', text: 'Pick what you did' });

    const addBtn = el('button', { class: 'btn btn--quiet btn--sm', style: 'margin-top:14px',
      onclick: () => { addPart(null); syncAll(); } }, [ icon('plus'), 'Add another exercise' ]);

    /* Session-level, and deliberately outside the blocks: the notes are
       about the evening, not about the third thing in it. They also
       used to live inside the form, which meant changing your mind
       about the modality threw away whatever had been typed. */
    const notesBox = el('textarea', { class: 'input', id: 'eNotes', text: editing ? editing.notes : '',
      placeholder: type === 'pe' ? 'How the last set felt. Where it fell apart.'
                 : type === 'climbing' ? 'Where you were, who with, what you got on.'
                 : 'Terrain, partners, how it felt.' });

    const parts = [];

    /* ── one block of work ──────────────────────────────────
       Its own picker, its own form, its own values. The picker keeps
       exactly the meaning it always had: tapping a different one
       changes what *this* block was, and never adds a second. */
    function addPart(modality) {
      const part = { modality: null, values: {} };

      const head = el('p', { class: 'eyebrow' });
      const rm = el('button', { class: 'btn btn--quiet btn--sm', style: 'margin-left:auto',
        'aria-label': 'Remove this exercise', onclick: () => removePart(part) }, [ icon('minus') ]);

      const picker = el('div', { class: 'picker' }, mods.map(m =>
        el('button', {
          class: 'pick', 'aria-pressed': 'false',
          onclick: () => choose(part, m.id)
        }, [
          el('p', { class: 'pick__n', text: m.name }),
          el('p', { class: 'pick__d', text: m.desc })
        ])
      ));

      const formHost = el('div', { style: 'display:none' });

      part.head = head;
      part.rm = rm;
      part.picker = picker;
      part.formHost = formHost;
      part.node = el('div', { class: 'logpart' }, [
        el('div', { class: 'logpart__hd' }, [ head, rm ]),
        picker, formHost
      ]);

      parts.push(part);
      partsHost.appendChild(part.node);
      if (modality) choose(part, modality);
      return part;
    }

    function removePart(part) {
      if (parts.length <= 1) return;
      parts.splice(parts.indexOf(part), 1);
      part.node.remove();
      syncAll();
    }

    function choose(part, id) {
      /* Is the form still folded away? Asked of the node, because the
         thing that has to be undone is the node being hidden — and the
         proxy that used to stand in for it ("no modality picked yet")
         is false on the one path that needs it most. A sheet opened to
         edit arrives with the modality already chosen, so that test
         said "not the first time", the reveal was skipped, and the
         whole form stayed at display:none behind a picker with nothing
         under it. */
      const folded = part.formHost.style.display === 'none';
      part.modality = id;
      [...part.picker.children].forEach((b, i) => b.setAttribute('aria-pressed', String(mods[i].id === id)));
      buildForm(part);
      syncAll();
      if (folded) motion.collapse(part.formHost, true);
      else if (motion.on) motion.enter(part.formHost, '.field');
    }

    /* What a block should open with when one above it was the same
       exercise. A second lot of edge pulls is almost always the other
       half of the first: same edge, same clock, other grip. So it opens
       on what that one said and moves the grip along to one this
       session hasn't used — one tap instead of six, with the load still
       the athlete's to correct, because it usually differs by grip. */
    function seedFrom(part) {
      const at = parts.indexOf(part);
      for (let i = at - 1; i >= 0; i--) {
        if (parts[i].modality !== part.modality) continue;
        const seed = Object.assign({}, parts[i].values);
        if (seed.grip) {
          const used = parts.slice(0, at).filter(p => p.modality === part.modality).map(p => p.values.grip);
          const next = (CT.CHOICES.grip || []).map(g => g.id).find(id => used.indexOf(id) < 0);
          if (next) seed.grip = next;
        }
        return seed;
      }
      return null;
    }

    /* Headings, the remove buttons and whether there is anything to
       save all depend on how many blocks there are, so they are settled
       in one place after every add, remove and choice. */
    function syncAll() {
      parts.forEach((p, i) => {
        p.head.textContent = i === 0
          ? (S.forOther(c) ? 'What ' + c.name + ' did' : 'What did you do')
          : 'And then';
        p.rm.style.display = parts.length > 1 ? '' : 'none';
      });
      const named = parts.filter(p => p.modality);
      const ready = named.length === parts.length;
      saveBtn.disabled = !parts.length || !ready;
      summary.textContent = named.length
        ? named.map(p => mods.find(m => m.id === p.modality).name).join(' + ')
        : 'Pick what you did';
      addBtn.style.display = parts.length >= MAX_PARTS ? 'none' : '';
      addBtn.disabled = !ready;
    }

    function buildForm(part) {
      const formHost = part.formHost, values = part.values;
      CT.ui.clear(formHost);
      Object.keys(values).forEach(k => delete values[k]);
      const grid = el('div', { class: 'formgrid' });

      /* What this block opens with: what it already said if the sheet
         is editing one, otherwise whatever a block of the same exercise
         above it left for it, and the schema's defaults if it is the
         first of its kind. */
      const stored = editing ? CT.sessionParts(editing)[parts.indexOf(part)] : null;
      const prior = stored && stored.modality === part.modality ? stored.fields : seedFrom(part);

      /* Only a field the athlete had already answered is carried over —
         an absent one falls back to the schema's default, and for the
         optional grade "absent" is itself an answer. */
      const held = k => prior && Object.prototype.hasOwnProperty.call(prior, k);

      /* The climbs and the metres are two fields in the schema and one
         answer in practice, once the climbs know how long they are.
         They are built in schema order, and climbs comes first, so the
         total arrives before there is anything to hand it to — it
         waits here until the metres box exists. */
      let metresNode = null, pendingMetres = null;
      const toMetres = m => {
        pendingMetres = m;
        if (metresNode) metresNode.auto(m);
      };

      /* What the boxes come to, under the boxes. A form whose work and
         rest are the athlete's own is a form where the round count no
         longer implies a session length, and the athlete setting them
         is the one person who wants that arithmetic done. Forms with
         no clocks to add up never show the line at all. */
      const tally = el('p', { class: 'tiny', style: 'margin-top:10px;display:none' });
      function paintTally() {
        const t = CT.intervalTotal(values);
        tally.textContent = t || '';
        tally.style.display = t ? '' : 'none';
      }

      CT.FORMS[part.modality].forEach(([key, label, kind, def]) => {
        const set = v => { values[key] = v; paintTally(); };
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
          control = metresNode = metresControl(init, set);
          if (pendingMetres !== null) metresNode.auto(pendingMetres);
        } else if (kind === 'climbs') {
          wide = true;
          control = climbsControl(def, init, set, { modality: part.modality, onMetres: toMetres });
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
      paintTally();
      formHost.appendChild(tally);
    }

    function save() {
      const date = dateBar.get();
      const payload = {
        date,
        parts: parts.filter(p => p.modality)
                    .map(p => ({ modality: p.modality, fields: Object.assign({}, p.values) })),
        notes: notesBox.value.trim()
      };
      const name = payload.parts.map(p => mods.find(m => m.id === p.modality).name).join(' + ');
      const who = S.forOther(c) ? c.name + ' · ' : '';

      if (editing) {
        S.updateSession(c, editing.id, payload);
        CT.sheet.close(); CT.render(false);
        toast('Session updated', who + dt.short(date) + ' · ' + name);
        return;
      }

      const before = S.streak(c);
      S.logSession(c, Object.assign({ type }, payload));
      CT.sheet.close();
      toast(date === dt.iso(dt.today()) ? 'Logged' : 'Logged for ' + dt.short(date),
            /* One session, whatever went into it — said out loud, since
               counting it as one is the whole of this change. */
            payload.parts.length > 1
              ? `${name} — one session in ${S.whose(c)} week.`
              : `${name} added to ${S.whose(c)} week.`);
      CT.afterLog(c, before);
    }

    const body = el('div', { class: 'sheet__bd' }, [
      dateBar,
      partsHost,
      addBtn,
      el('div', { class: 'field', style: 'margin-top:18px' }, [
        el('label', { text: 'Notes' }),
        notesBox
      ])
    ]);

    /* Power endurance in a week the plan doesn't schedule it is a
       session that happened, so the sheet says where it stands rather
       than refusing it — and says it about the date on the bar, which
       is still being edited. Read once at open, the line went on
       insisting a session was in phase after it had been backdated out
       of one, and the other way round. */
    function phaseSub() {
      if (type === 'climbing') return 'Climbing you did — on the record, not against a target';
      if (type !== 'pe') return 'Aerobic capacity — the volume that carries the block';
      return S.weekIndex(c, dateBar.get()) < S.peFromWeek(c)
        ? `Anaerobic work — the plan schedules it from week ${S.peFromWeek(c)}, but a session done ` +
          `earlier still counts toward the history`
        : 'Anaerobic work — scheduled in the four weeks before the rest week';
    }
    function syncPhase() {
      const n = sheet && CT.ui.$('.sheet__sub', sheet);
      if (n) n.textContent = phaseSub();
    }

    sheet = CT.sheet.open({
      eyebrow: CT.logEyebrow(c, T.label, editing),
      title: T.label,
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

    /* Editing opens on what was logged, one block per piece of work.
       Anything else opens on a single empty block, waiting on its
       picker exactly as it always did. */
    const opening = editing ? CT.sessionParts(editing) : [];
    if (opening.length) opening.forEach(p => addPart(p.modality));
    else addPart(opts.modality || null);
    syncAll();
  };
})();
