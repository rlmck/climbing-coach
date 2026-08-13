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

  /* ── taxonomy ───────────────────────────────────────────────
     `dot` is the colour every screen marks the type with. It lives here
     rather than in each view because there are five screens that draw
     one, and a type whose colour is decided five times is a type that
     ends up a different colour on one of them. */
  CT.TYPE = {
    strength:  { id:'strength',  label:'Strength',        short:'Strength', detail:'Max hangs or limit boulders', dot:'s' },
    endurance: { id:'endurance', label:'Endurance',       short:'Endurance', detail:'Aerobic capacity', dot:'e' },
    /* The final three weeks are where a block *plans* power endurance.
       They are not a gate on logging it: an athlete who did 4×4s in
       week two did them, and a log that won't take the session is a
       log that disagrees with the training. */
    pe:        { id:'pe',        label:'Power Endurance', short:'Power Endurance', detail:'Anaerobic capacity', dot:'p' },
    /* Climbing, as opposed to training. The block doesn't prescribe it
       and no weekly target counts it — see S.weekProgress, which asks
       about the three types a block is built from and not this one. It
       is here because it happened: a Saturday at the crag is most of
       what the fingers did that week, and a record that only holds the
       prescribed work is a record that can't explain a tired Monday. */
    climbing:  { id:'climbing',  label:'Climbing',        short:'Climbing', detail:'Routes or boulders', dot:'c' }
  };

  CT.GRIPS = [
    { id:'tfd',  name:'Three-Finger Drag', short:'3F drag',    edge:'20 mm' },
    { id:'half', name:'Half-Crimp',        short:'Half-crimp', edge:'20 mm' }
  ];

  CT.PROTOCOL = {
    hangSec:7, repsPerGrip:3, reserveSec:2, restSec:180, increment:2.5, cleanTarget:2,
    /* A max hang is a max hang — you can do one of those, once. Training
       happens underneath it, and 85% of the total load on the fingers is
       where this block puts it. Total, not added: the bodyweight is on
       the edge whether or not anybody wrote it down, so taking 85% of
       the added weight alone would prescribe something far nearer
       maximal than it looks. */
    workingPct: 0.85,
    maxReps: 10
  };

  /* Added load for a working hang, from a max hang and the bodyweight it
     was pulled at. 70 kg bodyweight hanging +30 kg is 100 kg through the
     fingers; 85% of that is 85 kg, which is +15 kg on the harness.

     Negative is a real answer and not an error — it means the working
     load is below bodyweight and wants a pulley taking some off. */
  /* Added load, written the way it is worn. A working load below
     bodyweight is a real prescription — it means take some off with a
     pulley — and "+-4.5 kg" is not how anyone says that. */
  CT.fmtLoad = function (v, decimals) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    const d = decimals == null ? 1 : decimals;
    return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + ' kg';
  };

  CT.workingLoad = function (bodyweight, maxAdded, pct) {
    const bw = +bodyweight, max = +maxAdded;
    if (!isFinite(bw) || !isFinite(max)) return null;
    const p = isFinite(pct) ? pct : CT.PROTOCOL.workingPct;
    return Math.round(((bw + max) * p - bw) * 2) / 2;      // nearest 0.5 kg
  };

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
      { id:'routes',     name:'Routes',       desc:'Laps on route terrain, at whatever grades you climbed' },
      { id:'traverse',   name:'Traversing',   desc:'Low-level, sustained, no rest' },
      { id:'edgepulls',  name:'Hangboard / Edge Pulls', desc:'Sub-maximal loaded pulls — board or single hand' },
      { id:'oneonoff',   name:'1-on-1-off',   desc:'1 minute climbing, 1 minute rest' }
    ],
    pe: [
      { id:'boulder4x4', name:'Boulder 4×4s',  desc:'4 problems × 4 sets, minimal rest' },
      { id:'wallcrawl',  name:'Wall Crawls',   desc:'Long continuous circuits to failure' },
      { id:'longboulder',name:'Long Problems', desc:'15–25 move linked problems' },
      { id:'repeaters',  name:'7:3 Repeaters', desc:'7 s on / 3 s off × 6, sub-max' }
    ],
    /* Which of the two the session was, because the grades are two
       different ladders and a number off the wrong one is worse than no
       number at all. A day that was genuinely both is two logs — which
       is also the truthful answer, since they were two sessions. */
    climbing: [
      { id:'climbRoutes',  name:'Routes',     desc:'Ropes — sport, trad, top rope' },
      { id:'climbBoulder', name:'Bouldering', desc:'Problems, indoors or out' }
    ]
  };

  /* ── grade ladders ────────────────────────────────────────
     Ordered hardest-last, because "hardest thing climbed" is an index
     comparison everywhere it's asked for.

     The route ladder is full French. It used to open '4', '4+', '5a'
     and stop at 8a — a shorthand that was fine while every grade on it
     was typed by hand, and stopped being fine the moment real routes
     arrived: Portland is graded 2a to 8b, and 118 of its routes had
     nowhere to sit. Sessions recorded under the old shorthand are
     translated on the way in rather than rewritten — see LEGACY_GRADE
     below. */
  CT.GRADES = {
    route:   ['3a','3b','3c','4a','4b','4c','5a','5b','5c','6a','6a+','6b','6b+',
              '6c','6c+','7a','7a+','7b','7b+','7c','7c+','8a','8a+','8b'],
    boulder: ['V0','V1','V2','V3','V4','V5','V6','V7','V8','V9','V10','V11','V12']
  };
  CT.GRADE_DEFAULT = { route:'6a', boulder:'V4' };

  /* ── named choice sets ────────────────────────────────────
     First entry is the default. Rendered as a segmented control with
     the description underneath, so the difference between the two is
     on screen rather than in someone's head. */
  CT.CHOICES = {
    /* Same load, same edge, and a completely different exercise: two
       hands on a board splits the load, one hand does not. Logged
       apart because they can't be compared. */
    edgeStyle: [
      { id:'hangboard', name:'Hangboard',  desc:'Both hands on the edge' },
      { id:'onehand',   name:'Edge pulls', desc:'One hand at a time' }
    ],
    /* Mirrors CT.GRIPS, which is the strength protocol's own pair —
       the same two positions, asked about in endurance work too. */
    grip: [
      { id:'half', name:'Half-crimp',         desc:'Thumb off, fingers at 90°' },
      { id:'tfd',  name:'Three-finger drag',  desc:'Open hand, index off' }
    ]
  };
  CT.choiceName = function (set, id) {
    const o = (CT.CHOICES[set] || []).find(x => x.id === id);
    return o ? o.name : null;
  };

  /* ── effort ───────────────────────────────────────────────
     Five points, each with a sentence that says what it feels like.
     A ten-point scale asks people to tell 6 from 7, which nobody can
     do twice the same way; five they can, and the wording is the
     whole reason — so it travels with the value rather than living in
     a help page. */
  CT.RPE = {
    min: 1, max: 5, default: 3,
    scale: [
      { v:1, name:'Easy',        desc:'Can sustain all day.' },
      { v:2, name:'Sustainable', desc:'Light pump but sustainable.' },
      { v:3, name:'Worked',      desc:'Feeling worked.' },
      { v:4, name:'Hard',        desc:'Had to try hard.' },
      { v:5, name:'Maximal',     desc:'Maximal all out effort.' }
    ]
  };
  /* Which scale a stored number is on. A 4 means "hard" on the new
     scale and "easy" on the old one, and nothing about the number
     itself says which — so every session saved from here on says so,
     and a session that doesn't say is one from before the change. */
  CT.RPE.key = 'rpeScale';
  CT.rpeValue = function (v) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.max(CT.RPE.min, Math.min(CT.RPE.max, Math.round(v)));
  };
  CT.rpeLabel = function (v) {
    const n = CT.rpeValue(v);
    const s = CT.RPE.scale.find(x => x.v === n);
    return s ? s.name : '';
  };

  /* ── field schemas ────────────────────────────────────────
     [key, label, kind, default]

     kinds
       select    a fixed list, given as a comma-separated string
       number    a plain count
       kg        a load
       duration  minutes and seconds, stored as whole seconds
       rpe       the five-point effort scale above
       choice    a named set from CT.CHOICES
       grade     one grade off a ladder, optional behind a toggle
       climbs    as many grade/count rows as the session actually had
       metres    a distance, and blank is an answer — see below

     Durations are stored in seconds throughout — a field that means
     minutes in one form and seconds in the next is how a 4-minute
     rest becomes a 4-second one.

     `metres` is the one kind with no default. A route session is
     recorded two ways and people keep one or the other: grades and
     laps, or vertical metres off the board at the desk. Asking for
     both and insisting on either would put a made-up number on every
     session somebody only counted one way, so neither is required and
     an empty box is stored as nothing rather than as zero. */
  CT.FORMS = {
    routes:      [ ['climbs','What you climbed','climbs','route'], ['metres','Distance climbed','metres',null], ['durationSec','Time on the wall','duration',75*60], ['rpe','Effort','rpe',3] ],
    traverse:    [ ['rounds','Rounds','number',6], ['workSec','Work','duration',180], ['restSec','Rest','duration',180], ['grade','Grade','grade','route'], ['rpe','Effort','rpe',3] ],
    edgepulls:   [ ['style','Style','choice','edgeStyle'], ['grip','Grip','choice','grip'], ['edge','Edge','select','25 mm,20 mm,18 mm,15 mm'], ['load','Load','kg',30], ['sets','Sets','number',5], ['workSec','Time per set','duration',180], ['rpe','Effort','rpe',3] ],
    oneonoff:    [ ['rounds','Rounds — 1 min on, 1 min off','number',10], ['grade','Terrain grade','grade','route'], ['rpe','Effort','rpe',3] ],

    boulder4x4:  [ ['climbs','The four problems','climbs','boulder'], ['sets','Sets','number',4], ['restSec','Rest between sets','duration',240], ['rpe','Effort','rpe',4] ],
    wallcrawl:   [ ['rounds','Rounds','number',4], ['workSec','Round length','duration',240], ['restSec','Rest','duration',300], ['rpe','Effort','rpe',4] ],
    longboulder: [ ['climbs','Problems','climbs','boulder'], ['moves','Moves each','number',20], ['rpe','Effort','rpe',4] ],
    repeaters:   [ ['grip','Grip','choice','grip'], ['edge','Edge','select','25 mm,20 mm,18 mm'], ['load','Load','kg',8], ['sets','Sets','number',6], ['rpe','Effort','rpe',4] ],

    /* Going climbing. The same shape as Routes, because it is the same
       question — what did you climb, for how long, how hard did it feel
       — and none of it is prescribed, so there is nothing to compare
       against and nothing to fill in for the sake of it. Metres are
       asked for on a rope and not on a boulder: nobody counts the
       vertical on a problem, and a box nobody fills is a box that
       teaches people to skip past the ones that matter. */
    climbRoutes:  [ ['climbs','What you climbed','climbs','route'], ['metres','Distance climbed','metres',null], ['durationSec','Time on the wall','duration',120*60], ['rpe','Effort','rpe',3] ],
    climbBoulder: [ ['climbs','What you climbed','climbs','boulder'], ['durationSec','Time on the wall','duration',90*60], ['rpe','Effort','rpe',3] ]
  };

  /* ── a list of climbs ─────────────────────────────────────
     [{ grade:'6a', count:2 }, …] — the honest shape of a session,
     rather than the hardest thing in it standing in for the rest.

     A row picked out of the guidebook carries a `route` as well, and
     may carry no `grade` at all: UK trad sits on no ladder the app
     has, so the rung is left null and the route's own grade is the
     only one there is. Everything here has to read the grade through
     `label` for that reason — `hardest` is the exception, and it is
     the exception on purpose, because a row with no rung is precisely
     a row that shouldn't win a comparison. */
  CT.climbs = {
    /* What this row says it was, in the words it was graded in. */
    label(row) {
      if (!row) return null;
      return (row.route && row.route.grade) || row.grade || null;
    },
    /* Metres off the guidebook, for the rows that came from it. A row
       with no route, or a route nobody has measured, adds nothing —
       not zero, nothing, which is the same distinction the metres box
       has always made. */
    metres(list) {
      return (list || []).reduce((a, r) => {
        const len = r.route && typeof r.route.length === 'number' ? r.route.length : 0;
        return a + len * (r.count || 0);
      }, 0);
    },
    /* Where the session was, when the rows know. The first crag named,
       and a count of the others — a day that wandered from Blacknor to
       Battleship is two crags, and naming both in a summary line that
       also has to fit a grade and a distance is how a summary stops
       being one. */
    venues(list) {
      const out = [];
      (list || []).forEach(r => {
        const crag = r.route && r.route.crag;
        if (crag && out.indexOf(crag) < 0) out.push(crag);
      });
      return out;
    },
    total(list) { return (list || []).reduce((a, r) => a + (r.count || 0), 0); },
    hardest(list, set) {
      const ladder = CT.GRADES[set] || CT.GRADES.route;
      let best = -1;
      (list || []).forEach(r => {
        if (!r.count) return;
        const i = ladder.indexOf(r.grade);
        if (i > best) best = i;
      });
      return best < 0 ? null : ladder[best];
    },
    /* "2 × 6a · 3 × 6a+ · 4 × 5c" — in the order they were entered,
       because that is the order they were climbed in. A row with no
       grade of any kind is skipped rather than printed as "1 × null". */
    text(list) {
      return (list || []).filter(r => r.count > 0 && CT.climbs.label(r))
        .map(r => r.count + ' × ' + CT.climbs.label(r)).join(' · ');
    },
    short(list, set) {
      const n = CT.climbs.total(list);
      if (!n) return null;
      const top = CT.climbs.hardest(list, set);
      return n + (n === 1 ? ' climb' : ' climbs') + (top ? ' · to ' + top : '');
    }
  };

  /* seconds → "1h 15m" · "3m 30s" · "45s" */
  CT.fmtDuration = function (sec) {
    if (typeof sec !== 'number' || !isFinite(sec) || sec <= 0) return null;
    const s = Math.round(sec);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    if (h) return h + 'h' + (m ? ' ' + m + 'm' : '');
    if (m) return m + 'm' + (r ? ' ' + r + 's' : '');
    return r + 's';
  };

  /* Vertical metres, when somebody counted them. Nothing is not zero:
     a session with no distance against it wasn't measured, and printing
     "0 m" would say it was and that they climbed nothing.

     One function decides that, and both the box that takes the number
     and the line that prints it back ask it — otherwise the two rules
     drift apart and a distance can be stored that can never be shown.
     Whole metres, because a rounding done at the form and a rounding
     done at the readout are two chances to disagree about 0.4. */
  CT.metres = function (m) {
    if (typeof m !== 'number') return null;
    const n = Math.round(m);
    return isFinite(n) && n > 0 ? n : null;
  };

  CT.fmtMetres = function (m) {
    const n = CT.metres(m);
    return n === null ? null : n + ' m';
  };

  /* ═══════════════════════════════════════════════════════
     Reading what is already on the record.

     The field schemas changed shape: minutes became seconds, a single
     grade became a list of them, effort went from ten points to five,
     and route 4×4s stopped being their own thing. Old sessions are not
     rewritten — a stored document is what someone actually recorded —
     so they are translated on the way in instead, once, where the world
     is assembled. Anything saved after an edit lands in the new shape
     on its own.
     ═══════════════════════════════════════════════════════ */
  const LEGACY = {
    routes:      { minutes:{ duration:'durationSec' }, climbs:{ grade:'grade', count:'laps', set:'route' } },
    edgepulls:   { minutes:{ workMin:'workSec' } },
    route4x4:    { minutes:{ restMin:'restSec' }, climbs:{ grade:'grade', count:null, fallback:4, set:'route' } },
    boulder4x4:  { minutes:{ restMin:'restSec' }, climbs:{ grade:'grade', count:null, fallback:4, set:'boulder' } },
    wallcrawl:   { minutes:{ restMin:'restSec' } },
    longboulder: { climbs:{ grade:'grade', count:'problems', set:'boulder' } }
  };

  /* The route ladder's old shorthand at its easy end, in French. '4'
     covered what French calls 4a and 4b, and '4+' what it calls 4c;
     each maps to the softer of the pair, because a translation that
     rounds up hands an athlete a grade they never claimed. */
  const LEGACY_GRADE = { '4': '4a', '4+': '4c' };

  CT.migrateFields = function (modality, fields) {
    if (!fields) return fields;
    const spec = LEGACY[modality];
    let f = fields, copied = false;
    const own = () => { if (!copied) { f = Object.assign({}, fields); copied = true; } return f; };

    if (spec && spec.minutes) {
      Object.keys(spec.minutes).forEach(from => {
        if (typeof fields[from] !== 'number') return;
        const to = spec.minutes[from];
        const o = own();
        if (typeof o[to] !== 'number') o[to] = Math.round(fields[from] * 60);
        delete o[from];
      });
    }

    if (spec && spec.climbs && !Array.isArray(fields.climbs)) {
      const cs = spec.climbs, grade = fields[cs.grade];
      if (grade) {
        const count = cs.count && typeof fields[cs.count] === 'number' ? fields[cs.count] : (cs.fallback || 1);
        const o = own();
        o.climbs = [{ grade, count }];
        delete o[cs.grade];
        if (cs.count) delete o[cs.count];
      }
    }

    /* The route ladder's two shorthand rungs, translated to the French
       they always meant. Left alone they would be grades off no ladder:
       the picker would fall back to its first option and quietly
       re-record a 4 as a 3a on the next edit, and the hardest-climbed
       line would skip the row entirely. Read-time only — what somebody
       recorded stays recorded. */
    const climbs = f.climbs;
    if (Array.isArray(climbs) && climbs.some(r => r && LEGACY_GRADE[r.grade])) {
      own().climbs = climbs.map(r => r && LEGACY_GRADE[r.grade]
        ? Object.assign({}, r, { grade: LEGACY_GRADE[r.grade] }) : r);
    }
    if (LEGACY_GRADE[fields.grade]) own().grade = LEGACY_GRADE[fields.grade];

    /* Halving is the only mapping off the ten-point scale that keeps
       the ordering intact. Applied here rather than written back —
       the number someone recorded is not ours to overwrite — and only
       to a session that never claimed to be on the five-point one. */
    if (typeof fields.rpe === 'number' && fields[CT.RPE.key] !== CT.RPE.max) {
      const o = own();
      o.rpe = CT.rpeValue(fields.rpe / 2);
      o[CT.RPE.key] = CT.RPE.max;
    }
    return f;
  };

  /* Route 4×4s are gone: laps on route terrain are laps on route
     terrain, and Routes already records them with more of the truth in
     it. The four routes were each climbed once per set, so the sets
     fold into the counts — four routes over four sets is sixteen
     climbs, and reading it as four would understate the session that
     was actually done. The rest between sets has nowhere to go and is
     dropped rather than passed off as time on the wall. */
  function retireRoute4x4(fields) {
    const f = Object.assign({}, fields);
    const sets = typeof f.sets === 'number' && f.sets > 0 ? f.sets : 1;
    if (Array.isArray(f.climbs)) {
      f.climbs = f.climbs.map(r => Object.assign({}, r, { count: (r.count || 0) * sets }));
    }
    delete f.sets;
    delete f.restSec;
    return f;
  }

  CT.migrateSession = function (ses) {
    if (!ses || ses.type === 'strength' || !ses.fields) return ses;
    const fields = CT.migrateFields(ses.modality, ses.fields);
    if (ses.modality === 'route4x4') {
      return Object.assign({}, ses, { modality: 'routes', fields: retireRoute4x4(fields) });
    }
    return fields === ses.fields ? ses : Object.assign({}, ses, { fields });
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

    /* ── endurance / PE / climbing history ── */
    function fieldsFor(modId) {
      const fields = {};
      CT.FORMS[modId].forEach(([key,, kind, def]) => {
        if (kind === 'select') { const o = String(def).split(','); fields[key] = o[Math.floor(rand()*o.length)]; }
        else if (kind === 'choice') fields[key] = CT.CHOICES[def][Math.floor(rand() * CT.CHOICES[def].length)].id;
        else if (kind === 'rpe') {
          fields[key] = CT.rpeValue(def + Math.round(rand()*2 - 1));
          fields[CT.RPE.key] = CT.RPE.max;
        }
        else if (kind === 'grade') {
          /* optional by design — half the time nobody wrote one down */
          const ladder = CT.GRADES[def];
          fields[key] = rand() < 0.5 ? null : ladder[Math.floor(ladder.length * (0.3 + rand()*0.35))];
        }
        else if (kind === 'metres') {
          /* also optional, and generated as such — a world where every
             session has a distance on it would never exercise the
             screens that have to cope with one that doesn't. */
          fields[key] = rand() < 0.45 ? null : Math.round((180 + rand() * 520) / 10) * 10;
        }
        else if (kind === 'climbs') {
          const ladder = CT.GRADES[def];
          const base = Math.floor(ladder.length * (0.3 + rand()*0.3));
          const rows = 2 + Math.floor(rand() * 2);
          fields[key] = [];
          for (let i = 0; i < rows; i++) {
            const g = ladder[Math.max(0, Math.min(ladder.length - 1, base - i))];
            if (fields[key].some(r => r.grade === g)) continue;
            fields[key].push({ grade: g, count: 1 + Math.floor(rand() * 4) });
          }
        }
        else if (kind === 'duration') fields[key] = Math.round(def * (0.85 + rand()*0.3) / 5) * 5;
        else fields[key] = Math.round(def * (0.85 + rand()*0.3));
      });
      return fields;
    }

    /* One session against a slot, in whatever modality the type offers. */
    function fill(slot) {
      const list = CT.MODALITIES[slot.type];
      const mod = list[Math.floor(rand() * list.length)];
      const ses = { id: uid('ses'), date: slot.date, type: slot.type,
                    modality: mod.id, fields: fieldsFor(mod.id), notes:'' };
      sessions.push(ses); slot.sessionId = ses.id;
    }

    slots.filter(s => s.status === 'completed' && s.type !== 'strength').forEach(fill);

    /* ── climbing ──
       Nobody plans these and no target counts them, so they are not in
       the template and they arrive the way a real one does: a day that
       was free, climbed anyway, logged afterwards. A slot is written
       alongside the session because that is what logging one does —
       S.logSession makes one when no open slot matches, so a mock world
       without them would be a world the calendar renders differently
       from the real thing.

       The weekend, and whichever half of it the plan left alone: a
       Saturday at the crag is the shape this takes, and a Saturday the
       block already wants for something is why Sunday is asked next. */
    for (let w = 1; w <= cfg.weeks; w++) {
      if (rand() > 0.55) continue;
      const wkStart = dt.addISO(blockStart, (w - 1) * 7);
      const day = [5, 6].map(o => dt.addISO(wkStart, o))
                        .find(d => d < todayISO && !slots.some(s => s.date === d));
      if (!day) continue;
      const slot = { id: uid('slot'), week: w, type: 'climbing', date: day,
                     status: 'completed', sessionId: null, adhoc: true };
      slots.push(slot);
      fill(slot);
    }

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
      /* The max the opening loads were a share of, run backwards from
         them — so the mock world carries the same basis a real athlete's
         record does and the strength sheet has something true to say. */
      maxLoads: {
        tfd:  +(((cfg.bw + cfg.start.tfd)  / CT.PROTOCOL.workingPct) - cfg.bw).toFixed(1),
        half: +(((cfg.bw + cfg.start.half) / CT.PROTOCOL.workingPct) - cfg.bw).toFixed(1)
      },
      refBodyweight: cfg.bw,
      workingPct: CT.PROTOCOL.workingPct,
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
      /* What the working loads were worked out from, kept so the screens
         can say "85% of a +30 kg max at 71 kg" rather than presenting a
         number with no history. Not derived from again — once the block
         is running, the clean-session rule owns the load. */
      maxLoads: input.maxLoads ? { tfd: input.maxLoads.tfd, half: input.maxLoads.half } : null,
      refBodyweight: input.bodyweight || null,
      workingPct: input.workingPct || CT.PROTOCOL.workingPct,
      cleanStreak: { tfd: 0, half: 0 },
      slots: buildSlots(blockStart, weeks, template, peFromWeek),
      sessions: [],
      bodyweight: input.bodyweight ? [{ date: dt.iso(today), kg: input.bodyweight }] : [],
      /* The max the block was built on is a test result like any other,
         so it goes on the chart where the next one will join it. */
      maxHang: input.maxLoads
        ? [{ date: dt.iso(today), tfd: input.maxLoads.tfd, half: input.maxLoads.half }]
        : [],
      criticalForce: [],
      coachNote: input.note || '',
      isNew: true
    };
  };

  CT.world = {
    coach: { id:'coach', name:'Coach', full:'Coach', initials:'C', role:'coach' },
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
