// Pure, stateless value-parsing helpers used across ScreenCompiler and its
// extracted method modules (animations.js, customElements.js) - extracted
// from lib/compile.js so both compile.js's own remaining methods and the
// extracted modules share ONE real implementation instead of two copies
// silently drifting apart over time.
"use strict";

function hexColor(v, err) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(v).trim());
    if (!m) err(`color "${v}" must be #rrggbb`);
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(x => Math.round(x * 1000) / 1000);
}

function sizeValue(v, err) {
    const s = String(v).trim();
    if (/^-?\d+(\.\d+)?(px)?$/.test(s)) return parseFloat(s);
    if (/^\d+(\.\d+)?%$/.test(s)) return s;
    if (s === "fill") return "fill";
    if (s === "fit") return "100%c";
    if (/^[\d.%cmsxyp +\-]+$/.test(s)) return s; // raw JSON UI expression, e.g. "100% - 8px"
    err(`size "${s}" - use a number, N%, fill, fit, or an expression like "100% - 8px"`);
}

const ANCHORS = ["top_left", "top_middle", "top_right", "left_middle", "center", "right_middle", "bottom_left", "bottom_middle", "bottom_right"];

function addPx(size, px) {
    if (!px) return size;
    if (typeof size === "number") return size + px;
    return `${size} + ${px}px`;
}
function subPx(size, px) {
    if (!px) return size;
    if (typeof size === "number") return Math.max(0, size - px);
    if (size === "100%c") return size;
    return `${size} - ${px}px`;
}

function specificity(sel) { return (sel.id ? 100 : 0) + sel.classes.length * 10 + (sel.tag ? 1 : 0); }
function matches(sel, node) {
    if (sel.tag && sel.tag !== node.tag) return false;
    if (sel.id && sel.id !== node.attrs.id) return false;
    const classes = String(node.attrs.class ?? "").split(/\s+/).filter(Boolean);
    return sel.classes.every(c => classes.includes(c));
}

// on:press="a(x); back" - several actions run in order (stops at the first
// that fails). Splits on ; outside quotes and brackets.
function splitActions(src) {
    const out = [];
    let depth = 0, cur = "", q = null;
    for (const ch of src) {
        if (q) { cur += ch; if (ch === q) q = null; continue; }
        if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
        if (ch === "(" || ch === "[") depth++;
        if (ch === ")" || ch === "]") depth--;
        if (ch === ";" && depth === 0) { if (cur.trim()) out.push(cur); cur = ""; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
}

const FONT_HEIGHT = { small: 8, normal: 10, large: 14, extra_large: 20 };

module.exports = { hexColor, sizeValue, ANCHORS, addPx, subPx, specificity, matches, splitActions, FONT_HEIGHT };
