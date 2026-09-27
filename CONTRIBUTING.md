# Contributing to MinUI

Thanks for taking a look. MinUI is the UI layer any Bedrock add-on could
use - it's still early and single-consumer (OpenChara), so expect some
rough edges around configurability. See the README's "Status" note before
assuming something is a finished, general-purpose feature.

## Ground rules

- **No dependencies in the compiled pack output.** The actual JSON UI/BP-RP
  MinUI produces is plain Node/`require()`-based with zero runtime
  dependencies (zlib-only for PNG work, `lib/png.js`) - Bedrock's own
  script engine has no npm anyway, so this was never really optional.
  Build-time tooling dependencies (`typescript`, `@minecraft/server` types,
  esbuild, or anything else genuinely useful for compiling/authoring) are
  fully fine to add - there is no "zero dependencies, period" rule for this
  project's own tooling, only for what actually ships. `typescript` is now
  load-bearing, not just a type-check exercise: `src/compiler/screenCompiler.js`
  (OR-Track D2) runs the real compiler on a mod's `.screen.tsx` files as
  part of producing real output.
- **Respect the one hard platform constraint.** A persistent HUD element
  cannot receive a click on any current public Bedrock API - see the
  README's "Architecture" section before proposing anything that assumes
  otherwise. If you've found new evidence this has changed, open an issue
  with the specifics before writing code against it.
- **Verify in-game, not just in the compiler.** JSON UI failures are
  silent in-game - `tools/openchara.js log` (in a consuming project) is
  the only place they surface. A change to `lib/compile.js` or
  `lib/lintjsonui.js` should be checked against Minecraft's real content
  log, not just "the compiler didn't throw."
- **`node --check` every file you touch.**
- **Small, focused PRs** - one logical change per PR.

## Pull request process

1. Fork the repo and create a branch off `main`.
2. Make your change, following the ground rules above.
3. Test it against a real consuming project (OpenChara + a test
   `PATCHES/` folder is the reference setup) and check Minecraft's content
   log for new warnings/errors.
4. Open a PR against `main` and fill out the template.
5. Address review feedback. A maintainer will merge once it looks good.

## Reporting bugs / requesting features

Open an issue. For a bug, include the relevant `.ui.html`/`.ui.css`
snippet, what you expected, what happened, and anything from Minecraft's
content log. For a feature request, a short explanation of the use case
helps more than a fully-specced design.

## Code of conduct

Be respectful, assume good faith, keep disagreements about the code, not
the person.
