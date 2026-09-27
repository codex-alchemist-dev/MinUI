// Hand-written type declarations for hud.js - see runtime.d.ts's own
// header comment for the authoring-layer-only rationale (OR-Track D2).
// startHud() is engine-internal bootstrap (called once by the consuming
// project's own start.js), left untyped/unexported here on purpose - a
// mod's content scripts never call it.
import type { Player } from "@minecraft/server";

export type HudProvider = (player: Player) => Record<string, unknown> | void;

export function registerHudProvider(name: string, fn: HudProvider): void;
export function isHudEnabled(player: Player, id: string): boolean;
export function setHudEnabled(player: Player, id: string, enabled: boolean): void;
export function listHuds(): string[];
export function showToast(player: Player, text: string, icon?: string): void;
