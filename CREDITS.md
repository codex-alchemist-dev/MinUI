# Credits

External projects and research this codebase draws on, and exactly what
was taken from each - see [AUTHORS.md](AUTHORS.md) for the people behind
MinUI itself.

## bedrock-core/ui (MIT)

<https://github.com/bedrock-core/ui> - a real, working JSX-based Bedrock UI
framework. Its `docs/spikes` research (form entries as a data channel,
`collection_index`/`collection_details` container facts, the
preserved-title-text HUD trick, the stack-count-as-state-channel button
technique, `<tabs>`'s hand-built `type: "toggle"` mechanism found by reading
`packages/ui-compiler/src/faces/utils/swap.ts`) is the direct basis for
MinUI's own transport techniques in `lib/`/`runtime/`. Every technique was
re-verified in-game by this project before being relied on, not assumed
from their docs alone - see the consuming project's own UI-0 spike log.
`@bedrock-core/flexbox`'s layout-solver scope (a small, dependency-free
CSS-flexbox model sized for Bedrock's screen) is the basis for OR-Track D3's
shared layout resolver. No code copied verbatim as of this writing; credit
is for the researched techniques and API shape, re-implemented under this
project's own MIT license.

## EasyUIBuilder (MIT)

<https://github.com/Refaltor77/EasyUIBuilder> - a mature PHP JSON-UI
builder, not a runtime dependency (different language, not built on top
of). Its **modifications-system vocabulary** -
`insert_back`/`insert_front`/`insert_after`/`insert_before`/`move_back`/
`move_front`/`move_after`/`move_before`/`swap`/`replace`/`remove` for
non-destructive vanilla/other-mod-tree patching (OR-Track D6) - and its
full-element-coverage checklist (Label/Panel/Button/Image/Grid/StackPanel/
Toggle/Slider/EditBox/ScrollView/Dropdown/InputPanel/Screen/CustomRender)
as a feature-completeness reference for MinUI's own component list are what
was taken. API/vocabulary design credit only, no code shared.

## mcbejsonuimasterAI

<https://github.com/boredape874/mcbejsonuimasterAI> - not a UI framework, a
structured research knowledge base. Its declarative chest-contract
schema/validator pattern (checking slot-id/index/ActionForm-mixing
structural consistency before deployment, every check explicitly marked
`runtimeVerified: false` rather than claiming to prove real in-game
behavior) is the direct model for `lib/entity-container.js`'s
`validateContainerContract()` (OR-Track D5) and `lib/lintjsonui.js`'s
own checks. Its source-authority ranking (Microsoft Learn > pinned Mojang
samples > target client + Content Log > community guides > third-party
mirrors) is adopted as this project's own documentation policy.
