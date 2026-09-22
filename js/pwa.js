// Registers the service worker (sw.js) so the game can be installed and
// keep working with no network at all - see sw.js for the actual caching
// strategy. The register() call itself is what fails on an insecure origin
// (plain http://, or file://) - browsers only allow service workers on
// https:// or http://localhost - so this is a routine no-op for anyone
// opening index.html directly, not an error. Caught rather than left to
// reject loudly, since neither case is something a player needs to see.
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // In-menu "INSTALL APP" button (index.html's #menu-install-app, hidden
  // by default) - only ever shown once the browser itself confirms the
  // page is actually installable, via beforeinstallprompt. That event
  // firing at all already implies everything installing requires (secure
  // context, valid manifest, an activated service worker, not already
  // installed) - so there's no separate capability check to do here, and
  // no fallback UI for the browsers (Firefox, Safari) that never fire it;
  // PWA_SETUP.md's manual per-platform steps cover those instead.
  // preventDefault() suppresses the browser's own mini-infobar so this
  // button is the only way to trigger it, rather than a player seeing both.
  let deferredInstallPrompt = null;
  const installBtn = document.getElementById('menu-install-app');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installBtn) installBtn.classList.remove('hidden');
  });

  if (installBtn) {
    installBtn.addEventListener('click', () => {
      if (!deferredInstallPrompt) return;
      const promptEvent = deferredInstallPrompt;
      // A captured prompt event is single-use no matter the outcome -
      // cleared immediately (not after userChoice resolves) so a second
      // click while one's already in flight can't try to reuse it.
      deferredInstallPrompt = null;
      installBtn.classList.add('hidden');
      promptEvent.prompt();
    });
  }

  // Covers installing some other way (the browser's own address-bar icon,
  // say) while this button was still showing.
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (installBtn) installBtn.classList.add('hidden');
  });
})();
