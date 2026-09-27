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
  entity-container.js  Inventory()/Equipment()/Button() container-screen
                 primitives + validateContainerContract() (OR-Track D5)
  png.js         a pure-Node PNG reader/writer (zlib only, no native deps)
  portraits.js   auto-crops a character portrait from its geometry + skin
  test/          entity-container.js's own test suite
runtime/
  runtime.js     the form transport + expression evaluator + navigation stack
  hud.js         the persistent-HUD relay (title-channel data push)
  container.js   chest-style container screens (a satchel entity)
  controlItems.js reusable "locked hotbar loadout, routed to handlers" helper
  i18n.js        per-player language override on top of RawMessage/{t:key}
rp/ui/
  server_form.json       hooks vanilla's own form factory to draw compiled screens
  hud_screen.json        hooks vanilla's HUD to host compiled <hud> elements
  _global_variables.json overrides Bedrock's own dialog transition speed
src/
  jsx-runtime.ts         MinUI's own JSX pragma (classic-runtime createElement/Fragment)
  components/
    screen.ts            Screen/Panel/Row/Column/Grid/Scroll/Text/Image/Portrait/Bar/Button/Spacer/List/Use
    container.ts         ContainerScreen/Slot/Equip/LockedButton (bridges JSX onto lib/entity-container.js)
  compiler/
    screenCompiler.js    loads a mod's tsc-compiled *.screen.js as a real Node
                          module and feeds its tree into lib/compile.js's
                          compileDocs() - the SAME emission logic real
                          .ui.html text already goes through (OR-Track D2)
  test/                  D2's own proof suite (real tsc, byte-identity check
                          against the equivalent .ui.html)
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

## Chest-contract validation (OR-Track D5)

`entity-container.js`'s `validateContainerContract(builder, {declaredInventorySize})`
does declarative, pre-deploy structural checks over a finished
`ContainerBuilder` - modeled on mcbejsonuimasterAI's own chest-contract
research pattern, every issue explicitly `runtimeVerified: false` (a
structural consistency check, never a claim about real in-game behavior).

`Inventory()`/`Equipment()`/`Button()` assign `this.sections[label] = ...`
with no duplicate-label guard - a second call reusing an earlier label
silently overwrites that entry, so a later `attachTo` referencing that
label attaches to the wrong section with no error. `validateContainerContract()`
catches this (an `allocatedLabels` array records every label a call ever
used, duplicates included), plus a genuine button-index collision (a safety
net - the sequential allocator shouldn't normally produce one) and a declared entity
`inventory_size` too small for what the builder actually allocated.

## TypeScript/JSX authoring

Screens can be authored as `.screen.tsx` instead of `.ui.html`, using real
JSX compiled by the real TypeScript compiler - any TypeScript syntax works
(generics, decorators, async/await, classes), since there is no custom
parser or subset involved.

- `src/components/screen.ts` - `Screen`, `Panel`, `Row`, `Column`, `Grid`,
  `Scroll`, `Text`, `Image`, `Portrait`, `Bar`, `Button`, `Spacer`, `List`
  (sugar over `Column` with `each=`/`max=`), `Use` (template
  instantiation). Each is a thin factory producing the same
  `{ tag, attrs, children, line }` node shape `lib/markup.js`'s
  `parseMarkup()` produces from `.ui.html` text, so both authoring formats
  compile through the identical `lib/compile.js` emission logic.
- `src/components/container.ts` - `ContainerScreen`, `Slot`, `Equip`,
  `LockedButton` for chest-style container screens. `entity-container.js`'s
  `ContainerBuilder` is imperative (its methods allocate real slots as they
  run), so `Slot`/`Equip`/`LockedButton` return small descriptors that
  `ContainerScreen` replays as `Inventory()`/`Equipment()`/`Button()` calls
  in authoring order, then runs `validateContainerContract()` over the
  result when `declaredInventorySize` is given.
- `src/jsx-runtime.ts` - the classic JSX pragma (`createElement`/
  `Fragment`). A consuming project's `tsconfig.json` sets `"jsx": "react"`,
  `"jsxFactory": "MinUI.createElement"`, `"jsxFragmentFactory": "MinUI.Fragment"`,
  and each authoring file does `import * as MinUI from ".../jsx-runtime.js"`.
- `src/compiler/screenCompiler.js` - compiles `.screen.tsx` with real
  `tsc`, loads the compiled `.js` as an ordinary Node module, and feeds its
  default-exported tree into `lib/compile.js`'s `compileDocs()`.

`src/test/d2-pilot-compare.js` and `src/test/d2-container-pilot.js` (run by
`npm test`) compile real screens through this path and check the output
against the equivalent hand-written `.ui.html`/`ContainerBuilder` calls.

## Credit

See [CREDITS.md](CREDITS.md) for the full list (bedrock-core/ui,
EasyUIBuilder, mcbejsonuimasterAI) and exactly what was taken from each.

The transport techniques this compiler builds on (form entries as a data
channel, collection indices, container facts, the preserved-title-text HUD
trick) were measured by bedrock-core/ui - see its `docs/spikes`. `<tabs>`
uses a hand-built `type: "toggle"` with content nested inside
`checked_control`, per `bedrock-core/ui`'s own compiler source
(`packages/ui-compiler/src/faces/utils/swap.ts` and
`docs/spikes/S4-toggle-group.md`) - see `<tabs>` in `docs/UI.md` for how it
works.

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
process and ground rules (no runtime dependencies, `node --check` before
opening a PR, small focused changes).

## License

[MIT](LICENSE).
