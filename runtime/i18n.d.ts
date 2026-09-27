// Hand-written type declarations for i18n.js - see runtime.d.ts's own
// header comment for the authoring-layer-only rationale (OR-Track D2).
// translate()/resolveRaw() are engine-internal (consumed by runtime.js/
// hud.js when a player has a per-player language override), left
// untyped/unexported here on purpose - a mod's content scripts never call
// them directly.
import type { Player } from "@minecraft/server";

export interface RegisterLanguageOptions {
    name?: string;
    /** The language this one layers on top of - untranslated keys fall back to it. Defaults to "en_US". */
    base?: string;
    /** Applied to translated template TEXT only, never to inserted values (names/numbers stay readable). */
    transform?: ((text: string) => string) | null;
}
export function registerLanguage(id: string, options?: RegisterLanguageOptions): void;
export function listLanguages(): Array<{ id: string; name: string }>;
export function languageName(id: string): string;
/** The player's own override, or `null` to follow the game language. */
export function getPlayerLanguage(player: Player): string | null;
export function setPlayerLanguage(player: Player, id: string | null): void;
