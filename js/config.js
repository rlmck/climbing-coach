/* ═══════════════════════════════════════════════════════════════
   config.js — which backend to talk to.

   These values are not secret. A Firebase web config identifies the
   project; it doesn't authorise anything. Access control lives entirely
   in firestore.rules, which is why that file is worth reading carefully
   and this one isn't.

   Leave `apiKey` empty and the app runs on the seeded mock world exactly
   as the prototype always has — no network, nothing saved. Fill it in
   and the same UI runs against Firestore.

   To fill it in:
     Firebase console → Project settings → Your apps → Web app → Config
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = (window.CT = window.CT || {});

  CT.CONFIG = {
    firebase: {
      apiKey: '',
      authDomain: 'coach-climbing-app.firebaseapp.com',
      projectId: 'coach-climbing-app',
      storageBucket: 'coach-climbing-app.firebasestorage.app',
      messagingSenderId: '',
      appId: ''
    },

    /* Point the app at a local emulator suite instead of the real
       project. Handy for development; never true on a deploy. */
    useEmulators: /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
                  && new URLSearchParams(location.search).has('emulate'),

    /* Version of the Firebase SDK to pull from the CDN. Pinned: an
       unpinned SDK is a dependency someone else can change under you. */
    sdkVersion: '10.14.1'
  };

  /* The single question the rest of the app asks. */
  CT.CONFIG.live = !!CT.CONFIG.firebase.apiKey || CT.CONFIG.useEmulators;
})();
