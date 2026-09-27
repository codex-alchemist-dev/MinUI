# MinUI

A custom in-game UI framework for Minecraft Bedrock add-ons: an HTML/CSS-like
screen language, a compiler that emits real Minecraft JSON UI, and a runtime
that drives it from script. Originally built inside [OpenChara](https://github.com/codex-alchemist-dev/OpenChara),
pulled out into its own repo because it's a genuinely separate concern -
OpenChara is a character/squad/tactical-AI framework; MinUI is just the UI
layer any Bedrock add-on could use.

A [Codex Alchemist](https://github.com/codex-alchemist-dev) project, under
Fireball Everything. See [AUTHORS.md](AUTHORS.md).

**Status: early, single-consumer.** OpenChara is the only project wired up to
it today, and some of MinUI's code still assumes OpenChara's conventions
(namespace/tag naming resolved at build time, not yet a configurable option
here). Treat this as "the UI code lives in its own repo now" more than "a
polished, general-purpose library" - that's real future work, not done yet.

## What this is not

MinUI is not a way to build fully clickable custom menus with zero use of
Bedrock's own dialog system. That would be nice, but it isn't possible on
current public Bedrock APIs - see **Architecture** below for the actual,
verified constraint and what MinUI does about it.

## Layout

```
lib/
  markup.js      the .ui.html/.ui.css parser
  compile.js     the compiler: markup -> JSON UI + a runtime field table
  lintjsonui.js  catches known "silent failure" JSON UI mistakes at build time
  png.js         a pure-Node PNG reader/writer (zlib only, no native deps)
  portraits.js   auto-crops a character portrait from its geometry + skin
runtime/
  runtime.js     the form transport + expression evaluator + navigation stack
  runtime.d.ts   hand-written types for runtime.js (OR-Track D2)
  hud.js         the persistent-HUD relay (title-channel data push)
  hud.d.ts       hand-written types for hud.js
  container.js   chest-style container screens (a satchel entity)
  container.d.ts hand-written types for container.js
  controlItems.js reusable "locked hotbar loadout, routed to handlers" helper
  controlItems.d.ts hand-written types for controlItems.js
  i18n.js        per-player language override on top of RawMessage/{t:key}
  i18n.d.ts      hand-written types for i18n.js
types/
  test/          type-check tests for the .d.ts files above (real tsc, see
                 "TypeScript authoring" below)
  tsconfig.example.json  a starting point for a mod project's own tsconfig
rp/ui/
  server_form.json       hooks vanilla's own form factory to draw compiled screens
  hud_screen.json        hooks vanilla's HUD to host compiled <hud> elements
  _global_variables.json overrides Bedrock's own dialog transition speed
```

A consuming project (currently only OpenChara) copies/reads these into its
own build output at the same relative paths they've always lived at, so
nothing downstream (dynamic property keys, import paths inside the compiled
pack) changes just because the source moved repos.

## Architecture

### The one hard constraint everything here is built around

**A persistent on-screen overlay (a HUD) cannot receive a mouse/touch/
controller click at all, on any current public Bedrock API.** Only a modal
- an `ActionFormData`/`ModalFormData` **form**, or a **container** (chest-
style) screen - can capture a real click, because only a modal suspends
normal gameplay input and hands it to the UI. This isn't a workaround
choice; it's a verified, load-bearing limit of the platform (confirmed
against Mojang's own public API surface, and directly evidenced by this
project's own `pressAllowed()` check in `lib/compile.js`, which existed
before this README did).

Practically, this means:

- **Any interactive menu** (rosters, profiles, settings, anything with a
  button a player clicks) has to be **hosted in a form**. There's no way
  around this today.
- **A persistent display** (a squad HP bar, a quest tracker, a toast) can be
  a genuine always-on-screen HUD element, since it never needs to take a
  click - only to show data.

### Forms: real custom JSON UI, riding a form as its transport

A "form-hosted screen" is not vanilla's plain form look. The form's *title*
carries a small protocol header (`oc1|<screen>|`); a resource-pack hook in
`rp/ui/server_form.json` recognizes that header and swaps in the compiler's
own fully custom JSON UI layout instead of vanilla's default button list.
Every dynamic value on the screen - text, an icon, a bar's fill, a
visibility flag, which button got pressed - is one entry in that form,
resolved through a `collection_index` binding into the actual `ActionFormData`
button array. Pressing any button closes the form; the runtime (`runtime.js`)
immediately computes the next state and shows a new form snapshot (the same
screen with new data, a different screen, or nothing).

**Every single one of those form re-shows plays Bedrock's own dialog open/
close transition.** This can't be suppressed - it's tied to the same modal
mechanism that makes the form clickable at all. What *can* be controlled is
its **duration**: vanilla's own dialog animations read their timing from
overridable global variables (`$transition_time_push`, `$transition_time_pop`,
and their `_size` variants), which default to 0.4-0.6 seconds in vanilla.
`rp/ui/_global_variables.json` overrides these to 0 - a screen simply pops
in/out instantly, no slide/fade/zoom at all - the same kind of override any
resource pack (including snappier commercial server lobby menus) can ship.
Vanilla itself uses a 0-duration animation in places (`loading_bar_init_
animation_push` in its own `ui_common.json`), so this isn't an edge case
JSON UI merely tolerates - it's a supported value. This is global to every
Bedrock dialog while the pack is active, not scoped to just this project's
own screens - a deliberate, disclosed tradeoff.

**Tried and reverted:** `cache_screen: true` and `load_screen_immediately: true`
on `long_form` - two real `screen`-type properties vanilla itself uses on
`pause_screen`/`inventory_screen_common`. Undocumented beyond their name and
type anywhere, and it turned out to matter: Minecraft's own Content Log
(`openchara.js log` - the only place JSON UI errors actually land; they never
show in-game) flagged both as `Unknown property` on `def[long_form] from
namespace[server_form]`, every single time the screen opened. Whatever makes
`cache_screen` valid on `pause_screen` doesn't apply to a `def` reached via
`modifications` the way `long_form` is here. An unknown property is silently
ignored by the parser (not fatal), so this cost nothing functionally, but it
spammed a real error on every screen open for no benefit - removed.

**What genuinely can't be done at all**: hold the *previous* screen fully
alive and visible while the next one loads. This project already confirmed
(UI-0) that every `ActionFormData.show()` re-triggers a full screen
push/pop at the engine level - there's a real, documented
`render_only_when_topmost` screen property implying a screen stack exists,
but a stack doesn't help here since a form re-show is a full pop-then-push
of a *single* screen, not two screens coexisting. The actual, working fix
for tab-switching specifically turned out to be avoiding the form re-show
altogether - see `<tabs>` below.

### HUD: a real always-on overlay, for display only

`<hud>` elements (compiled by the same `lib/compile.js`, in a mode where
`pressAllowed()` returns false - buttons are a compile error there) are
injected into vanilla's own `hud_screen.json` and are visible during normal
gameplay, no dialog ever involved. Since JSON UI can't be pushed arbitrary
data directly, each dynamic value gets its own key, and `runtime/hud.js`
relays it to the client by encoding `key+value` into the player's own title
text (`player.onScreenDisplay.setTitle(...)`) - a "preserved title text"
control inside the HUD element remembers the last value it saw for its key
and never touches the vanilla title text itself.

**The one real throughput limit here, confirmed empirically (not assumed):**
the client only honors the *last* title set in a given game tick - two
`setTitle()` calls in the same tick and the first one's value is lost. So
`hud.js` sends exactly one changed value per player per tick, from a queue
that only holds values that actually changed since last sent. In steady
state (most values unchanged between refreshes) this is fast; a brand-new
HUD element with many still-unsent values takes one tick per value to fully
populate the first time.

### Containers: a real chest, not a fake one

A container screen (`runtime/container.js`) is a genuine `minecraft:inventory`
on a small, positioned satchel entity - opened by the player's own next
right-click (scripts can't force a container open). It's still a modal
(same click-capture requirement as forms), and still plays its own open
animation, for the same underlying reason forms do.

### Control items: input without any UI open at all

`runtime/controlItems.js` is the mechanism behind hotbar-item-driven
interaction (used by OpenChara's RTS command mode): a locked hotbar loadout
where each slot is a real item, and using it fires a registered handler.
This sidesteps the whole click-capture question entirely, since it's driven
by Bedrock's normal item-use/block-interact events, not by any on-screen
control - real interactivity with zero dialog transition, at the cost of
being keyboard/hotbar-driven rather than point-and-click.

## TypeScript authoring (OR-Track D2)

**Authoring-layer-only** - a real, confirmed scope decision, not a partial
implementation: a mod's own content scripts can be written in TypeScript
against MinUI's real runtime API for full type-checking/autocomplete;
MinUI's own compiler and runtime (`lib/`, `runtime/*.js`) stay plain,
dependency-free JS forever. Nothing about MinUI's own build changes.

- Each `runtime/*.js` file has a hand-written `runtime/*.d.ts` sitting
  right next to it - TypeScript's own module resolution finds it
  automatically for a relative `import ... from ".../runtime.js"`, no
  bundler and no MinUI build step required.
- `typescript` and `@minecraft/server` are **devDependencies only** (for
  testing these `.d.ts` files against the real compiler) - MinUI's actual
  runtime still has zero dependencies, per its own long-standing rule (see
  `CONTRIBUTING.md`). A mod project that wants to author in TypeScript
  adds its own `typescript` devDependency and compiles with a real `tsc`
  step before OpenRock's build picks up the resulting plain `.js` as an
  ordinary content script - see `types/tsconfig.example.json` for a
  starting point.
- `npm test` (`types/test/run.js`) runs the real TypeScript compiler
  against two fixtures: `valid-sample.ts` (realistic usage of every typed
  export across every runtime module - must type-check with zero errors)
  and `invalid-sample.ts` (five deliberately wrong calls, one per real
  mistake a mod author could make - must produce exactly five errors,
  proving the types actually catch mistakes rather than accepting `any`).

## Credit

The transport techniques this compiler builds on (form entries as a data
channel, collection indices, container facts, the preserved-title-text HUD
trick) were originally measured by [bedrock-core/ui](https://github.com/bedrock-core/ui)
(MIT) - see its `docs/spikes`. Every one was re-verified in-game by this
project before being relied on (see the consuming project's own UI-0 spike
log for what was actually confirmed and when). `<tabs>`'s own working
mechanism - a hand-built `type: "toggle"` with content nested inside
`checked_control` - was found by reading `bedrock-core/ui`'s actual compiler
source (`packages/ui-compiler/src/faces/utils/swap.ts` and its own
`docs/spikes/S4-toggle-group.md`) after two earlier, independent guesses
both shipped broken - see `<tabs>` in `docs/UI.md` for the full four-attempt
history.

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
process and ground rules (no runtime dependencies, `node --check` before
opening a PR, small focused changes).

## License

[MIT](LICENSE).
