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
