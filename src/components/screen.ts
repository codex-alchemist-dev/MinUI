// MinUI's JSX component model for form/HUD screens (OR-Track D2) - thin
// factories producing the exact { tag, attrs, children, line } node shape
// lib/compile.js's ScreenCompiler already consumes from real .ui.html text.
// Every tag name here matches lib/compile.js's own TAGS set byte-for-byte -
// this is a new authoring surface over the SAME proven emission backend,
// never a reimplementation of it.
"use strict";
import type { UiChild, UiNode } from "../jsx-runtime.js";

// Every element shares this attribute vocabulary - identical to what
// lib/markup.js's real .ui.html format already supports, since these are
// read as plain strings straight off `attrs` by lib/compile.js (see its
// node.attrs.if / node.attrs.each / node.attrs.max / node.attrs["on:press"]
// reads) - nothing here is a new runtime concept, only a typed authoring
// surface for the existing one.
export interface CommonProps {
    id?: string;
    class?: string;
    style?: string;
    /** Gate this element on a runtime expression, e.g. if="path.unlocked". */
    if?: string;
    /** Repeat this element once per item, e.g. each="c in roster". */
    each?: string;
    /** Caps the reserved room for an each="" repeat (a compiled shape can't grow). */
    max?: string | number;
    children?: unknown;
    [attr: string]: unknown;
}

export interface ButtonProps extends CommonProps {
    /** e.g. on:press="open('profile', c.id)" or on:press="call(myHandler, c.id)" */
    "on:press"?: string;
}

function make(tag: string) {
    return function Component(props: CommonProps): UiNode {
        const { children, max, ...rest } = props;
        const attrs: Record<string, unknown> = { ...rest };
        if (max !== undefined) attrs.max = String(max);
        return { tag, attrs, children: (children ?? []) as UiChild[], line: 0 };
    };
}

export const Screen = make("screen");
export const Panel = make("panel");
export const Row = make("row");
export const Column = make("column");
export const Grid = make("grid");
export const Scroll = make("scroll");
export const Text = make("text");
export const Image = make("image");
export const Portrait = make("portrait");
export const Bar = make("bar");
export const Spacer = make("spacer");

// Button needs its own typed props (on:press) but shares the same factory body.
const buttonFactory = make("button");
export function Button(props: ButtonProps): UiNode { return buttonFactory(props); }

// `List` isn't a distinct tag in lib/compile.js - each="" is a generic
// attribute usable on any container element. This is pure authoring sugar
// over Column with each/max wired, never a new backend concept - keeping it
// this way means it inherits Column's exact, already-tested emission
// instead of inventing a parallel "list" code path.
export interface ListProps extends CommonProps {
    each: string;
    max: string | number;
}
export function List(props: ListProps): UiNode {
    return make("column")(props);
}

/** <use t="templateId"/> - instantiates a <template> defined elsewhere in the mod's ui/. */
export function Use(props: { t: string }): UiNode {
    return { tag: "use", attrs: { t: props.t }, children: [], line: 0 };
}

/**
 * <animate type="alpha|clip|color|flip_book|offset|size|uv|wait|aseprite_flip_book" .../>
 * - a full escape hatch onto Bedrock's native animation schema, as a child
 * of the element it animates. `from`/`to`/`initial_uv` take a JSON-literal
 * string, e.g. `from="[0,0]"` or `from="0"` (matching the .ui.html syntax
 * exactly, since both authoring formats compile through the same
 * registerAnimation() in lib/compile.js).
 */
export interface AnimateProps {
    type: string;
    duration?: string | number;
    easing?: string;
    from?: string;
    to?: string;
    initial_uv?: string;
    next?: string;
    "play_event"?: string;
    "start_event"?: string;
    "end_event"?: string;
    "reset_event"?: string;
    reversible?: boolean;
    resettable?: boolean;
    fps?: string | number;
    frame_count?: string | number;
    frame_step?: string | number;
}
export function Animate(props: AnimateProps): UiNode {
    const attrs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) attrs[k] = typeof v === "boolean" ? String(v) : v;
    return { tag: "animate", attrs, children: [], line: 0 };
}

/**
 * <keyframes property="offset" duration="0.6" [loop] [curve="catmull-rom"] [steps]>
 *   <Key at={0} value="[0,0]"/>
 *   <Key at={0.5} value="[10,-20]" easing="out_bounce"/>
 *   <Key at={1} value="[0,0]" easing="in_quad"/>
 * </keyframes>
 * - real multi-waypoint keyframing / Catmull-Rom spline motion, same
 * semantics and syntax as the .ui.html form (see lib/compile.js's
 * keyframesEl()) since both compile through the identical function.
 */
export interface KeyframesProps {
    property: string;
    duration: string | number;
    loop?: boolean;
    curve?: "catmull-rom";
    steps?: string | number;
    children?: unknown;
}
export function Keyframes(props: KeyframesProps): UiNode {
    const { children, loop, ...rest } = props;
    const attrs: Record<string, unknown> = { ...rest };
    if (loop !== undefined) attrs.loop = String(loop);
    return { tag: "keyframes", attrs, children: (children ?? []) as UiChild[], line: 0 };
}
export interface KeyProps { at: string | number; value: string; easing?: string; }
export function Key(props: KeyProps): UiNode {
    return { tag: "key", attrs: { at: String(props.at), value: props.value, ...(props.easing ? { easing: props.easing } : {}) }, children: [], line: 0 };
}

/** <switch on="c.rarity"><Case value="legendary">...</Case><Default>...</Default></switch> */
export interface SwitchProps { on: string; children?: unknown; }
export function Switch(props: SwitchProps): UiNode {
    return { tag: "switch", attrs: { on: props.on }, children: (props.children ?? []) as UiChild[], line: 0 };
}
export interface CaseProps { value: string | number; children?: unknown; }
export function Case(props: CaseProps): UiNode {
    return { tag: "case", attrs: { value: String(props.value) }, children: (props.children ?? []) as UiChild[], line: 0 };
}
export function Default(props: { children?: unknown }): UiNode {
    return { tag: "default", attrs: {}, children: (props.children ?? []) as UiChild[], line: 0 };
}
