/* ═══════════════════════════════════════════════════════════════
   firebase.js — the SDK, and nothing else.

   Loaded as a dynamic import from a classic script so the existing
   load order is untouched: no bundler, no module graph, no build step.
   Everything the rest of the app needs is hung on CT.fb, so no other
   file ever imports from a CDN.

   Firestore is opened with a persistent local cache. That is the whole
   offline story: reads come from disk when there's no signal, writes
   queue locally and fire their snapshot immediately, and the SDK
   replays them when the connection returns. Sessions get logged in
   basements.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT;

  const fb = CT.fb = {
    ready: false,
    app: null, auth: null, db: null,
    /* the SDK functions the repo uses, filled in by init() */
    fn: {}
  };

  fb.init = async function () {
    if (fb.ready) return fb;

    const base = `https://www.gstatic.com/firebasejs/${CT.CONFIG.sdkVersion}`;
    const [A, U, F] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`)
    ]);

    fb.app = A.initializeApp(CT.CONFIG.firebase);

    /* Multi-tab: two open tabs share one cache instead of one of them
       silently losing persistence. */
    fb.db = F.initializeFirestore(fb.app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() })
    });

    fb.auth = U.initializeAuth(fb.app, {
      persistence: [U.indexedDBLocalPersistence, U.browserLocalPersistence]
    });

    if (CT.CONFIG.useEmulators) {
      U.connectAuthEmulator(fb.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      F.connectFirestoreEmulator(fb.db, '127.0.0.1', 8080);
    }

    fb.fn = {
      /* auth */
      onAuthStateChanged: U.onAuthStateChanged,
      /* An athlete never types an address or a password. The anonymous
         account minted here is their identity, and it lives in IndexedDB
         on their phone — which is what makes a code a thing you enter
         once. The coach still signs in properly; theirs is the only
         account with a name on it. */
      signInAnon: U.signInAnonymously,
      signIn: U.signInWithEmailAndPassword,
      signOut: U.signOut,
      resetPassword: U.sendPasswordResetEmail,
      updateProfile: U.updateProfile,
      /* firestore */
      collection: F.collection, doc: F.doc,
      getDoc: F.getDoc, getDocs: F.getDocs,
      setDoc: F.setDoc, updateDoc: F.updateDoc, deleteDoc: F.deleteDoc,
      onSnapshot: F.onSnapshot,
      query: F.query, where: F.where, orderBy: F.orderBy,
      writeBatch: F.writeBatch,
      serverTimestamp: F.serverTimestamp,
      arrayUnion: F.arrayUnion,
      enableNetwork: F.enableNetwork, disableNetwork: F.disableNetwork
    };

    fb.ready = true;
    return fb;
  };

  /* Firebase's error codes are for machines. These are for people
     standing in a gym holding a phone. */
  fb.message = function (err) {
    const code = (err && err.code) || '';
    const map = {
      'auth/invalid-email':          'That doesn’t look like an email address.',
      'auth/invalid-credential':     'Email or password not recognised.',
      'auth/wrong-password':         'Email or password not recognised.',
      'auth/user-not-found':         'Email or password not recognised.',
      'auth/too-many-requests':      'Too many attempts. Wait a minute and try again.',
      'auth/network-request-failed': 'No connection. Entering your code needs one — logging sessions doesn’t.',
      /* Anonymous sign-in is off in the console, so athletes have no
         identity to be given. Nothing the person at the phone can fix. */
      'auth/operation-not-allowed':    'This app isn’t set up to let athletes in yet. Tell your coach.',
      'auth/admin-restricted-operation': 'This app isn’t set up to let athletes in yet. Tell your coach.',
      'invite/unknown':              'That code isn’t recognised. Codes work once, and they run out — ask your coach for a fresh one.',
      'invite/taken':                'That code has already been used on another device. Ask your coach for a fresh one.',
      'permission-denied':           'You don’t have access to that athlete.',
      'unavailable':                 'No connection. Your work is saved here and will sync.'
    };
    return map[code] || (err && err.message) || 'Something went wrong.';
  };
})();
