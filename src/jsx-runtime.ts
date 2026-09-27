// MinUI's own TSX pragma (OR-Track D2) - the automatic JSX runtime contract
// (jsx/jsxs/Fragment), so a mod project sets "jsx": "react-jsx" and
// "jsxImportSource": "minui" in its tsconfig.json and gets full JSX syntax
// with zero pragma comments, using the REAL TypeScript compiler as-is (no
// custom parser, no restricted subset - whatever compiles with `tsc`
// compiles here, since screenCompiler.js loads its real compiled output as
// an ordinary Node module, never a sandboxed interpreter).
//
// This module produces a plain node tree, NOT a rendered UI - there is no
// runtime to render into. The shape it builds is byte-identical to what
// lib/markup.js's parseMarkup() already produces from real .ui.html text
// ({ tag, attrs, children, line }), so lib/compile.js's proven,
// in-game-verified ScreenCompiler/compileDocs() never needs to know or
// care whether a screen came from text or from here.
"use strict";

export type UiTextChild = { text: string };
export type UiNode = { tag: string; attrs: Record<string, unknown>; children: UiChild[]; line: number };
export type UiChild = UiNode | UiTextChild;

export const Fragment = Symbol.for("minui.fragment");

function flattenChildren(children: unknown): UiChild[] {
    const out: UiChild[] = [];
    const walk = (c: unknown) => {
        if (c === null || c === undefined || c === false || c === true) return;
        if (Array.isArray(c)) { for (const x of c) walk(x); return; }
        if (typeof c === "string" || typeof c === "number") { out.push({ text: String(c) }); return; }
        out.push(c as UiChild);
    };
    walk(children);
    return out;
}

// `type` is either a string (a raw host tag, e.g. "panel") or a component
// function - every component in src/components/ is a function, so this is
// the common case for real authoring; the string-tag path exists mainly
// for tests and for anyone who wants to drop to the raw tag vocabulary.
export function jsx(type: unknown, props: Record<string, unknown> | null): unknown {
    const { children, ...attrs } = props ?? {};
    if (type === Fragment) return flattenChildren(children);
    if (typeof type === "function") return (type as (p: Record<string, unknown>) => unknown)({ ...attrs, children: flattenChildren(children) });
    if (typeof type === "string") return { tag: type, attrs, children: flattenChildren(children), line: 0 } as UiNode;
    throw new Error(`MinUI JSX: don't know how to build element of type ${String(type)}`);
}

// The automatic runtime calls jsxs() instead of jsx() when an element has
// multiple static children - identical handling here, since flattenChildren
// already treats one child and many children the same way.
export const jsxs = jsx;
export const jsxDEV = (type: unknown, props: Record<string, unknown> | null) => jsx(type, props);

// Classic JSX pragma entry point (tsconfig: "jsx": "react",
// "jsxFactory": "MinUI.createElement", "jsxFragmentFactory": "MinUI.Fragment")
// - used instead of the automatic runtime so a mod project (consuming MinUI
// as a sibling checkout, same convention as everywhere else in this
// ecosystem) never has to get a package-specifier-based jsxImportSource to
// resolve correctly; a plain `import * as MinUI from ".../jsx-runtime.js"`
// is all any authoring file needs.
export function createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown {
    return jsx(type, { ...(props ?? {}), children });
}
