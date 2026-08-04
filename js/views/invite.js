/* ═══════════════════════════════════════════════════════════════
   views/invite.js — the six digits, and what to do about them.

   This is the only place a code is ever visible, and it is only ever
   visible to the coach who minted it and the athlete it already
   belongs to. It handles all three states an athlete's access can be
   in — waiting to be claimed, in use, or lost — and the last one is
   the reason the screen exists at all: when a phone goes in a river
   there is no reset link to send, because there was never an address.
   Issuing another code is the recovery path, and it is the coach's to
   perform, which is the right place for it.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, toast } = CT.ui;

  function daysLeft(when) {
    if (!when) return null;
    return Math.max(0, Math.ceil((when.getTime() - Date.now()) / 86400000));
  }

  /* Digits in three-and-three. Read out loud that's how it lands, and
     read off a screen it's how it stops being a phone number. */
  function digits(pin) {
    return el('div', { class: 'code' }, String(pin).split('').map((d, i) =>
      el('span', { class: 'code__d' + (i === 3 ? ' code__d--gap' : ''), text: d })));
  }

  CT.views.inviteCode = function (client, opts) {
    opts = opts || {};
    /* Local, because the record on screen is rebuilt from a snapshot
       that may not have come back yet when a code is reissued. */
    let pin = client.invitePin;
    let expires = client.inviteExpires;
    let claimed = !!client.clientUid;

    const body = el('div', { class: 'sheet__bd', style: 'gap:20px' });
    const footer = el('div', { class: 'sheet__ft' });
    let busy = false;

    async function issue(reset) {
      if (busy) return;
      busy = true;
      draw('working');
      try {
        const out = reset ? await CT.repo.resetAccess(client.id) : await CT.repo.issueInvite(client.id);
        pin = out.pin;
        expires = out.expiresAt;
        claimed = false;
        /* The optimistic copy, so the roster reads right before the
           snapshot lands rather than a beat after it. */
        client.invitePin = pin;
        client.inviteExpires = expires;
        client.clientUid = null;
        CT.render(false);
      } catch (e) {
        toast('Couldn’t issue a code', CT.fb.message(e));
      } finally {
        busy = false;
        draw();
      }
    }

    function copy() {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(pin)
        .then(() => toast('Code copied', 'Paste it wherever you’re telling ' + client.name + '.'))
        .catch(() => {});
    }

    function draw(state) {
      CT.ui.clear(body);
      CT.ui.clear(footer);

      if (state === 'working') {
        body.appendChild(el('p', { class: 'sub', text: 'Minting a code…' }));
        return;
      }

      /* ── in use ── */
      if (claimed) {
        body.appendChild(el('div', { class: 'codepane' }, [
          el('p', { class: 'eyebrow', text: 'In use' }),
          el('p', { class: 'codepane__t', text: client.name + ' is signed in' }),
          el('p', { class: 'tiny', text:
            'Their code has been spent and can’t be used again. Nothing more is needed unless they lose the device.' })
        ]));
        body.appendChild(el('p', { class: 'tiny', text:
          'A new phone, a cleared browser, a device that was never coming back — any of those and ' + client.name +
          ' can’t reach their training, and there is no address to send a link to. Issuing another code puts this record ' +
          'back to just you and opens it for whoever types the new one. Every session, load and note stays exactly where it is.' }));

        footer.appendChild(el('p', { class: 'sub', text: 'Only do this if they’ve actually lost access.' }));
        footer.appendChild(CT.armButton(() => issue(true), 'Issue a new code',
          'Tap again to replace', 'btn btn--ghost btn--danger', 'spark'));
        return;
      }

      /* ── nothing minted ── */
      if (!pin) {
        body.appendChild(el('div', { class: 'codepane' }, [
          el('p', { class: 'eyebrow', text: 'No code' }),
          el('p', { class: 'codepane__t', text: 'Nobody can reach this record' }),
          el('p', { class: 'tiny', text: 'It’s yours alone until you hand out a code.' })
        ]));
        footer.appendChild(el('button', { class: 'btn btn--primary', onclick: () => issue(false) },
          [ icon('spark'), 'Create a code' ]));
        return;
      }

      /* ── waiting to be claimed ── */
      const left = daysLeft(expires);
      body.appendChild(el('div', { class: 'codepane' }, [
        el('p', { class: 'eyebrow', text: opts.fresh ? 'Read this out' : 'Waiting to be used' }),
        digits(pin),
        el('p', { class: 'tiny', text: left === null ? ''
          : left === 0 ? 'Expires today.'
          : left === 1 ? 'Expires tomorrow.'
          : `Expires in ${left} days.` })
      ]));

      body.appendChild(el('p', { class: 'tiny', text:
        client.name + ' opens the app and types these six digits. That’s the whole of it — no email, no password, ' +
        'and no second screen. Their phone remembers them afterwards, so they never enter it again.' }));
      body.appendChild(el('p', { class: 'tiny', text:
        'The code works once and then stops working, for them and for anybody else who happens to try it.' }));

      if (navigator.clipboard) {
        footer.appendChild(el('button', { class: 'btn btn--ghost', text: 'Copy', onclick: copy }));
      }
      footer.appendChild(el('span', { class: 'topbar__spacer' }));
      footer.appendChild(el('button', { class: 'btn btn--primary', text: 'Done',
        onclick: () => CT.sheet.close() }));
    }

    draw();
    CT.sheet.open({
      eyebrow: 'Access',
      title: client.name + '’s code',
      sub: 'How ' + client.name + ' gets to their training',
      body, footer
    });
  };
})();
