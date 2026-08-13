/* ═══════════════════════════════════════════════════════════════
   crags.js — the guidebook, searchable.

   crags.data.js holds every route at Portland as five columns. This
   turns that into something the log sheet can search, and answers the
   two questions the log actually asks of a route: how long is it, and
   where does its grade sit on a ladder the rest of the app understands.

   The second question is the awkward one. Portland is graded in three
   systems at once — French sport, Font boulder, UK trad — and the app
   has two ladders. What happens at each seam is a decision, not an
   accident, and each one is written down beside the table that makes
   it.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = (window.CT = window.CT || {});

  /* ── which system a grade is written in ───────────────────
     The same three tests the generator makes, because the generator
     refuses to emit a grade that passes none of them — so anything
     reaching here has already been vouched for. */
  function system(g) {
    if (!g) return null;
    if (/^f\d/.test(g))          return 'font';
    if (/^V\d+$/.test(g))        return 'v';
    if (/^\d[abc]?\+?$/.test(g)) return 'french';
    return 'uk';
  }

  /* ── Font → V ─────────────────────────────────────────────
     Boulder problems on the app's ladder are V grades, and Portland's
     are Font, so one of them has to move. The table takes the lower V
     of each band: a conversion that rounds up flatters every session
     it touches, and the number it flatters is the one the progress
     charts read.

     The rung is a sort key, not a claim. Whatever gets stored, the row
     on screen still says f6B+ — see `rowGrade` below. */
  const FONT_V = {
    'f2': 'V0', 'f2+': 'V0', 'f3': 'V0', 'f3+': 'V0', 'f4': 'V0',
    'f4+': 'V1', 'f5': 'V1',
    'f5+': 'V2',
    'f6A': 'V3', 'f6A+': 'V3',
    'f6B': 'V4', 'f6B+': 'V4',
    'f6C': 'V5', 'f6C+': 'V5',
    'f7A': 'V6',
    'f7A+': 'V7',
    'f7B': 'V8', 'f7B+': 'V8',
    'f7C': 'V9',
    'f7C+': 'V10',
    'f8A': 'V11',
    'f8A+': 'V12', 'f8B': 'V12'
  };

  /* ── which ladder, and where on it ────────────────────────
     Three answers, and the third is the interesting one.

     French sport lands on the route ladder as itself — the ladder was
     extended to the full French range for exactly this.

     Font lands on the boulder ladder through the table above.

     UK trad lands nowhere, and that is deliberate. An adjectival grade
     folds difficulty together with how much trouble you are in if you
     fall off, and no single French number carries both. E1 5b is not
     5b, and calling it 5b for the sake of having a number would put a
     figure into "hardest climbed" that nobody could defend. So a trad
     route is counted as a climb, keeps its real grade on screen, and
     sits out of the comparisons. Absent is the honest answer. */
  function rung(grade) {
    const sys = system(grade);
    if (sys === 'french') {
      const ladder = CT.GRADES.route;
      if (ladder.indexOf(grade) >= 0) return grade;
      /* Nine routes are graded below the ladder's floor. They are
         warm-up scrambles and the ladder is better short, so they
         come in at the bottom rung rather than lengthening it. */
      return /^[012]/.test(grade) ? ladder[0] : null;
    }
    if (sys === 'font') return FONT_V[grade] || null;
    if (sys === 'v')    return CT.GRADES.boulder.indexOf(grade) >= 0 ? grade : null;
    return null;                                     // uk trad, by design
  }

  function ladderOf(grade) {
    const sys = system(grade);
    return sys === 'french' ? 'route' : (sys === 'font' || sys === 'v') ? 'boulder' : null;
  }

  /* ── searching ────────────────────────────────────────────
     Folded once at load rather than on every keystroke: lowercase,
     and accents reduced to their letters so that typing "arete" finds
     the eleven Arêtes. Nobody reaches for the circumflex on a phone
     at the top of a cliff. */
  const fold = s => s.toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/['‘’]/g, '');

  const crags = CT.crags = {
    venue: '',
    all: [],
    cragNames: [],

    /* Lengths somebody typed in for a route the guidebook left blank,
       shared through Firestore. Empty until repo.loadRouteLengths has
       been and gone — and permanently empty with no backend, which is
       simply a world where every blank stays blank. */
    overrides: {},

    system, rung, ladderOf,

    /* Which grade systems a modality's search should return. Ropes and
       problems are separate logs on separate ladders, and a route
       search that surfaced 511 boulder problems — or a boulder search
       that surfaced the sport routes above them — would be offering
       the wrong half of the crag every time.

       Endurance laps are here too. "Routes" under Endurance is the
       same act as "Routes" under Climbing — laps on route terrain —
       and the reason to log one rather than the other is what the
       session was for, not where it happened. Plenty of endurance
       volume gets done outdoors, and a search that refused it would
       be drawing a line the training doesn't.

       A modality that isn't listed gets no search, which is what
       keeps it off the traverse and hangboard forms where a named
       route would mean nothing. */
    SEARCHABLE: {
      routes:       ['french', 'uk'],
      climbRoutes:  ['french', 'uk'],
      climbBoulder: ['font', 'v']
    },
    systemsFor(modality) {
      return crags.all.length ? (crags.SEARCHABLE[modality] || null) : null;
    },

    /* The one number the whole feature exists to fetch. Null is a real
       answer and not zero: a route nobody has measured is not a route
       of no length, and every caller has to tell those apart. */
    length(id) {
      const o = crags.overrides[id];
      if (typeof o === 'number' && o > 0) return o;
      const r = crags.byId(id);
      return r && r.length ? r.length : null;
    },

    byId(id) { return crags._index[id] || null; },

    /* Grade as it should appear on screen — the guidebook's own words
       for a route that came from it, the ladder rung for a row somebody
       typed by hand. The two are the same string for sport, and are
       emphatically not for a boulder problem or a trad route. */
    rowGrade(row) {
      if (!row) return null;
      if (row.route && row.route.grade) return row.route.grade;
      return row.grade || null;
    },

    /* Name match, all terms, guidebook order. Prefix matches first —
       typing "sac" should reach Sacred Angel before Ammon's Sacrifice,
       because the route somebody is looking for is nearly always the
       one whose name starts the way they started typing.

       2,138 rows scanned per keystroke sounds careless and isn't: it
       is a couple of hundred microseconds, and an index would be a
       second thing to keep true. */
    search(query, opts) {
      const o = opts || {};
      const terms = fold(query || '').split(/\s+/).filter(Boolean);
      const limit = o.limit || 25;
      const systems = o.systems || null;

      const starts = [], contains = [];
      for (let i = 0; i < crags.all.length; i++) {
        const r = crags.all[i];
        if (systems && systems.indexOf(r.system) < 0) continue;
        if (o.crag && r.crag !== o.crag) continue;
        if (terms.length) {
          let all = true;
          for (let t = 0; t < terms.length; t++) {
            if (r.key.indexOf(terms[t]) < 0) { all = false; break; }
          }
          if (!all) continue;
          (r.key.startsWith(terms[0]) ? starts : contains).push(r);
          /* Enough routes start the way they typed — nothing further
             down the cliff can outrank one of those. */
          if (starts.length >= limit) break;
        } else {
          contains.push(r);
          if (contains.length >= limit) break;   // an empty box just shows the first few
        }
      }
      return starts.concat(contains).slice(0, limit);
    },

    /* Which crags have anything to offer this search, so the filter
       never offers a crag whose every route is the wrong kind. */
    cragsFor(systems) {
      if (!systems) return crags.cragNames.slice();
      const out = [];
      crags.all.forEach(r => {
        if (systems.indexOf(r.system) >= 0 && out.indexOf(r.crag) < 0) out.push(r.crag);
      });
      return out.sort();
    },

    /* What gets stored on a climbs row. Flat, fully populated, and
       free of undefined — repo.js's `clean` does not reach inside
       arrays, so an undefined in here is a Firestore rejection of the
       whole session rather than of one field. */
    stored(route) {
      if (!route) return null;
      return {
        id: route.id,
        name: route.name,
        crag: route.crag,
        area: route.area || '',
        grade: route.grade,
        length: crags.length(route.id)          // number, or null
      };
    },

    _index: {}
  };

  /* ── unpack ───────────────────────────────────────────────
     Index form on disk, objects in memory. Done once at load: the
     whole file is in the shell cache anyway, and a search that had to
     rehydrate as it went would be a search that got slower the more
     of the guidebook it looked at. */
  (function build() {
    const d = CT.CRAGDATA;
    if (!d) return;                       // no dataset shipped: search simply isn't offered
    crags.venue = d.venue;
    crags.cragNames = d.crags.slice().sort();

    d.routes.forEach(r => {
      const crag = d.crags[r[0]], area = d.areas[r[1]], name = r[2], grade = r[3];
      const id = idOf(crag, area, name);
      const route = {
        id, name, crag, area, grade,
        system: system(grade),
        rung: rung(grade),
        ladder: ladderOf(grade),
        length: r[4] || null,
        key: fold(name)
      };
      crags.all.push(route);
      crags._index[id] = route;
    });
  })();

  /* The same slug the generator writes, kept in step by being the
     same three substitutions. It is only recomputed here because the
     id is worth 2,138 repetitions of itself in the data file. */
  function idOf(crag, area, name) {
    return [crag, area, name].map(s => s
      .toLowerCase()
      .replace(/['‘’]/g, '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    ).join('__');
  }
})();
