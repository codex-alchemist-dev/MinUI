// Hand-written type declarations for runtime.js (OR-Track D2: TypeScript
// authoring-layer-only). MinUI's own compiler/runtime stay plain JS
// forever - this file exists purely so a MOD's own .ts content scripts get
// real type-checking/autocomplete against MinUI's real, stable,
// author-facing API. Sits next to runtime.js so TypeScript's own module
// resolution finds it automatically for a relative `import ... from
// ".../runtime.js"` - no bundler, no build step of MinUI's own required.
//
// Only the functions a mod author actually calls are typed here -
// evaluate()/withLoops()/renderTemplateForHud() are engine-internal
// (consumed by hud.js, not a mod's own content scripts) and deliberately
// left untyped.
import type { Player } from "@minecraft/server";

/** A screen field's value, or `{translate, with}` for a localized one the client resolves itself. */
export type RawOrString = string | { translate: string; with?: string[] };

/** `fn(player, params, state) => data` - the object a `<screen data="name">` template reads from. */
export type UiProvider = (player: Player, params: Record<string, unknown>, state: Record<string, unknown>) => Record<string, unknown> | void;

/** Return value a handler/action can use to steer navigation and/or show a one-time message. */
export type UiActionResult =
    | void
    | string
    | {
          open?: [screenKey: string, ...args: unknown[]];
          replace?: [screenKey: string, ...args: unknown[]];
          back?: boolean;
          close?: boolean;
          flash?: string;
          error?: string;
      };

/** `this` inside a handler/action is the pressed control's own screen frame. */
export interface UiActionThis {
    params: Record<string, unknown>;
    state: Record<string, unknown>;
}

export type UiHandler = (this: UiActionThis, player: Player, ...args: unknown[]) => UiActionResult | Promise<UiActionResult>;
export type UiAction = UiHandler;

export function registerUiProvider(name: string, fn: UiProvider): void;
export function registerUiHandler(name: string, fn: UiHandler): void;
export function registerUiAction(name: string, fn: UiAction): void;
export function hasScreen(key: string): boolean;

/** Opens `key` as a fresh navigation root, replacing whatever this player had open. `args` fill the screen's declared params in order. */
export function openScreen(player: Player, key: string, ...args: unknown[]): boolean;

/** Shows `key` once as a picker: a pressed `choose(value)` control resolves to `value`; anything else (back/close/X) resolves to `null`. */
export function choose(player: Player, key: string, ...args: unknown[]): Promise<unknown>;

export interface ConfirmOptions {
    title?: string;
    body?: string;
    yes?: string;
    no?: string;
    danger?: boolean;
}
/** Yes/no. Uses the project's own "confirm" screen if it has one, else Minecraft's message box. */
export function confirm(player: Player, options?: ConfirmOptions): Promise<boolean>;

export interface AskTextOptions {
    title?: string;
    label?: string;
    placeholder?: string;
    value?: string;
}
/** One line of text via Minecraft's own text box. `null` when cancelled. */
export function askText(player: Player, options?: AskTextOptions): Promise<string | null>;

export interface AskChoiceOptions {
    title?: string;
    label?: string;
    options?: string[];
}
/** A dropdown choice; resolves to the chosen index, or `null` when cancelled. */
export function askChoice(player: Player, options?: AskChoiceOptions): Promise<number | null>;

export interface DialogueOptions {
    name?: string;
    portrait?: string;
    text?: string;
    choices?: string[];
}
/** One dialogue line. Uses the project's own "dialogue" screen if it has one. Resolves to the chosen index, or `null`. */
export function dialogue(player: Player, options?: DialogueOptions): Promise<number | null>;
