/* ═══════════════════════════════════════════════════════════════
   repo.js — Firestore in, CT.world out.

   The prototype's store is synchronous: views call S.something(c) and
   get an answer now. That is worth keeping, so this file does not turn
   the app asynchronous. It keeps CT.world shaped exactly as data.js
   built it, and refills it from snapshot listeners.

   Writes are optimistic twice over. The store mutates CT.world locally
   as it always did, and hands the same change here to persist; the SDK
   then queues it and fires its own snapshot from the local cache, which
   rebuilds CT.world from what is actually stored. Offline, that snapshot
   still arrives — the write is simply waiting. So the UI is instant, and
   the moment anything reaches the server the screen is showing the
   server's version rather than a hopeful copy of it.

   Ids are minted client-side so the optimistic copy and the document
   that lands later are the same record, never two.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, S = CT.store;

  const repo = CT.repo = {
    enabled: false,
    user: null,
    profile: null,
    /* why start() gave up, when it did: 'no-code' */
    blocked: null,
    /* has the roster listener come back at least once — as opposed to
       having come back empty */
    rosterLoaded: false,
    /* true while any local write has not been acknowledged by the server */
    syncing: false,
    onSync: null,
    _unsub: [],
    _perAthlete: new Map(),
    _cache: new Map()
  };

  const fb = () => CT.fb;
  const F = () => CT.fb.fn;

  /* Firestore rejects undefined. Views hand us plain objects that may
     carry a few, so they're dropped rather than turned into nulls —
     a missing field and a null field mean different things here. */
  function clean(obj) {
    const out = {};
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      if (v === undefined) return;
      out[k] = (v && typeof v === 'object' && !Array.isArray(v) && v.constructor === Object)
        ? clean(v) : v;
    });
    return out;
  }

  /* ── ids ──────────────────────────────────────────────────
     A real Firestore id, generated locally. The document doesn't exist
     until it's written, but the id is final from this moment. */
  repo.newId = function (athleteId, coll) {
    if (!repo.enabled) return 'loc_' + Math.random().toString(36).slice(2, 10);
    const { doc, collection } = F();
    return doc(collection(fb().db, 'athletes', athleteId, coll)).id;
  };

  /* ═════════════════ reading ═════════════════ */

  let renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { if (CT.render) CT.render(false); }, 40);
  }

  function setSyncing(v) {
    if (repo.syncing === v) return;
    repo.syncing = v;
    if (repo.onSync) repo.onSync(v);
  }

  /* One athlete document plus its five subcollections, assembled into
     the shape every selector in store.js already expects. */
  function rebuild(athleteId) {
    const c = repo._cache.get(athleteId);
    if (!c || !c.doc) return;
    const d = c.doc;

    const client = {
      id: athleteId,
      name: d.name, full: d.full, initials: d.initials,
      role: 'client',
      block: d.block,
      targets: d.targets,
      template: d.template,
      startLoads: d.startLoads,
      /* What the opening loads were worked out from. Absent on athletes
         onboarded before the working percentage existed — their loads
         were typed in directly, and the screens say so rather than
         inventing a max nobody tested. */
      maxLoads: d.maxLoads || null,
      refBodyweight: d.refBodyweight || null,
      workingPct: d.workingPct || null,
      /* where the load replay starts — moved by a mid-block reset */
      loadsFrom: d.loadsFrom || null,
      /* replayed below — never read from the database, so it can never
         disagree with the sessions it is derived from */
      prescribed: Object.assign({}, d.startLoads),
      cleanStreak: { tfd: 0, half: 0 },
      coachNote: d.coachNote || '',
      coachId: d.coachId,
      clientUid: d.clientUid || null,
      /* The outstanding code and when it lapses, so the coach can read
         it back off the roster instead of having to remember it. Only
         members can see these, and the members are the coach and the
         athlete it already belongs to. */
      invitePin: d.invitePin || null,
      inviteExpires: d.inviteExpires ? d.inviteExpires.toDate() : null,
      /* The coach's own training. Same record as everyone else's — the
         only difference is that they are both ends of it. */
      isSelf: !!(repo.user && d.coachId === repo.user.uid && d.clientUid === repo.user.uid),
      slots: c.slots || [],
      /* Field schemas have moved on — minutes to seconds, one grade to
         a list of them, ten points of effort to five. Old documents are
         translated here rather than rewritten in the database, so what
         someone recorded stays what they recorded and every screen
         downstream only ever sees the current shape. */
      sessions: (c.sessions || []).map(CT.migrateSession),
      bodyweight: (c.bodyweight || []).slice().sort((a, b) => a.date < b.date ? -1 : 1),
      maxHang: (c.maxHang || []).slice().sort((a, b) => a.date < b.date ? -1 : 1),
      criticalForce: (c.criticalForce || []).slice().sort((a, b) => a.date < b.date ? -1 : 1)
    };

    CT.world.clients[athleteId] = client;
    S.recomputeStrength(client);
  }

  function watchSub(athleteId, coll) {
    const { onSnapshot, collection } = F();
    return onSnapshot(collection(fb().db, 'athletes', athleteId, coll), snap => {
      const c = repo._cache.get(athleteId);
      if (!c) return;
      c[coll] = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      if (snap.metadata.hasPendingWrites) setSyncing(true);
      rebuild(athleteId);
      scheduleRender();
    }, err => console.warn('[repo] ' + coll + ' listener:', err.code || err.message));
  }

  function ensureCache(athleteId) {
    if (!repo._cache.has(athleteId)) {
      repo._cache.set(athleteId, { doc: null, slots: [], sessions: [], bodyweight: [], maxHang: [], criticalForce: [] });
    }
    return repo._cache.get(athleteId);
  }

  function watchAthlete(athleteId) {
    if (repo._perAthlete.has(athleteId)) return;
    ensureCache(athleteId);
    const subs = ['slots', 'sessions', 'bodyweight', 'maxHang', 'criticalForce'].map(k => watchSub(athleteId, k));
    repo._perAthlete.set(athleteId, subs);
  }

  function unwatchAthlete(athleteId) {
    (repo._perAthlete.get(athleteId) || []).forEach(u => u());
    repo._perAthlete.delete(athleteId);
    repo._cache.delete(athleteId);
    delete CT.world.clients[athleteId];
  }

  /* Every athlete this person can see: their own record if they're a
     client, their whole roster if they're a coach. One query either way,
     because membership is the only thing that decides it. */
  function watchRoster() {
    const { onSnapshot, collection, query, where } = F();
    const q = query(collection(fb().db, 'athletes'), where('members', 'array-contains', repo.user.uid));

    repo._unsub.push(onSnapshot(q, snap => {
      const seen = new Set();
      snap.docs.forEach(d => {
        seen.add(d.id);
        ensureCache(d.id).doc = d.data();

        /* Not while the record is still only a local write. Every rule
           guarding a subcollection asks the server whether you are a
           member of an athlete document the server hasn't been given
           yet — so it says no, and a listener refused that way is
           refused for good: onSnapshot reports the error and stops,
           it does not retry. A coach who had just onboarded someone
           would sit in front of five dead listeners until they
           reloaded the page.

           This snapshot fires again the moment the write is
           acknowledged, and the listeners start then. */
        if (!d.metadata.hasPendingWrites) watchAthlete(d.id);
        rebuild(d.id);
      });
      /* Over the cache rather than the listeners, so an athlete that
         was only ever a pending write is cleaned up too if it is
         rolled back. */
      [...repo._cache.keys()].forEach(id => { if (!seen.has(id)) unwatchAthlete(id); });

      setSyncing(snap.metadata.hasPendingWrites);
      /* "The roster has answered", as distinct from "the roster is
         empty" — the boot gives up waiting after four seconds, and the
         difference between those two decides whether an athlete with
         nothing to show is asked for a new code or simply told to
         wait. */
      repo.rosterLoaded = true;
      if (!repo._firstDone) { repo._firstDone = true; if (repo._resolveFirst) repo._resolveFirst(); }
      scheduleRender();
    }, err => {
      console.warn('[repo] roster listener:', err.code || err.message);
      if (repo._resolveFirst) repo._resolveFirst();
    }));
  }

  /* ═════════════════ identity ═════════════════ */

  /* A profile exists only for someone who already holds an athlete —
     the rules see to that — so its absence is not an empty state to fill
     in, it is the answer: this account has never spent a code. The
     caller turns that into the code screen.

     Nothing is created here. An athlete's profile is written by
     redeemPin() at the moment it becomes true; a coach's is written in
     the console, deliberately, by a person. */
  async function loadProfile(user) {
    const { doc, getDoc } = F();
    const snap = await getDoc(doc(fb().db, 'users', user.uid));
    if (!snap.exists()) { repo.blocked = 'no-code'; return null; }
    return Object.assign({ uid: user.uid }, snap.data());
  }

  /* ═════════════════ codes ═════════════════
     Six digits, from the platform's cryptographic source rather than
     Math.random — a code that can be predicted from the last one isn't
     a code. Leading zeros are kept: the id is a string and '004821' is
     six digits like any other. */
  const PIN_DAYS = 30;

  function newPin() {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    return String(n[0] % 1000000).padStart(6, '0');
  }

  /* Mint one and point the athlete at it. A code already in use fails
     the create rule — writing over an existing document is an update,
     and the update rule only ever allows someone to spend one — so a
     collision surfaces as a refusal and costs a retry, not a silent
     theft of somebody else's invite. */
  repo.issueInvite = async function (athleteId) {
    const { doc, setDoc, updateDoc, serverTimestamp } = F();
    const expiresAt = new Date(Date.now() + PIN_DAYS * 86400000);
    let last = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      const pin = newPin();
      try {
        await setDoc(doc(fb().db, 'invites', pin), {
          athleteId,
          coachId: repo.user.uid,
          claimedBy: null,
          claimedAt: null,
          expiresAt,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        last = e;
        if ((e.code || '') === 'permission-denied') continue;   // taken; try another
        throw e;
      }
      await updateDoc(doc(fb().db, 'athletes', athleteId), { invitePin: pin, inviteExpires: expiresAt });
      return { pin, expiresAt };
    }
    throw last || { code: 'invite/unknown' };
  };

  /* A record the coach set up for their own training, said out loud.
     Onboarding through the ordinary form leaves an athlete nobody has
     claimed, which the roster then shows as a client waiting for a
     code; this claims it for the coach instead. They were already the
     only member, so nothing about who can reach the training changes —
     only whether the app calls it theirs. The outstanding code goes
     with it, because there is no longer anyone to give it to. */
  repo.claimSelf = async function (athleteId) {
    const { doc, updateDoc, deleteDoc } = F();
    const pin = (CT.world.clients[athleteId] || {}).invitePin;
    await updateDoc(doc(fb().db, 'athletes', athleteId), {
      clientUid: repo.user.uid,
      invitePin: null,
      inviteExpires: null
    });
    /* Withdrawn on a best-effort basis: an unreachable invite document
       is a code that opens a record which is no longer claimable, so a
       failure here costs nothing. */
    if (pin) { try { await deleteDoc(doc(fb().db, 'invites', pin)); } catch (e) { /* already gone */ } }
  };

  /* Handing out a second code. The record goes back to just the coach
     first, because the claim rule only opens for an athlete nobody
     holds. Sessions, slots and loads are untouched — this changes who
     can reach the training, never the training. */
  repo.resetAccess = async function (athleteId) {
    const { doc, updateDoc } = F();
    await updateDoc(doc(fb().db, 'athletes', athleteId), {
      clientUid: null,
      members: [repo.user.uid]
    });
    return repo.issueInvite(athleteId);
  };

  /* Spending one. Three writes, in this order and no other: stamp the
     invite, because that stamp is the only proof the athlete record
     will accept; join the athlete; then write the profile, which is
     what makes the next launch skip all of this.

     Each step checks whether it has already happened, so a code
     interrupted halfway — a tunnel, a dead battery — finishes where it
     stopped when it's entered again. */
  repo.redeemPin = async function (pin) {
    const { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } = F();
    const user = fb().auth.currentUser;
    if (!user) throw { code: 'invite/unknown' };

    const iRef = doc(fb().db, 'invites', pin);
    let invite;
    try {
      const snap = await getDoc(iRef);
      if (!snap.exists()) throw { code: 'invite/unknown' };
      invite = snap.data();
    } catch (e) {
      /* Never issued, already spent by somebody else, or lapsed — the
         rules refuse all three identically, and so does this. */
      if ((e.code || '') === 'permission-denied') throw { code: 'invite/unknown' };
      throw e;
    }

    if (!invite.claimedBy) {
      await updateDoc(iRef, { claimedBy: user.uid, claimedAt: serverTimestamp() });
    } else if (invite.claimedBy !== user.uid) {
      throw { code: 'invite/unknown' };
    }

    const aRef = doc(fb().db, 'athletes', invite.athleteId);
    const aSnap = await getDoc(aRef);
    if (!aSnap.exists()) throw { code: 'invite/unknown' };
    const athlete = aSnap.data();

    if (!athlete.clientUid) {
      await updateDoc(aRef, {
        clientUid: user.uid,
        members: arrayUnion(user.uid),
        claimedAt: serverTimestamp()
      });
    } else if (athlete.clientUid !== user.uid) {
      throw { code: 'invite/taken' };
    }

    /* The name is the one the coach typed at onboarding. Nobody signing
       in this way has ever told the app who they are, and they
       shouldn't have to — their coach already did. */
    await setDoc(doc(fb().db, 'users', user.uid), {
      role: 'client',
      name: athlete.name,
      full: athlete.full,
      initials: athlete.initials,
      athleteId: invite.athleteId,
      createdAt: serverTimestamp()
    });

    return invite.athleteId;
  };

  /* ═════════════════ lifecycle ═════════════════ */

  repo.start = async function (user) {
    repo.stop();
    repo.enabled = true;
    repo.user = user;
    repo.blocked = null;

    const profile = await loadProfile(user);
    if (!profile) { repo.stop(); return null; }     // an account with nowhere to go
    repo.profile = profile;
    repo._firstDone = false;
    repo.rosterLoaded = false;

    CT.world.clients = {};
    CT.world.coach = {
      id: repo.profile.role === 'coach' ? user.uid : (repo.profile.coachId || 'coach'),
      name: repo.profile.name, full: repo.profile.full,
      initials: repo.profile.initials, role: 'coach'
    };

    const first = new Promise(res => { repo._resolveFirst = res; });
    watchRoster();
    /* don't hang the boot on a cold cache and no signal */
    await Promise.race([first, new Promise(res => setTimeout(res, 4000))]);
    return repo.profile;
  };

  repo.stop = function () {
    repo._unsub.forEach(u => u());
    repo._unsub = [];
    [...repo._perAthlete.keys()].forEach(unwatchAthlete);
    repo.enabled = false;
    repo.user = null;
    repo.profile = null;
    repo._firstDone = false;
    repo.rosterLoaded = false;
    /* `blocked` deliberately survives — stop() is what start() calls on
       its way out, and the reason it gave up is the whole message. */
  };

  /* ═════════════════ writing ═════════════════
     Fire and forget by design. Offline these promises stay pending for
     as long as it takes — awaiting one would freeze a save in a
     basement, which is the exact case this app exists for. A rejection
     means the write was refused, not delayed, and that is worth saying
     out loud. */
  function push(promise, what) {
    setSyncing(true);
    promise
      .then(() => setSyncing(false))
      .catch(err => {
        setSyncing(false);
        console.error('[repo] ' + what + ':', err);
        if (CT.ui) CT.ui.toast('Couldn’t save ' + what, fb().message(err));
      });
  }

  const ref = (athleteId, coll, id) => F().doc(fb().db, 'athletes', athleteId, coll, id);

  repo.saveSession = function (c, session) {
    if (!repo.enabled) return;
    const { id } = session, body = clean(Object.assign({}, session));
    delete body.id;
    push(F().setDoc(ref(c.id, 'sessions', id), body), 'that session');
  };

  repo.deleteSession = function (c, id) {
    if (!repo.enabled) return;
    push(F().deleteDoc(ref(c.id, 'sessions', id)), 'that deletion');
  };

  repo.saveSlot = function (c, slot) {
    if (!repo.enabled) return;
    const body = clean(Object.assign({}, slot));
    delete body.id;
    delete body.status;                    // recomputed from the calendar, never stored
    push(F().setDoc(ref(c.id, 'slots', slot.id), body), 'the plan');
  };

  repo.deleteSlot = function (c, id) {
    if (!repo.enabled) return;
    push(F().deleteDoc(ref(c.id, 'slots', id)), 'the plan');
  };

  repo.saveBodyweight = function (c, entry) {
    if (!repo.enabled) return;
    push(F().setDoc(ref(c.id, 'bodyweight', entry.date), clean(entry)), 'that reading');
  };

  repo.deleteBodyweight = function (c, iso) {
    if (!repo.enabled) return;
    push(F().deleteDoc(ref(c.id, 'bodyweight', iso)), 'that deletion');
  };

  /* One max-hang test per day, so the date is the document id — the
     same reasoning as a bodyweight reading. */
  repo.saveMaxHang = function (c, entry) {
    if (!repo.enabled) return;
    push(F().setDoc(ref(c.id, 'maxHang', entry.date), clean(entry)), 'that test');
  };

  repo.deleteMaxHang = function (c, iso) {
    if (!repo.enabled) return;
    push(F().deleteDoc(ref(c.id, 'maxHang', iso)), 'that deletion');
  };

  /* A critical-force test carries its raw per-rep traces, which is
     the bulk of it — around 40 KB for two hands, against a 1 MiB
     document limit. Kept whole rather than split, because the trace
     is the only record of how a rep was actually pulled and a test
     is read as one thing. */
  repo.saveCFTest = function (c, test) {
    if (!repo.enabled) return;
    const body = clean(Object.assign({}, test));
    delete body.id;
    push(F().setDoc(ref(c.id, 'criticalForce', test.id), body), 'that test');
  };

  repo.deleteCFTest = function (c, id) {
    if (!repo.enabled) return;
    push(F().deleteDoc(ref(c.id, 'criticalForce', id)), 'that deletion');
  };

  /* Only the fields a coach or athlete can actually change. members,
     coachId and clientUid are settled elsewhere and the rules refuse
     them here anyway. */
  repo.saveAthlete = function (c, patch) {
    if (!repo.enabled) return;
    const allowed = ['name', 'full', 'initials', 'block', 'targets', 'template', 'startLoads',
                     'maxLoads', 'refBodyweight', 'workingPct', 'loadsFrom', 'coachNote'];
    const body = {};
    Object.keys(patch || c).forEach(k => { if (allowed.includes(k)) body[k] = (patch || c)[k]; });
    if (!Object.keys(body).length) return;
    push(F().updateDoc(F().doc(fb().db, 'athletes', c.id), clean(body)), 'that change');
  };

  /* Onboarding. The athlete record lands first and its opening plan
     follows, and that order is not a preference — it is the only order
     that works. Every rule guarding a slot asks whether you are a member
     of the athlete above it, and a rule's get() reads the database as it
     stood *before* the write it is judging. Put both in one batch and
     the slots are checked against an athlete that does not exist yet:
     members is read off nothing, the expression fails, and the whole
     batch comes back permission-denied. Which is what it did.

     So there is a moment where an athlete exists with no plan under it.
     The coach's own snapshot listener paints it either way and the plan
     arrives a beat later; a torn write here is a record to add slots to,
     not a record nobody can use. */
  repo.createAthlete = async function (client, opts) {
    if (!repo.enabled) return client.id;
    const { doc, collection, setDoc, writeBatch, serverTimestamp } = F();
    const aRef = doc(collection(fb().db, 'athletes'));
    const self = !!(opts && opts.self);

    await setDoc(aRef, clean({
      coachId: repo.user.uid,
      /* Nobody to send a code to when the athlete is the coach. */
      clientUid: self ? repo.user.uid : null,
      members: [repo.user.uid],
      invitePin: null,
      inviteExpires: null,
      name: client.name, full: client.full, initials: client.initials,
      block: client.block, targets: client.targets, template: client.template,
      startLoads: client.startLoads,
      maxLoads: client.maxLoads, refBodyweight: client.refBodyweight, workingPct: client.workingPct,
      loadsFrom: client.loadsFrom || null,
      coachNote: client.coachNote || '',
      createdAt: serverTimestamp()
    }));

    /* A batch caps at 500 writes. A twelve-week block with five sessions
       a week is nowhere near it, but the plan shouldn't depend on that
       staying true. */
    const slots = client.slots || [];
    for (let i = 0; i < slots.length; i += 400) {
      const batch = writeBatch(fb().db);
      slots.slice(i, i + 400).forEach(s => {
        const body = clean(Object.assign({}, s));
        delete body.id; delete body.status;
        batch.set(doc(fb().db, 'athletes', aRef.id, 'slots', s.id), body);
      });
      await batch.commit();
    }

    return aRef.id;
  };

  CT.initialsOf = function (name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2)
      .map(w => w[0] ? w[0].toUpperCase() : '').join('') || '?';
  };
})();
