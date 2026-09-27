// Deliberately WRONG usage of MinUI's real API - proves runtime.d.ts/
// hud.d.ts/etc. actually catch real mistakes rather than silently
// accepting `any`. run.js asserts tsc reports errors for EVERY line
// below, each tagged with which real mistake it represents.
import type { Player } from "@minecraft/server";
import { registerUiProvider, openScreen } from "../../runtime/runtime.js";
import { setHudEnabled } from "../../runtime/hud.js";
import { openContainer } from "../../runtime/container.js";
import { setPlayerLanguage } from "../../runtime/i18n.js";

// Wrong: a provider must return an object (or void), not a number.
registerUiProvider("bad-provider", (player: Player) => 42);

// Wrong: openScreen's second argument is a string screen key, not a number.
openScreen({} as Player, 5);

// Wrong: setHudEnabled's third argument is a boolean, not a string.
setHudEnabled({} as Player, "squadBar", "yes");

// Wrong: openContainer's spec requires an object; "size" must be a number, not a string.
openContainer({} as Player, { size: "27" });

// Wrong: setPlayerLanguage's second argument must be a string or null, not a number.
setPlayerLanguage({} as Player, 5);
