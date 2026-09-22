# Hydro Rush — Player Guide

An offline arcade boat racer for the browser, in the spirit of Midway's
*Hydro Thunder* — big air, tight rivers, and twelve boats with their own
tricks. No install required, no account, no internet connection needed
once it's loaded.

*Not affiliated with or endorsed by Midway Games / Hydro Thunder — just
inspired by it.*

Completely coded by Claude Sonnet.

## Getting started

Open `index.html` in a web browser (Chrome, Firefox, Edge, or Safari all
work) and you're straight into the main menu. That's it — no setup, no
sign-up, no download beyond the game files themselves.

Want it to feel more like a real app, with its own icon and window? See
**[Installing it as an app](#installing-it-as-an-app)** below.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Steer | Arrow Left/Right, A/D | Left stick / D-pad |
| Throttle | Arrow Up, W | Right trigger |
| Brake | Arrow Down, S | Left trigger |
| Boost | Space, Left Shift | A button |
| Camera cycle | C | Y button |
| Pause | Escape, P | Start |
| Restart course | R | — |

You can change any of these from the **Controls** screen if the defaults
don't feel right. If you're on a phone or tablet, touch buttons for
steer/throttle/brake/boost show up automatically — no setup needed.

There are four camera views per player: **Chase**, **Close**, **Far**, and
a first-person **Cockpit** view with its own speed and boost gauges built
into the dashboard.

### Playing with others

From the main menu:

- **Single Player** — jump straight into any mode (Race, Time Attack,
  Ring Race, or Cup).
- **Split Screen** — race Cup or Race mode with 1–4 players on one screen
  (the screen splits automatically for 2 or more). Each player needs
  their own keyboard or controller. On the join screen, press A/Start on
  a controller, or Enter/Space on a keyboard, to join in — then press
  Enter/Space or Start again to kick things off once everyone's ready.

## Game modes

| Mode | What it is |
|---|---|
| **Race** | A full grid of AI opponents (choose 4, 8, 12, 16, or 20 racers, and Easy/Medium/Hard difficulty). First across the line after 3 laps wins. |
| **Time Attack** | Just you and the clock — no opponents, pure lap-chasing. |
| **Ring Race** | Fly through a chain of checkpoint rings that shrink as you go — a test of precision, not just speed. |
| **Cup** | A themed set of courses raced back to back against a full AI field. Points are awarded by finishing position across every race, and the highest total wins the cup. |

### Cups

- **Rookie Cup** — Thunder Cove, Volcanic Rapids, Arctic Straits, Voxel
  Valley. Four friendly courses to learn on.
- **Gauntlet Cup** — Thunder Falls, Canyon Run, Serpent Falls, Torrent
  Gauntlet. Four of the toughest, most technical courses around.
- **Epic Cup** — Storm Coast, Bioluminescent Cave, Ancient Ruins, Desert
  Oasis. A grand tour of the newest and most ambitious courses.

## Courses

14 courses in all, ranging from loops to one-way plunges to a
four-region grand tour:

Thunder Cove · Volcanic Rapids · Arctic Straits · Voxel Valley ·
Thunder Falls · Canyon Run · Serpent Falls · World Tour ·
Torrent Gauntlet · Moonlit Rapids · Storm Coast ·
Bioluminescent Cave · Ancient Ruins · Desert Oasis

Keep an eye out for shortcuts on several tracks. Canyon Run, Serpent
Falls, and Bioluminescent Cave are one-way sprints rather than lap-based
loops.

**Mirror mode** — seven of the loop courses (Thunder Cove, Volcanic
Rapids, Arctic Straits, Voxel Valley, Thunder Falls, Storm Coast, Ancient
Ruins) can also be raced in reverse. Look for the **Race in Reverse**
chip on the course card in Select Course or Scoreboard. It keeps its own
separate scoreboard and ghost, so mastering a course forward and backward
are two different challenges.

## Boats

Twelve boats, each with its own handling and a signature trick:

| Boat | Gimmick |
|---|---|
| Red Fury | Balanced all-rounder |
| Blue Bolt | Lightest hull, fastest in a straight line, easiest to knock off line |
| Green Viper | Heaviest hull, sharp handling, shrugs off hits |
| Gold Comet | Muscle-boat build, massive boost tank |
| Nitro Wasp | Boost regenerates slowly on its own, but a featherweight hull |
| Iron Turtle | Half damage reduction, plus an overdrive gear after sustained boost |
| Skybreaker | Launches higher and farther off ramps, can keep boosting mid-air |
| Vampire Ray | Heals a little on every boosted collision |
| Drift King | Powerslides into turns for a speed burst out of the corner |
| Ragefin | Gets faster the more damaged it is |
| Salvager | Pulls in boost pads from farther away, tops off fuller |
| Phoenix | Survives one fatal hit per race with a few seconds of invulnerability |

Most boats let you swap in an alternate gimmick module from the **Boats**
screen if you want to tweak how they play, and you can recolor any boat
to your taste.

## Options

Adjust master/music/engine volume, mute everything, invert steering, or
change when the low-health warning kicks in. Every setting is saved
automatically in your browser.

### Accessibility

- **Colorblind-Friendly Health Bar** — swaps the health meter's
  red-to-green gradient for red-to-blue, which reads more clearly for
  red-green colorblindness.
- **Menu Size** — scale menus up to 130% for easier reading. This only
  affects menus, not the in-race HUD.

### Backing up your save

Under Options, **EXPORT SAVE** downloads a single file with your
settings, scoreboard times, ghosts, and achievements. **IMPORT SAVE**
loads one back in (it'll ask you to confirm first, since it replaces
everything). Handy before reinstalling, switching browsers or devices, or
just keeping a backup — since everything lives only in your browser,
there's no account to fall back on if you clear your browsing data.

## Scoreboard & ghosts

Options → **SCOREBOARD** shows your top 5 times per course, split into
tabs for Race, Time Attack, and Ring Race (Cup keeps its own separate
standings). Each entry remembers the boat you used and the date you set
it, and you can clear scores for a single course if you want a clean
slate.

When you race solo (any mode except Cup), you'll also see a **ghost** —
a see-through replay of the current best time on that course, shown in
whatever boat set it. Beat it and your new run takes its place. Co-op
and Cup races don't have a ghost, since there's no single run to chase.

## Achievements

Options → **ACHIEVEMENTS** lists 12 challenges, from winning your first
race to finishing every course, collecting every boat, or beating your
own ghost. A few track progress over many races and show a live counter
while locked; the rest unlock the moment you complete them. Unlocking one
pops a small toast notification in the corner of the screen.

## Installing it as an app

If the game is running from a proper web address (`http://localhost` or
`https://`, not just a plain opened file), you can install it like a real
app. An **INSTALL APP** button will appear on the main menu when your
browser supports it — this gives the game its own icon and its own
window, with no browser address bar or tabs. Once it's loaded at least
once while online, it keeps working completely offline afterward,
including after a full page refresh.

For full step-by-step instructions per platform (Windows, macOS, Linux,
Android, iOS) — including what's needed to get it onto a phone — see
[PWA_SETUP.md](PWA_SETUP.md).

## Credits

- **Tim** — game design, development, and boat models
- **Claude Sonnet** ([Anthropic](https://www.anthropic.com/)) — AI coding assistant
- Built with [three.js](https://threejs.org/) for 3D rendering
