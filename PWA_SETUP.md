# Installing Hydro Rush as an app (PWA)

This game can be "installed" so it launches from its own icon in its own
window, with no browser address bar or tabs. This doc is the step-by-step
for that — for what a PWA actually is and why it doesn't change anything
about opening `index.html` directly, see the "Installing it as an app"
section in [README.md](README.md).

**The one hard requirement, on every platform:** the game has to be
loaded from `http://localhost` or a real `https://` address. Browsers
flatly refuse to register a service worker anywhere else, `file://`
included — that's not this project's choice, it's enforced by every
browser. So step one is always getting it served, before any install
button will even appear.

## 1. Get it running on a server

### Just for the computer you're on

Any of these work — pick whichever you already have installed. All of
them serve on `http://localhost`, which counts as secure even without
`https://`.

```bash
# Python (already covered in the main README)
python3 -m http.server 8123

# Node, if you have it
npx serve .

# PHP, if you have it
php -S localhost:8123
```

Then open `http://localhost:8123/` in your browser.

### For a phone or another computer on your network

This is the part that trips people up: pointing a phone at your
computer's LAN address (`http://192.168.1.23:8123`, whatever `ipconfig`/
`ifconfig`/`ip addr` reports) **will load the game, but the install
button won't appear and offline play won't work.** A plain LAN IP over
`http://` isn't a secure context — only `localhost` and real `https://`
are — so the service worker silently refuses to register there, same as
`file://`.

To actually install on a phone, you need real HTTPS. Easiest options,
roughly in order of effort:

- **Host it for free** — push this folder to [GitHub Pages](https://pages.github.com/),
  [Netlify](https://www.netlify.com/) (drag-and-drop the folder in),
  [Cloudflare Pages](https://pages.cloudflare.com/), or
  [itch.io](https://itch.io/) (as an HTML5 project). All of these give
  you a working `https://` URL with zero server config.
- **Tunnel your local server** — run the local server as above, then in
  another terminal: `npx localtunnel --port 8123` or (if you have it)
  `cloudflared tunnel --url http://localhost:8123`. Either prints a
  temporary public `https://` URL that forwards to your machine. Good for
  a quick test, not for something you want to keep working long-term.
- **Self-signed local HTTPS** — more setup (a local cert + trusting it on
  the phone), only worth it if you're doing this often. Not covered here.

Once you have an `https://` URL (or you're testing on the same machine
via `localhost`), jump to whichever section below matches your device.

## 2. Installing on a computer

### Windows / Linux / macOS — Chrome or Edge

The easiest path: open the game and look for an **INSTALL APP** button
right on the main menu. It only appears when the browser has actually
confirmed the page is installable, so if you see it, one click is all it
takes.

If it's not there (an older browser, or you dismissed it and it hasn't
reappeared yet), fall back to the browser's own UI:

1. Look at the right side of the address bar for an install icon — a
   small monitor with a `+` or a down-arrow (Edge sometimes labels it
   directly). Click it, then **Install**.
2. If you don't see that icon: open the browser's `⋮` / `...` menu →
   look for **Install Hydro Rush...**, **Apps → Install this site as an
   app**, or **Save and share → Install page as app** (exact wording
   varies by browser version).
3. The game opens in its own window and gets added to your Start Menu
   (Windows), applications list (Linux), or Applications folder (macOS).

### macOS — Safari

Requires macOS Sonoma (14) or newer.

1. Open the game's URL in Safari.
2. **File → Add to Dock...** (or click the Share icon → **Add to Dock**).
3. Confirm the name and click **Add**. It appears in your Dock and opens
   standalone, no Safari toolbar.

### Firefox (desktop)

Firefox removed one-click PWA installs from the desktop browser a while
back. You can still just bookmark the page — you won't get the
standalone-window/offline behavior, but everything about the game itself
is unaffected either way.

## 3. Installing on mobile

Remember: this needs a real `https://` URL (or `localhost` if you're
somehow browsing from the phone itself) — see the tunneling/hosting
options above.

### Android — Chrome

1. Open the game's URL. Look for the **INSTALL APP** button on the main
   menu first — same one-click path as desktop Chrome/Edge above.
2. If it's not showing, Chrome usually offers its own **Install app**
   banner near the bottom — tap it, then **Install**.
3. Still nothing? Tap the `⋮` menu → **Install app** (or **Add to Home
   screen**).
4. The icon lands on your home screen and in the app drawer, and opens
   full-screen with no browser UI.

### Android — Samsung Internet / Firefox

Both support the same idea under a different menu:

- **Samsung Internet**: menu → **Add page to** → **Home screen**.
- **Firefox for Android**: menu → **Install**.

### iPhone / iPad — Safari

iOS doesn't show an automatic install prompt on any browser — it has to
be done manually, and only from Safari itself (Chrome/Firefox on iOS are
Safari under the hood but Apple doesn't expose this feature to them):

1. Open the game's URL in Safari.
2. Tap the **Share** icon (square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. Confirm the name, tap **Add**.
5. The icon appears on your home screen and opens full-screen, no Safari
   chrome.

## 4. Confirming it actually worked

- It opens in its own window/full-screen with no address bar, tabs, or
  browser toolbar.
- It has its own icon (the red boat with a cyan wake) wherever your OS
  keeps installed apps.
- Turn off WiFi/mobile data and open it again — it should still load and
  play normally. If it doesn't, the service worker likely never finished
  its first-time caching; reconnect, open it once more, wait a couple of
  seconds on the main menu, then try offline again.

## 5. Troubleshooting

- **No install button/banner anywhere.** Almost always means you're on
  `file://` or a plain LAN IP instead of `localhost`/`https://` — see
  section 1. Some browsers also just won't offer it again for a while
  after you've dismissed the prompt once; reloading a couple of times or
  clearing the site's data can reset that.
- **I changed the game's code and don't see the update.** `sw.js` always
  fetches the live file first and only falls back to its cache when
  offline (see the main README), so a normal reload while online should
  already show your change. If it somehow doesn't: hard-refresh (Ctrl/
  Cmd+Shift+R), or as a last resort bump the `CACHE_NAME` value at the
  top of `sw.js` — that forces every visitor's old cache to be dropped.
- **Uninstalling.** Same as any other installed app on your OS/phone —
  right-click/long-press its icon and remove it, or use the browser's own
  "Manage installed apps" list (`chrome://apps` / `edge://apps`).
