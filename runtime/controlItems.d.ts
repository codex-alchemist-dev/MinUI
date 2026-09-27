// Hand-written type declarations for controlItems.js - see runtime.d.ts's
// own header comment for the authoring-layer-only rationale (OR-Track D2).
// startControlItems() is engine-internal bootstrap, left untyped/
// unexported here on purpose.
import type { Player } from "@minecraft/server";

export function registerControlItem(itemTypeId: string, handler: (player: Player) => void): void;
/** `slots`: hotbar index (0-8) -> item type id to place there, locked and immune to placing/breaking. */
export function setControlItems(player: Player, slots: Record<number, string>): void;
/** Removes every currently-held registered control item, wherever it ended up in the inventory. */
export function clearControlItems(player: Player): void;
