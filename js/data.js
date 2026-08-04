/* ═══════════════════════════════════════════════════════════════
   data.js — mock world. Everything is generated relative to the
   real "today" so the prototype never goes stale.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = (window.CT = window.CT || {});

  /* ── dates ──────────────────────────────────────────────── */
  const DAY = 86400000;
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const dt = CT.dt = {
    DAY, DOW,
    today() { const d = new Date(); d.setHours(0,0,0,0); return d; },
    parse(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); },
    iso(d) {
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    },
    add(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; },
    addISO(s, n) { return dt.iso(dt.add(dt.parse(s), n)); },
    monday(d) { const x = new Date(d); const g = (x.getDay()+6)%7; x.setDate(x.getDate()-g); x.setHours(0,0,0,0); return x; },
    diff(a, b) { return Math.round((dt.parse(a) - dt.parse(b)) / DAY); },
    dow(s) { return DOW[dt.parse(s).getDay()]; },
    /* "Tue 28 Jul" */
    short(s) { const d = dt.parse(s); return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; },
    /* "28 Jul" */
    mini(s) { const d = dt.parse(s); return d.getDate() + ' ' + MON[d.getMonth()]; },
    /* "Jul" */
    mon(s) { return MON[dt.parse(s).getMonth()]; },
    /* relative wording used all over the retro-logging UI */
    relative(s) {
      const n = dt.diff(dt.iso(dt.today()), s);
      if (n === 0) return 'today';
      if (n === 1) return 'yesterday';
      if (n < 0)   return 'in ' + (-n) + ' days';
      if (n < 7)   return n + ' days ago';
      const w = Math.round(n/7);
      return w === 1 ? 'last week' : w + ' weeks ago';
    }
  };

  /* seeded RNG so the mock world is identical on every reload */
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ── taxonomy ───────────────────────────────────────────── */
  CT.TYPE = {
    strength:  { id:'strength',  label:'Strength',        short:'Strength', detail:'Max hangs or limit boulders' },
    endurance: { id:'endurance', label:'Endurance',       short:'Endurance', detail:'Aerobic capacity' },
    pe:        { id:'pe',        label:'Power Endurance', short:'Power Endurance', detail:'Anaerobic · final 3 weeks' }
  };

  CT.GRIPS = [
    { id:'tfd',  name:'Three-Finger Drag', short:'3F drag',    edge:'20 mm' },
    { id:'half', name:'Half-Crimp',        short:'Half-crimp', edge:'20 mm' }
  ];

  CT.PROTOCOL = { hangSec:7, repsPerGrip:3, reserveSec:2, restSec:180, increment:2.5, cleanTarget:2 };

  /* Two ways to spend a strength session. Only the hangboard carries a
     prescribed load, so only it feeds the progression rule — limit
     bouldering is maximal recruitment work with nothing to advance. */
  CT.STRENGTH_MODES = [
    { id:'hangs', name:'Hangboard',        desc:'Six max hangs · 7 s · pass or fail' },
    { id:'limit', name:'Limit Bouldering', desc:'A few maximal problems, attempts logged per grade' }
  ];
  CT.LIMIT = {
    grades: ['V2','V3','V4','V5','V6','V7','V8','V9','V10','V11','V12'],
    defaultGrade: 'V5',
    defaultAttempts: 5,
    maxAttempts: 40,
    restMin: '3–5',
    problemsHint: '3–5'
  };
  /* hardest grade touched in a limit session — grades are ordered, so the
     highest index wins */
  CT.topGrade = function (problems) {
    let best = -1;
    (problems || []).forEach(p => {
      const i = CT.LIMIT.grades.indexOf(p.grade);
      if (i > best) best = i;
    });
    return best < 0 ? null : CT.LIMIT.grades[best];
  };

  CT.MODALITIES = {
    endurance: [
      { id:'routes',     name:'Routes',       desc:'Continuous laps on route terrain' },
      { id:'traverse',   name:'Traversing',   desc:'Low-level, sustained, no rest' },
      { id:'edgepulls',  name:'Edge Pulls',   desc:'Sub-maximal loaded pulls' },
      { id:'oneonoff',   name:'1-on-1-off',   desc:'1 minute climbing, 1 minute rest' },
      { id:'route4x4',   name:'Route 4×4s',   desc:'4 routes × 4 sets' }
    ],
    pe: [
      { id:'boulder4x4', name:'Boulder 4×4s',  desc:'4 problems × 4 sets, minimal rest' },
      { id:'wallcrawl',  name:'Wall Crawls',   desc:'Long continuous circuits to failure' },
      { id:'longboulder',name:'Long Problems', desc:'15–25 move linked problems' },
      { id:'repeaters',  name:'7:3 Repeaters', desc:'7 s on / 3 s off × 6, sub-max' }
    ]
  };

  /* field schemas — deliberately first-pass, easy to swap out later */
  CT.FORMS = {
    routes:      [ ['grade','Top grade','select','6a,6a+,6b,6b+,6c,6c+,7a,7a+,7b'], ['laps','Laps','number',12], ['duration','Duration','minutes',75], ['rpe','Effort','rpe',6] ],
    traverse:    [ ['rounds','Rounds','number',6], ['workSec','Work','seconds',180], ['restSec','Rest','seconds',180], ['rpe','Effort','rpe',6] ],
    edgepulls:   [ ['edge','Edge','select','25 mm,20 mm,18 mm,15 mm'], ['load','Load','kg',30], ['sets','Sets','number',5], ['workMin','Time per set','minutes',3], ['rpe','Effort','rpe',5] ],
    oneonoff:    [ ['rounds','Rounds — 1 min on, 1 min off','number',10], ['grade','Terrain grade','select','5+,6a,6a+,6b,6b+,6c,6c+,7a'], ['rpe','Effort','rpe',6] ],
    route4x4:    [ ['grade','Route grade','select','6a,6a+,6b,6b+,6c,6c+,7a'], ['sets','Sets','number',4], ['restMin','Rest between sets','minutes',4], ['rpe','Effort','rpe',7] ],

    boulder4x4:  [ ['grade','Problem grade','select','V2,V3,V4,V5,V6,V7'], ['sets','Sets','number',4], ['restMin','Rest between sets','minutes',4], ['rpe','Effort','rpe',8] ],
    wallcrawl:   [ ['rounds','Rounds','number',4], ['workSec','Round length','seconds',240], ['restMin','Rest','minutes',5], ['rpe','Effort','rpe',8] ],
    longboulder: [ ['problems','Problems','number',5], ['moves','Moves each','number',20], ['grade','Grade','select','V2,V3,V4,V5,V6'], ['rpe','Effort','rpe',8] ],
    repeaters:   [ ['edge','Edge','select','25 mm,20 mm,18 mm'], ['load','Load','kg',8], ['sets','Sets','number',6], ['rpe','Effort','rpe',7] ]
  };

  /* ═══════════════════════════════════════════════════════
     World generation
     ═══════════════════════════════════════════════════════ */
  const today = dt.today();
  const todayISO = dt.iso(today);
  const thisMonday = dt.monday(today);

  let seq = 0;
  const uid = p => p + '_' + (++seq);

  /* one suggested slot per prescribed session, for every week of the block */
  function buildSlots(blockStart, weeks, template, peFromWeek) {
    const slots = [];
    for (let w = 1; w <= weeks; w++) {
      const wkStart = dt.addISO(blockStart, (w - 1) * 7);
      const add = (type, offsets) => (offsets || []).forEach(o =>
        slots.push({ id: uid('slot'), week: w, type, date: dt.addISO(wkStart, o), status: 'suggested', sessionId: null })
      );
      add('strength',  template.strength);
      add('endurance', template.endurance);
      if (w >= peFromWeek) add('pe', template.pe);
    }
    return slots;
  }

  const initialsOf = name => name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

  /* ── a critical-force export, as the device would write one ──
     Force decays from an opening pull toward an asymptote across
     24 repeaters, and the device averages the closing three into a
     critical force. Sampling is the honest part: a hand that slips
     early gives the device two readings to average instead of
     twelve, and it says so — which the charts have to survive. */
  function deviceFile(rand, o) {
    const HANG_MS = 7000, REPS = 24;
    const opening = o.asymptote * 2.2;

    const allReps = [], unreliableReps = [];
    for (let r = 1; r <= REPS; r++) {
      const target = o.asymptote + (opening - o.asymptote) * Math.exp(-(r - 1) / 5.2)
                   + (rand() - 0.5) * o.noise;

      /* nothing usable came off the cell for this rep */
      if (r === o.dropRep) {
        allReps.push({ rep: r, average: 0, minimum: 0, peak: +(target * 1.1).toFixed(2),
          unreliable: true, rawReadings: [{ t: 2400, force: +(target * 1.1).toFixed(2) }],
          rawCount: 3, windowedReadings: 0, filteredReadings: 0 });
        unreliableReps.push(r);
        continue;
      }

      /* A flagged rep inside the closing three is the caveat the card
         exists to raise, so it is authored rather than left to the
         dice — otherwise every test trips it and the warning stops
         meaning anything. */
      const inWindow = r > REPS - 3;
      const shaky = (o.forceFlag || []).includes(r) ? true
                  : (o.cleanWindow && inWindow) ? false
                  : rand() < o.flaky;
      const kept = shaky ? 1 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 12);
      const readings = [];
      /* the rise onto the hold, then the hold itself */
      for (let i = 0; i < kept + 2; i++) {
        const t = Math.round(1000 + (i / (kept + 1)) * (HANG_MS - 1200));
        const ramp = i === 0 ? 0.42 : i === 1 ? 0.88 : 1;
        readings.push({ t, force: +(target * ramp + (rand() - 0.5) * o.noise * 1.6).toFixed(2) });
      }
      const held = readings.slice(2).map(p => p.force);
      const average = +(held.reduce((a, v) => a + v, 0) / held.length).toFixed(2);

      allReps.push({
        rep: r, average,
        minimum: +Math.min(...held).toFixed(2),
        peak: +Math.max(...readings.map(p => p.force)).toFixed(2),
        unreliable: shaky,
        rawReadings: readings,
        rawCount: readings.length + (shaky ? 4 : 1),
        windowedReadings: kept, filteredReadings: kept
      });
      if (shaky) unreliableReps.push(r);
    }

    const cfRepValues = allReps.slice(-3).map(r => r.average);
    const criticalForce = cfRepValues.reduce((a, v) => a + v, 0) / cfRepValues.length;

    return {
      timestamp: new Date(o.date + 'T18:03:26.035Z').toISOString(),
      bodyweight: o.bw,
      hand: o.hand,
      criticalForce,
      cfMin: allReps[REPS - 1].minimum,
      cfRatio: criticalForce / o.bw,
      arcZone: criticalForce * 0.8,
      thresholdZone: (criticalForce * 0.8).toFixed(1) + ' - ' + criticalForce.toFixed(1) + ' kg',
      cfRepValues, unreliableReps, allReps
    };
  }

  /* What actually goes on the record. The athlete name and the grip
     guess are upload-time scaffolding — they exist to be confirmed,
     not to be kept. */
  function storedTests(tests) {
    return tests.map(t => ({
      id: uid('cf'), date: t.date, grip: t.grip,
      bodyweight: t.bodyweight, hands: t.hands, source: t.source
    }));
  }

  function makeClient(cfg) {
    const rand = rng(cfg.seed);
    const blockStart = dt.iso(dt.add(thisMonday, -7 * (cfg.currentWeek - 1)));
    const blockEnd   = dt.addISO(blockStart, cfg.weeks * 7 - 1);
    const peFromWeek = cfg.weeks - 2;               // final 3 weeks

    const slots = buildSlots(blockStart, cfg.weeks, cfg.template, peFromWeek);

    /* ── adherence is authored, not rolled: each week is 'full',
         'partial' (one endurance dropped) or 'poor' (strength plus
         one endurance dropped). The current week simply completes
         whatever is already behind today. ── */
    const sessions = [];
    for (let w = 1; w <= cfg.weeks; w++) {
      const mode = cfg.adherence[w - 1] || 'full';
      const wk = slots.filter(s => s.week === w && s.date < todayISO);
      const drop = new Set();
      if (mode === 'partial' || mode === 'poor') {
        const end = wk.filter(s => s.type === 'endurance');
        if (end.length) drop.add(end[end.length - 1].id);
      }
      if (mode === 'poor') wk.filter(s => s.type === 'strength').forEach(s => drop.add(s.id));
      wk.forEach(s => s.status = drop.has(s.id) ? 'missed' : 'completed');
    }

    /* leave one session of the current week open, so there is always
       something real to log late */
    if (cfg.currentOpen) {
      const open = slots.find(s => s.week === cfg.currentWeek && s.type === cfg.currentOpen && s.date < todayISO);
      if (open) open.status = 'missed';
    }

    /* ── strength history: authored rep patterns, then the real
         progression rule run over them so the numbers agree ── */
    const grip = {
      tfd:  { weight: cfg.start.tfd,  streak: 0 },
      half: { weight: cfg.start.half, streak: 0 }
    };
    const strengthSlots = slots.filter(s => s.type === 'strength' && s.status === 'completed')
                               .sort((a,b) => a.date < b.date ? -1 : 1);

    strengthSlots.forEach((slot, i) => {
      /* patterns are written newest-last, so line them up from the end */
      const pat = cfg.patterns[i - (strengthSlots.length - cfg.patterns.length)] || cfg.patterns[0];
      const reps = {}, weights = {};
      CT.GRIPS.forEach(g => {
        const k = g.id;
        weights[k] = grip[k].weight;
        const r = pat[k].split('').map(ch => ch === '1');
        reps[k] = r;
        grip[k].streak = r.every(Boolean) ? grip[k].streak + 1 : 0;
        if (grip[k].streak >= CT.PROTOCOL.cleanTarget) {
          grip[k].streak = 0;
          grip[k].weight += CT.PROTOCOL.increment;
        }
      });
      const ses = { id: uid('ses'), date: slot.date, type: 'strength', mode: 'hangs', weights, reps, notes:'' };
      sessions.push(ses); slot.sessionId = ses.id;
    });

    /* ── endurance / PE history ── */
    slots.filter(s => s.status === 'completed' && s.type !== 'strength').forEach(slot => {
      const list = CT.MODALITIES[slot.type];
      const mod = list[Math.floor(rand() * list.length)];
      const fields = {};
      CT.FORMS[mod.id].forEach(([key,, kind, def]) => {
        if (kind === 'select') { const o = String(def).split(','); fields[key] = o[Math.floor(rand()*o.length)]; }
        else if (kind === 'rpe') fields[key] = Math.max(4, Math.min(10, Math.round(def + (rand()*2-1))));
        else fields[key] = Math.round(def * (0.85 + rand()*0.3));
      });
      const ses = { id: uid('ses'), date: slot.date, type: slot.type, modality: mod.id, fields, notes:'' };
      sessions.push(ses); slot.sessionId = ses.id;
    });

    /* ── bodyweight: weekly, mild trend + noise ── */
    const bodyweight = [];
    for (let i = cfg.weeks + 4; i >= 0; i--) {
      const d = dt.iso(dt.add(thisMonday, -7 * i + 1));
      if (d > todayISO) continue;
      bodyweight.push({ date: d, kg: +(cfg.bw + cfg.bwTrend * (cfg.weeks + 4 - i) + (rand()-0.5) * 0.55).toFixed(1) });
    }

    /* ── max hang tests: 5 points, ending near current prescribed load ── */
    const maxHang = [];
    for (let i = 4; i >= 0; i--) {
      const d = dt.iso(dt.add(thisMonday, -21 * i));
      if (d > todayISO) continue;
      maxHang.push({
        date: d,
        tfd:  +(grip.tfd.weight  - i * 2.2 + (rand()-0.5)).toFixed(1),
        half: +(grip.half.weight - i * 2.6 + (rand()-0.5)).toFixed(1)
      });
    }

    /* ── critical force tests (7:3 repeaters to failure) ──
       Built as the device's own export and then read back through
       CT.cf.parse, so the mock world exercises exactly the code an
       uploaded file does — including the two things the real files
       turned out to be full of: reps with too few samples to trust,
       and the occasional rep that recorded nothing at all. */
    const criticalForce = storedTests(CT.cf.group([-1, 0].flatMap((k, idx) => {
      const d = dt.iso(dt.add(thisMonday, -7 * (idx === 0 ? cfg.currentWeek + 7 : cfg.currentWeek - 1)));
      const date = d > todayISO ? todayISO : d;
      const bw = +(cfg.bw + cfg.bwTrend * (idx === 0 ? 8 : 1)).toFixed(1);
      return ['right', 'left'].map((hand, hi) => CT.cf.parse(
        `${cfg.name}_half_crimp_${hand}_cf-test-${date}T18-0${hi * 3}-00.json`,
        deviceFile(rand, {
          date, hand, bw,
          asymptote: cfg.cf[hand] + idx * cfg.cf.gain,
          /* the first test was scrappier — a coach learning the kit */
          noise: idx === 0 ? 1.0 : 0.7,
          flaky: idx === 0 ? 0.28 : 0.1,
          dropRep: idx === 0 && hand === 'right' ? 16 : 0,
          cleanWindow: idx === 1,
          forceFlag: idx === 1 ? (cfg.cf.latestFlag || {})[hand] : null
        })
      ));
    })));

    return {
      id: cfg.id, name: cfg.name, full: cfg.full, initials: cfg.initials, role: 'client',
      block: { start: blockStart, end: blockEnd, weeks: cfg.weeks, peFromWeek },
      targets: Object.assign({ strength:1, endurance:3, pe:1 }, cfg.targets),
      template: cfg.template,
      startLoads: { tfd: cfg.start.tfd, half: cfg.start.half },
      prescribed: { tfd: grip.tfd.weight, half: grip.half.weight },
      cleanStreak: { tfd: grip.tfd.streak, half: grip.half.streak },
      slots, sessions, bodyweight, maxHang, criticalForce,
      coachNote: cfg.coachNote
    };
  }

  /* ═══════════════════════════════════════════════════════
     Onboarding — a real client, with no history behind them.
     The days the coach picks are the weekly targets: one slot
     per prescribed session, so the plan and the target can
     never disagree.
     ═══════════════════════════════════════════════════════ */
  CT.nextMonday = function () {
    const d = dt.add(thisMonday, 7);
    return dt.iso(d);
  };

  CT.createClient = function (input) {
    const weeks = input.weeks;
    const peFromWeek = weeks - 2;
    const blockStart = input.start;
    const template = input.template;

    let id = input.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'client';
    while (CT.world.clients[id]) id += 'x';

    return {
      id,
      name: input.name.trim().split(/\s+/)[0],
      full: input.name.trim(),
      initials: initialsOf(input.name),
      role: 'client',
      block: { start: blockStart, end: dt.addISO(blockStart, weeks * 7 - 1), weeks, peFromWeek },
      targets: {
        strength:  template.strength.length,
        endurance: template.endurance.length,
        pe:        template.pe.length
      },
      template,
      startLoads:  { tfd: input.loads.tfd,  half: input.loads.half },
      prescribed:  { tfd: input.loads.tfd,  half: input.loads.half },
      cleanStreak: { tfd: 0, half: 0 },
      slots: buildSlots(blockStart, weeks, template, peFromWeek),
      sessions: [],
      bodyweight: input.bodyweight ? [{ date: dt.iso(today), kg: input.bodyweight }] : [],
      maxHang: [],
      criticalForce: [],
      coachNote: input.note || '',
      isNew: true
    };
  };

  CT.world = {
    coach: { id:'coach', name:'Ross', full:'Ross Lewis', initials:'RL', role:'coach' },
    clients: {}
  };

  /* Everything below this line is the prototype's world and only the
     prototype's. Against a real backend these two would be athletes who
     don't exist, sitting in memory waiting for a screen to leak them
     onto — so they are never built at all. */
  if (CT.CONFIG && CT.CONFIG.live) return;

  Object.assign(CT.world.clients, {
      /* Maks — final week of an 8-week block, deep in power endurance.
         Authored so the strength log opens one clean session away from
         +2.5 kg on the drag and freshly reset on the half-crimp, and so
         finishing this week lands a 4-week streak. */
      maks: makeClient({
        id:'maks', name:'Maks', full:'Maks Nowicki', initials:'MN', seed: 20260401,
        weeks: 8, currentWeek: 8,
        template: { strength:[0], endurance:[1,3,5], pe:[4] },
        adherence: ['full','full','partial','poor','full','full','full','current'],
        currentOpen: 'endurance',
        start: { tfd: 15, half: 20 },
        patterns: [
          { tfd:'111', half:'111' },   // wk1  drag 1/2 · crimp 1/2
          { tfd:'111', half:'111' },   // wk2  both earn +2.5
          { tfd:'110', half:'111' },   // wk3  drag resets
          { tfd:'111', half:'101' },   // wk5  crimp resets
          { tfd:'111', half:'111' },   // wk6  drag earns +2.5
          { tfd:'111', half:'110' }    // wk7  drag at 1/2, crimp reset  ← today's state
        ],
        bw: 71.8, bwTrend: -0.11,
        /* Sat where his real July test sits — right hand well ahead of
           left, and the left's critical force read partly off a rep the
           device flagged, which is what that test actually looked like. */
        cf: { right: 23.3, left: 17.0, gain: 1.6, latestFlag: { left: [23] } },
        coachNote: 'Last week of the block. Hold the load — no chasing numbers now.'
      }),
      /* Jade — week 2 of 8, base phase, no PE sessions scheduled yet.
         Both grips sit at 1 of 2 clean sessions. Her week runs four
         training days back to back, which the schedule quietly flags. */
      jade: makeClient({
        id:'jade', name:'Jade', full:'Jade Ferreira', initials:'JF', seed: 815551,
        weeks: 8, currentWeek: 2,
        template: { strength:[1], endurance:[0,2,3], pe:[5] },
        adherence: ['full','current'],
        start: { tfd: 7.5, half: 10 },
        patterns: [
          { tfd:'101', half:'110' },   // wk1  both reset
          { tfd:'111', half:'111' }    // wk2  both at 1/2  ← today's state
        ],
        bw: 57.4, bwTrend: 0.04,
        cf: { right: 14.1, left: 13.4, gain: 1.1 },
        coachNote: 'Base phase — keep the endurance conversational. Volume over intensity.'
      })
  });
})();
