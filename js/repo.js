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
      /* replayed below — never read from the database, so it can never
         disagree with the sessions it is derived from */
      prescribed: Object.assign({}, d.startLoads),
      cleanStreak: { tfd: 0, half: 0 },
      coachNote: d.coachNote || '',
      coachId: d.coachId,
      clientUid: d.clientUid || null,
      inviteEmail: d.inviteEmail || null,
      slots: c.slots || [],
      sessions: c.sessions || [],
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

  function watchAthlete(athleteId) {
    if (repo._perAthlete.has(athleteId)) return;
    repo._cache.set(athleteId, { doc: null, slots: [], sessions: [], bodyweight: [], maxHang: [], criticalForce: [] });
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
        watchAthlete(d.id);
        repo._cache.get(d.id).doc = d.data();
        rebuild(d.id);
      });
      [...repo._perAthlete.keys()].forEach(id => { if (!seen.has(id)) unwatchAthlete(id); });

      setSyncing(snap.metadata.hasPendingWrites);
      if (!repo._firstDone) { repo._firstDone = true; if (repo._resolveFirst) repo._resolveFirst(); }
      scheduleRender();
    }, err => {
      console.warn('[repo] roster listener:', err.code || err.message);
      if (repo._resolveFirst) repo._resolveFirst();
    }));
  }

  /* ═════════════════ identity ═════════════════ */

  /* A profile is created on first sign-in. Someone whose email was
     already written onto an athlete record by a coach is that athlete;
     anyone else is a coach with an empty roster. */
  async function loadProfile(user) {
    const { doc, getDoc, setDoc, serverTimestamp } = F();
    const ref = doc(fb().db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return Object.assign({ uid: user.uid }, snap.data());

    const claimed = await claimInvite(user);
    const name = user.displayName || (user.email || '').split('@')[0];
    const profile = {
      role: claimed ? 'client' : 'coach',
      name: name.split(/\s+/)[0],
      full: name,
      initials: CT.initialsOf(name),
      email: user.email || null,
      athleteId: claimed || null,
      createdAt: serverTimestamp()
    };
    await setDoc(ref, profile);
    return Object.assign({ uid: user.uid }, profile);
  }

  /* The claim: an athlete record addressed to this email adds this user
     to its members. The rules allow exactly this one change and nothing
     else, so it doesn't matter that the client is the one asking. */
  async function claimInvite(user) {
    if (!user.email) return null;
    const { collection, query, where, getDocs, updateDoc, doc, arrayUnion, serverTimestamp } = F();
    try {
      const q = query(collection(fb().db, 'athletes'), where('inviteEmail', '==', user.email.toLowerCase()));
      const found = await getDocs(q);
      const open = found.docs.find(d => !d.data().clientUid);
      if (!open) return null;
      await updateDoc(doc(fb().db, 'athletes', open.id), {
        clientUid: user.uid,
        members: arrayUnion(user.uid),
        claimedAt: serverTimestamp()
      });
      return open.id;
    } catch (e) {
      console.warn('[repo] invite claim:', e.code || e.message);
      return null;
    }
  }

  /* ═════════════════ lifecycle ═════════════════ */

  repo.start = async function (user) {
    repo.stop();
    repo.enabled = true;
    repo.user = user;
    repo.profile = await loadProfile(user);
    repo._firstDone = false;

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

  /* Only the fields a coach or athlete can actually change. members,
     coachId and clientUid are settled elsewhere and the rules refuse
     them here anyway. */
  repo.saveAthlete = function (c, patch) {
    if (!repo.enabled) return;
    const allowed = ['name', 'full', 'initials', 'block', 'targets', 'template', 'startLoads', 'coachNote', 'inviteEmail'];
    const body = {};
    Object.keys(patch || c).forEach(k => { if (allowed.includes(k)) body[k] = (patch || c)[k]; });
    if (!Object.keys(body).length) return;
    push(F().updateDoc(F().doc(fb().db, 'athletes', c.id), clean(body)), 'that change');
  };

  /* Onboarding. The athlete record and its whole starting plan land in
     one batch, so a half-created athlete is never a state anyone sees. */
  repo.createAthlete = async function (client, inviteEmail) {
    if (!repo.enabled) return client.id;
    const { doc, collection, writeBatch, serverTimestamp } = F();
    const aRef = doc(collection(fb().db, 'athletes'));
    const batch = writeBatch(fb().db);

    batch.set(aRef, clean({
      coachId: repo.user.uid,
      clientUid: null,
      members: [repo.user.uid],
      inviteEmail: inviteEmail ? inviteEmail.trim().toLowerCase() : null,
      name: client.name, full: client.full, initials: client.initials,
      block: client.block, targets: client.targets, template: client.template,
      startLoads: client.startLoads, coachNote: client.coachNote || '',
      createdAt: serverTimestamp()
    }));

    (client.slots || []).forEach(s => {
      const body = clean(Object.assign({}, s));
      delete body.id; delete body.status;
      batch.set(doc(fb().db, 'athletes', aRef.id, 'slots', s.id), body);
    });

    await batch.commit();
    return aRef.id;
  };

  CT.initialsOf = function (name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2)
      .map(w => w[0] ? w[0].toUpperCase() : '').join('') || '?';
  };
})();
