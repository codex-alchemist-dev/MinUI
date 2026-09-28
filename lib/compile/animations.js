// ScreenCompiler's animation subsystem (JSON UI anim_type alpha/offset/etc.,
// chained via "next") - extracted verbatim from lib/compile.js into its own
// module per the project's standing modularity rule (every file/concern
// should be genuinely separable, not one growing monolith). These are
// mixed onto ScreenCompiler.prototype (see the bottom of lib/compile.js) -
// same `this`, same shared per-compilation state (this.defs/this.n/
// this.key/this.ns/this.err), zero behavior change from before this
// extraction; this is a pure file-organization split, not a rewrite.
//
//   fade-in: <duration> [delay]          0 -> opacity
//   slide-from: <dx> <dy> <duration> [delay]   from offset+(dx,dy) to offset
//   pulse: <period>                       loops alpha between 1 and 0.35
//   easing: linear | out-cubic | out-back | in-out-quad | ...
//   <animate type="offset|size|alpha|color|clip|uv|flip_book|wait" .../> -
//     a general escape hatch onto Bedrock's FULL native animations schema.
//   <keyframes property="..." duration="...">...<key .../>...</keyframes> -
//     real multi-waypoint keyframing built on the native two-point
//     anim_type + `next` chaining primitive.
"use strict";

const { NATIVE_EASINGS, cubicBezierEasing, catmullRom, sampleCurve } = require("../easing.js");

function anim(def) {
    const name = `anim_${this.key}_${this.n++}`;
    this.defs[name] = def;
    return `@${this.ns}.${name}`;
}

function animate(st, p, e) {
    const secs = v => {
        const m = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(String(v ?? "").trim());
        if (!m) e(`time "${v}" - write e.g. 0.4s or 250ms`);
        return m[2] === "ms" ? parseFloat(m[1]) / 1000 : parseFloat(m[1]);
    };
    const easing = (st.easing ?? "out-cubic").replace(/-/g, "_");
    const target = p.alpha ?? 1;
    let pulse = null;
    if (st.pulse) {
        const half = secs(st.pulse) / 2;
        const a = `anim_${this.key}_${this.n++}`, b = `anim_${this.key}_${this.n++}`;
        this.defs[a] = { anim_type: "alpha", easing: "in_out_quad", duration: half, from: 1, to: 0.35, next: `@${this.ns}.${b}` };
        this.defs[b] = { anim_type: "alpha", easing: "in_out_quad", duration: half, from: 0.35, to: 1, next: `@${this.ns}.${a}` };
        pulse = `@${this.ns}.${a}`;
    }
    if (st["fade-in"]) {
        const [d, delay] = st["fade-in"].split(/\s+/);
        const main = { anim_type: "alpha", easing, duration: secs(d), from: 0, to: target };
        if (pulse) main.next = pulse;
        let ref = this.anim(main);
        if (delay) ref = this.anim({ anim_type: "alpha", easing: "linear", duration: secs(delay), from: 0, to: 0, next: ref });
        p.alpha = ref;
        p.propagate_alpha = true;
    } else if (pulse) { p.alpha = pulse; p.propagate_alpha = true; }
    if (st["slide-from"]) {
        const [dx, dy, d, delay] = st["slide-from"].split(/\s+/);
        const to = p.offset ?? [0, 0];
        if (typeof to[0] !== "number" || typeof to[1] !== "number") e("slide-from needs a pixel offset (or none)");
        const from = [to[0] + parseFloat(dx), to[1] + parseFloat(dy ?? "0")];
        let ref = this.anim({ anim_type: "offset", easing, duration: secs(d ?? "0.4s"), from, to });
        if (delay) ref = this.anim({ anim_type: "offset", easing: "linear", duration: secs(delay), from, to: from, next: ref });
        p.offset = ref;
    }
}

// A number (alpha) or vector (offset/size/uv/color) linearly interpolated
// at parameter t - the one thing every baked-curve chain segment needs
// (custom curves are baked as many tiny LINEAR native segments
// approximating the real curve shape, see lib/easing.js).
function lerpValue(from, to, t) {
    if (Array.isArray(from)) return from.map((v, i) => v + ((to[i] ?? v) - v) * t);
    return from + (to - from) * t;
}

// Custom easing curves (cubic-bezier(), or a keyframe chain's own
// curve="catmull-rom") have no native Bedrock equivalent - Bedrock's
// animation player only knows its own fixed easing enum and can't evaluate
// an arbitrary curve function per frame. This bakes one at compile time
// into `steps` tiny native `anim_type` segments (easing "linear" within
// each, since the curve SHAPE is now expressed by where each segment's own
// from/to sit, not by an easing keyword), chained via `next` exactly like
// the pulse animation above. Returns the ref to the first segment (what a
// caller puts in `anims[]` to start the whole chain).
function bakeCurveChain({ anim_type, from, to, duration, sampleFn, steps = 12, leadingAttrs = {}, trailingAttrs = {} }) {
    const samples = sampleCurve(sampleFn, steps);
    const segDuration = duration / steps;
    let nextRef;
    for (let i = steps; i >= 1; i--) {
        const def = {
            anim_type, easing: "linear", duration: segDuration,
            from: this.lerpValue(from, to, samples[i - 1]),
            to: this.lerpValue(from, to, samples[i]),
        };
        if (i === steps) Object.assign(def, trailingAttrs);
        if (i === 1) Object.assign(def, leadingAttrs);
        if (nextRef) def.next = nextRef;
        nextRef = this.anim(def);
    }
    return nextRef;
}

// Parses a cubic-bezier(x1,y1,x2,y2) easing string, or returns null if
// `value` isn't one (a plain native easing name, validated separately).
function parseCubicBezier(value, node) {
    const m = /^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/.exec(String(value).trim());
    if (!m) return null;
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    if ([x1, y1, x2, y2].some(n => Number.isNaN(n))) this.err(node, `cubic-bezier(${value}) - all four control values must be numbers`);
    return cubicBezierEasing(x1, y1, x2, y2);
}

// <animate type="offset|size|alpha|color|clip|uv|flip_book|wait" .../> - a
// general escape hatch onto Bedrock's FULL native animations schema
// (confirmed against bedrock-wiki's json-ui-documentation.md), for anything
// the fade-in/slide-from/pulse CSS sugar above doesn't cover: other
// anim_types (size/color/clip/uv/flip_book), explicit trigger events
// (play_event/start_event/end_event/reset_event - not just "on control
// creation"), chaining via next, and the flip_book-specific fields
// (fps/frame_count/frame_step/initial_uv). from/to/initial_uv accept a JSON
// literal (a number, or "[x,y]") since the underlying field can be a scalar
// (alpha) or a vector (offset/size/uv). easing="cubic-bezier(x1,y1,x2,y2)"
// is a custom curve (see bakeCurveChain above) instead of a native easing
// keyword; any other easing string is validated against the real native
// enum so a typo fails loudly at compile time instead of shipping
// silently-broken JSON.
function registerAnimation(node) {
    const e = m => this.err(node, m);
    const a = node.attrs;
    if (!a.type) e(`<animate> needs type="alpha|clip|color|flip_book|offset|size|uv|wait|aseprite_flip_book"`);
    const def = { anim_type: a.type };
    const jsonAttr = (attr, field = attr) => { if (a[attr] !== undefined) { try { def[field] = JSON.parse(a[attr]); } catch { e(`<animate ${attr}="${a[attr]}"> must be valid JSON (a number, a string in quotes, or e.g. "[x,y]")`); } } };
    if (a.duration !== undefined) def.duration = parseFloat(a.duration);
    jsonAttr("from"); jsonAttr("to"); jsonAttr("initial_uv");
    if (a.next !== undefined) def.next = a.next.startsWith("@") ? a.next : `@${this.ns}.${a.next}`;
    for (const ev of ["play_event", "start_event", "end_event", "reset_event"]) if (a[ev] !== undefined) def[ev] = a[ev];
    for (const flag of ["reversible", "resettable", "scale_from_starting_alpha", "activated"]) if (a[flag] !== undefined) def[flag] = a[flag] === "true";
    if (a.fps !== undefined) def.fps = parseInt(a.fps, 10);
    if (a.frame_count !== undefined) def.frame_count = parseInt(a.frame_count, 10);
    if (a.frame_step !== undefined) def.frame_step = parseFloat(a.frame_step);
    if (a.destroy_at_end !== undefined) def.destroy_at_end = a.destroy_at_end;

    const bezier = a.easing !== undefined ? this.parseCubicBezier(a.easing, node) : null;
    if (bezier) {
        if (def.from === undefined || def.to === undefined) e(`<animate easing="cubic-bezier(...)"> needs both from= and to= (a custom curve is baked between two known values)`);
        if (def.duration === undefined) e(`<animate easing="cubic-bezier(...)"> needs duration=`);
        const { from, to, duration, next, ...rest } = def;
        const leadingAttrs = {}, trailingAttrs = {};
        for (const k of ["play_event", "start_event"]) if (k in rest) { leadingAttrs[k] = rest[k]; delete rest[k]; }
        for (const k of ["end_event", "reset_event", "destroy_at_end"]) if (k in rest) { trailingAttrs[k] = rest[k]; delete rest[k]; }
        if (next !== undefined) trailingAttrs.next = next;
        return this.bakeCurveChain({ anim_type: a.type, from, to, duration, sampleFn: bezier, steps: a.steps ? parseInt(a.steps, 10) : 12, leadingAttrs, trailingAttrs });
    }
    if (a.easing !== undefined) {
        if (!NATIVE_EASINGS.has(a.easing)) e(`<animate easing="${a.easing}"> isn't a real Bedrock easing value, and isn't cubic-bezier(x1,y1,x2,y2) either - valid native values: ${[...NATIVE_EASINGS].join(", ")}`);
        def.easing = a.easing;
    }
    return this.anim(def);
}

// <keyframes property="offset" duration="0.6" [loop="true"] [curve="catmull-rom"] [steps="16"]>
//   <key at="0" value="[0,0]"/>
//   <key at="0.5" value="[10,-20]" easing="out_bounce"/>
//   <key at="1" value="[0,0]" easing="in_quad"/>
// </keyframes>
// Real multi-waypoint keyframing (After Effects/Blender/CSS @keyframes-
// style), built entirely on the native two-point anim_type + `next`
// chaining primitive - there is no native single-definition multi-keyframe
// mechanism, so this compiles to one real chained native animation PER
// segment between adjacent keys. Each <key>'s own `easing` (native name or
// cubic-bezier(...), same rules as <animate>) governs the segment LEADING
// INTO that key - the first <key> (at="0") never needs its own easing,
// since nothing animates into it.
//
// curve="catmull-rom" is a different mode entirely: instead of pairwise
// eased segments between keys, the whole VALUE path is a smooth spline
// through every key's value (see lib/easing.js's catmullRom - the curve
// passes exactly through each key, unlike chaining plain linear/eased
// segments between them), sampled into `steps` tiny linear segments.
// Per-key `easing` is ignored in this mode - the curve shape IS the easing.
function keyframesEl(node) {
    const e = m => this.err(node, m);
    const a = node.attrs;
    if (!a.property) e(`<keyframes> needs property="offset|size|alpha|color|clip|uv"`);
    const duration = parseFloat(a.duration);
    if (!(duration > 0)) e(`<keyframes> needs duration="seconds" (a positive number)`);
    const keys = node.children.filter(c => c.tag === "key").map(k => {
        if (k.attrs.at === undefined) this.err(k, `<key> needs at="0..1"`);
        if (k.attrs.value === undefined) this.err(k, `<key> needs value="..."`);
        const at = parseFloat(k.attrs.at);
        if (!(at >= 0 && at <= 1)) this.err(k, `<key at="${k.attrs.at}"> must be between 0 and 1`);
        let value;
        try { value = JSON.parse(k.attrs.value); } catch { this.err(k, `<key value="${k.attrs.value}"> must be valid JSON (a number, or e.g. "[x,y]")`); }
        return { at, value, easing: k.attrs.easing };
    }).sort((x, y) => x.at - y.at);
    if (keys.length < 2) e(`<keyframes> needs at least 2 <key> children`);
    if (keys[0].at !== 0) e(`<keyframes> - the first <key> must be at="0"`);
    if (keys[keys.length - 1].at !== 1) e(`<keyframes> - the last <key> must be at="1"`);

    if (a.curve === "catmull-rom") {
        const steps = a.steps ? parseInt(a.steps, 10) : 16;
        const points = keys.map(k => (Array.isArray(k.value) ? k.value : [k.value]));
        const samples = sampleCurve(t => catmullRom(points, t), steps).map(p => (Array.isArray(keys[0].value) ? p : p[0]));
        let nextRef, lastSegRef;
        for (let i = steps; i >= 1; i--) {
            const def = { anim_type: a.property, easing: "linear", duration: duration / steps, from: samples[i - 1], to: samples[i] };
            if (nextRef) def.next = nextRef;
            nextRef = this.anim(def);
            if (i === steps) lastSegRef = nextRef; // the final segment, built first in this backward loop
        }
        // nextRef now holds the FIRST segment's ref (loop finished at i=1) - looping means the
        // final segment (lastSegRef) should point back to it, patched directly on the stored def
        // since this.anim() only ever returns a ref string, not the def object itself.
        if (a.loop === "true") this.defs[lastSegRef.split(".")[1]].next = nextRef;
        return nextRef;
    }

    let ref, lastSegRef;
    for (let i = keys.length - 2; i >= 0; i--) {
        const seg = keys[i + 1];
        const bezier = seg.easing !== undefined ? this.parseCubicBezier(seg.easing, node) : null;
        let segRef;
        if (bezier) {
            segRef = this.bakeCurveChain({
                anim_type: a.property, from: keys[i].value, to: seg.value,
                duration: duration * (seg.at - keys[i].at), sampleFn: bezier,
                steps: a.steps ? parseInt(a.steps, 10) : 12,
                trailingAttrs: ref ? { next: ref } : {},
            });
        } else {
            if (seg.easing !== undefined && !NATIVE_EASINGS.has(seg.easing)) e(`<key easing="${seg.easing}"> isn't a real Bedrock easing value, and isn't cubic-bezier(x1,y1,x2,y2) either`);
            const def = { anim_type: a.property, easing: seg.easing ?? "linear", duration: duration * (seg.at - keys[i].at), from: keys[i].value, to: seg.value };
            if (ref) def.next = ref;
            segRef = this.anim(def);
        }
        if (i === keys.length - 2) lastSegRef = segRef; // the final segment, built first in this backward loop
        ref = segRef;
    }
    // ref now holds the FIRST segment's ref (loop finished at i=0). A bezier-baked last segment's
    // OWN chain already ends on a real def with no next (bakeCurveChain's default) - patch that
    // def directly the same way the catmull-rom branch does, since a baked chain's public "ref"
    // is its first segment, not its last.
    if (a.loop === "true") {
        const lastDefKey = lastSegRef.startsWith(`@${this.ns}.`) ? lastSegRef.slice(this.ns.length + 2) : lastSegRef;
        // Walk the bezier-baked chain (if any) to its true final def before patching `next`.
        let key = lastDefKey;
        while (this.defs[key]?.next) key = this.defs[key].next.slice(this.ns.length + 2);
        this.defs[key].next = ref;
    }
    return ref;
}

module.exports = { anim, animate, lerpValue, bakeCurveChain, parseCubicBezier, registerAnimation, keyframesEl };
