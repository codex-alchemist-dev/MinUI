// ScreenCompiler's complex, self-contained custom elements (<switch>,
// <tabs>, <skilltree>) - extracted verbatim from lib/compile.js into their
// own module per the project's standing modularity rule. Mixed onto
// ScreenCompiler.prototype (see the bottom of lib/compile.js) - same
// `this`, same shared per-compilation state, zero behavior change from
// before this extraction.
"use strict";

const { parseTemplate, isStaticTemplate } = require("../markup.js");
const { hexColor, sizeValue } = require("./styleValues.js");

// <switch on="c.rarity"><case value="legendary">...</case>
//   <case value="rare">...</case><default>...</default></switch> - pure
// sugar over the existing if="" gating mechanism (no new runtime concept):
// each <case> becomes an if=""-gated wrapper comparing `on` against its
// value with ==, <default> (at most one) gets the negation of every case
// condition ANDed together. A value that parses as a plain number compares
// numerically; anything else compares as a quoted string - matches how most
// template languages "just work" for both `on="c.level"` and `on="c.rarity"`
// without the author having to say which.
function switchEl(node, loops) {
    const e = m => this.err(node, m);
    const onAttr = node.attrs.on;
    if (!onAttr) e(`<switch> needs on="expression"`);
    const literal = v => (/^-?\d+(\.\d+)?$/.test(v) ? v : JSON.stringify(v));
    const cases = node.children.filter(c => c.tag === "case");
    const defaults = node.children.filter(c => c.tag === "default");
    const others = node.children.filter(c => c.tag !== "case" && c.tag !== "default" && c.tag !== undefined);
    if (defaults.length > 1) e(`<switch> can have at most one <default>`);
    if (others.length) e(`<switch> may only contain <case>/<default>, got <${others[0].tag}>`);
    for (const c of cases) if (c.attrs.value === undefined) this.err(c, `<case> needs value="..."`);
    if (!cases.length && !defaults.length) e(`<switch> needs at least one <case> or a <default>`);

    const negations = cases.map(c => `!((${onAttr}) == ${literal(String(c.attrs.value))})`);
    const wrapped = cases.map(c => ({ tag: "column", attrs: { if: `(${onAttr}) == ${literal(String(c.attrs.value))}` }, children: c.children, line: c.line }));
    if (defaults.length) {
        wrapped.push({ tag: "column", attrs: negations.length ? { if: negations.join(" && ") } : {}, children: defaults[0].children, line: defaults[0].line });
    }
    const synthetic = { tag: "panel", attrs: node.attrs.style ? { style: node.attrs.style } : {}, children: wrapped, line: node.line };
    return this.emit(synthetic, loops);
}

// <tabs default="id"><tab id="..." label="..."> body </tab>...</tabs> - real
// client-side tab switching, the DOCUMENTED way (wiki.bedrock.dev's
// json-ui-documentation lists a legacy "tab" element explicitly superseded
// by toggles - this isn't a workaround, it's the intended mechanism).
//
// The toggle is built BY HAND as a raw type:"toggle" - never by extending a
// vanilla factory template (common_toggles.light_text_toggle et al). Two
// earlier attempts through that template both shipped visibly broken
// (everything showing at once, clicks doing nothing). Cross-checking
// bedrock-core/ui's own compiler source
// (packages/ui-compiler/src/faces/utils/swap.ts, the function backing their
// own <Tabs>) explains why a hand-built toggle needs ALL of the following,
// verbatim, or it "draws but never takes a press" (their own comment -
// confirmed as our exact symptom on the third attempt too, where the
// toggle's own look DID start responding to clicks once these were added,
// but nothing was reading its state correctly yet):
//   - all 8 state-slot properties (checked_control/unchecked_control/etc.)
//     with all 8 correspondingly-named child controls actually defined - a
//     state left undefined is a control that vanishes the moment the
//     pointer touches it.
//   - toggle_on_button/toggle_off_button + the specific button_mappings
//     below.
//
// A tab's BODY lives inside its own toggle's checked_control (and the
// three other checked-family states), not as a separate control read from
// outside via source_control_name. This matters: bedrock-core's own swap()
// (backing <Tabs>) never exposes #toggle_state externally at all - no
// property_bag, no binding for it - because content nested inside a look
// never needs to observe state to react to it. Their separate
// shownWhileOn() (backing <Disclosure>, a different component with a
// different toggle underneath) is the one that reads #toggle_state from
// outside - borrowing that shape for <Tabs> was the third attempt's
// mistake: the toggle over there never publishes what this compiler was
// trying to read. This build copies swap()'s actual approach for <Tabs>,
// not Disclosure's.
//
// Nesting means a small (tabW x tabH) toggle needs a child positioned
// OUTSIDE its own bounds to reach the content area below the bar - a plain
// anchor/offset child, never clipped unless clips_children is set (not set
// here). Because that child's percentage sizing would otherwise resolve
// against the tiny toggle instead of the real content width, <tabs>
// requires a literal pixel width (this.err()s otherwise, matching gated()'s
// own established discipline for exactly this class of problem). The body
// is compiled ONCE per tab into this.defs and referenced by name from all 4
// checked-family states, so its cost is the same as if it lived in one
// place - matching how <scroll> already reuses stored content by name
// instead of duplicating it.
function tabsEl(node, loops) {
    const e = m => this.err(node, m);
    if (!this.pressAllowed()) e("<tabs> isn't possible on a HUD (the HUD never takes clicks)");
    const tabNodes = node.children.filter(c => c.tag === "tab");
    if (!tabNodes.length) e(`<tabs> needs at least one <tab id="..." label="...">`);
    for (const t of tabNodes) {
        if (t.text !== undefined) this.err(t, `stray text in <tabs> - only <tab> belongs directly inside <tabs>`);
        if (t.tag !== "tab") this.err(t, `<tabs> may only contain <tab>, not <${t.tag}>`);
        if (!t.attrs.id) this.err(t, `<tab> needs id="..."`);
        if (!t.attrs.label) this.err(t, `<tab id="${t.attrs.id}"> needs label="..."`);
    }
    const defaultId = node.attrs.default ?? tabNodes[0].attrs.id;
    if (!tabNodes.some(t => t.attrs.id === defaultId)) e(`<tabs default="${defaultId}"> - no <tab id="${defaultId}">`);

    const barSt = this.style(node);
    const outerPlace = this.placement(barSt, node);
    const [outerW] = outerPlace.size;
    if (typeof outerW !== "number") e(`<tabs style="width: ..."> must be a plain pixel number (it's "${outerW}") - a tab's body is a child of its own small toggle button, positioned to reach the content area below, and needs a real pixel width to size against instead of its tiny parent's`);
    const tabW = barSt["tab-width"] ? parseFloat(barSt["tab-width"]) : 54;
    const tabH = barSt["tab-height"] ? parseFloat(barSt["tab-height"]) : 16;
    const gap = barSt.gap ? parseFloat(barSt.gap) : 3;
    const groupName = this.name("tabgroup");
    const toggleKeys = tabNodes.map(t => this.name(`tabtoggle_${t.attrs.id}`));

    const BUTTON_MAPPINGS = [
        { from_button_id: "button.menu_select", to_button_id: "button.menu_select", mapping_type: "pressed" },
        { from_button_id: "button.menu_ok", to_button_id: "button.menu_ok", mapping_type: "focused" },
    ];
    const LOOK_CONTROLS = {
        checked_control: "checked", unchecked_control: "unchecked",
        checked_hover_control: "checked_hover", unchecked_hover_control: "unchecked_hover",
        checked_locked_control: "checked_locked", unchecked_locked_control: "unchecked_locked",
        checked_locked_hover_control: "checked_locked_hover", unchecked_locked_hover_control: "unchecked_locked_hover",
    };

    const flat = [];
    tabNodes.forEach((t, i) => {
        const isDefault = t.attrs.id === defaultId;
        const x = i * (tabW + gap);
        const place = { anchor_from: "top_left", anchor_to: "top_left", offset: [x, 0], size: [tabW, tabH] };

        // A tab label isn't a form field (nothing here rides the form
        // collection at all) so it can't go through the usual {t:key} ->
        // RawMessage/override pipeline. {t:key} with no arguments is
        // special-cased to the bare key string, which the CLIENT resolves
        // on its own from the resource pack's own texts/<lang>.lang -
        // follows the game's language automatically, but misses a player's
        // in-game language override, since there's no server round trip
        // left to resolve it through.
        const labelParts = parseTemplate(String(t.attrs.label), this.file, t.line);
        let text, localize;
        if (labelParts.length === 1 && labelParts[0][0] === "t" && labelParts[0][2].length === 0) {
            text = labelParts[0][1];
            localize = true;
        } else if (isStaticTemplate(labelParts)) {
            text = labelParts.map(p => p[1]).join("");
            localize = false;
        } else {
            e(`<tab label="${t.attrs.label}"> must be plain text or {t:key} (no {data} - the tab list itself never changes)`);
        }

        // The body: compiled once, stored under this screen's namespace,
        // referenced by name (not duplicated) from every checked-family
        // state below - the "@namespace.name" extend syntax this compiler
        // already uses for <scroll>'s own stored content.
        const bodySt = this.style(t);
        const bodyHeight = bodySt.height ? sizeValue(bodySt.height, e) : "100%c";
        const body = this.container(t, bodySt, loops, { type: "stack_panel", orientation: "vertical" },
            this.withGap(this.children(t, loops, "vertical"), bodySt.gap ? parseFloat(bodySt.gap) : 0, false));
        const bodyDefName = this.name(`tabbody_${t.attrs.id}`);
        this.defs[`${this.key}_${bodyDefName}`] = {
            type: "panel",
            anchor_from: "top_left", anchor_to: "top_left",
            offset: [-x, tabH + 2], // cancels this toggle's own x offset - lands at (0, tabH+2) in the outer <tabs> panel regardless of which tab's toggle this is nested inside
            size: [outerW, bodyHeight],
            controls: [{ inner: body }],
        };
        const bodyRef = { [`${this.name("body")}@${this.ns}.${this.key}_${bodyDefName}`]: {} };

        const look = (active) => ({
            type: "panel", size: ["100%", "100%"],
            controls: [
                { bg: { type: "image", size: ["100%", "100%"], texture: active ? (barSt["tab-active-background"] ?? barSt.background ?? "textures/ui/button_borderless_light") : (barSt.background ?? "textures/ui/button_borderless_light"), nineslice_size: 3 } },
                // A label filling the tab's full height top-aligns its one
                // line of text, reading as "too high" in a 16px-tall tab
                // (the same top-alignment issue fixed for the skill/quest
                // badges in Claude Waifus' profile.ui.html) - so this sizes
                // the label to its own natural line height and anchors it
                // to the tab's vertical middle instead of filling and
                // relying on (nonexistent) vertical text-alignment.
                { txt: { type: "label", size: ["100%", 9], anchor_from: "left_middle", anchor_to: "left_middle", layer: 2, text, localize, font_size: "normal", font_scale_factor: 0.85, shadow: false, text_alignment: "center", color: hexColor(barSt[active ? "tab-active-color" : "tab-color"] ?? (active ? "#1c1a26" : "#c8ccec"), e) } },
                ...(active ? [bodyRef] : []),
            ],
        });
        const activeLook = look(true), inactiveLook = look(false);

        flat.push({
            [toggleKeys[i]]: {
                type: "toggle", ...place,
                sound_name: "random.click", sound_volume: 1.0, sound_pitch: 1.0,
                focus_enabled: true, focus_magnet_enabled: true, default_focus_precedence: 0,
                toggle_name: groupName,
                toggle_default_state: isDefault,
                radio_toggle_group: true,
                toggle_group_forced_index: i,
                toggle_group_default_selected: 0,
                enable_directional_toggling: false,
                toggle_on_button: "toggle.toggle_on",
                toggle_off_button: "toggle.toggle_off",
                button_mappings: BUTTON_MAPPINGS,
                ...LOOK_CONTROLS,
                controls: [
                    { checked: activeLook }, { checked_hover: activeLook }, { checked_locked: activeLook }, { checked_locked_hover: activeLook },
                    { unchecked: inactiveLook }, { unchecked_hover: inactiveLook }, { unchecked_locked: inactiveLook }, { unchecked_locked_hover: inactiveLook },
                ],
            },
        });
    });

    return [[this.name("tabs"), { type: "panel", size: outerPlace.size, controls: flat }]];
}

// <skilltree><node id="..." col="0" row="0" requires="id1,id2">...</node>...</skilltree> -
// a branching, PAYDAY2-style skill tree: nodes hand-placed on a fixed grid,
// connected to their prerequisites by elbow connector lines.
//
// Layout is intentionally STATIC, like <tabs>'s own <tab> children: a real
// tree's shape (which nodes exist, where, and what unlocks what) never
// changes at runtime, only each node's OWNED/LOCKED/READY look does - so
// <node> is authored directly in markup (one tag per node, however many a
// tree needs), never each=""-looped. This sidesteps a real conflict: an
// each=""-driven node's col/row would only be known at RUNTIME, but
// connector geometry (where to draw each line, how long, whether it needs
// to jog sideways) has to be computed at COMPILE TIME to become plain
// positioned <image> bars - JSON UI has no runtime-computed line/rotation
// primitive to fall back on (the same wall that ruled out a literal
// diagonal connector: plain images can't rotate in JSON UI, so a
// cross-column edge is drawn as a 3-segment vertical-horizontal-vertical
// "stair" instead of a straight diagonal).
//
// A <node>'s own INSIDE is completely ordinary markup - a <button> for
// click-to-unlock, if=""-gated <panel>/<text> badges for its owned/locked/
// ready look - reusing the exact pattern already proven for the profile
// screen's skill tree row, not a new state system. <skilltree> only ever
// decides WHERE a node sits and draws the lines between them.
//
// The whole grid is wrapped in the same common.scrolling_panel factory
// <scroll> already uses (vertical only, per the project's own decision
// that free 2D panning isn't worth the added input complexity across
// PC/mobile/controller) - a tree taller than its viewport scrolls.
function skilltreeEl(node, loops) {
    const e = m => this.err(node, m);
    const st = this.style(node);
    const cellW = st["col-width"] ? parseFloat(st["col-width"]) : 70;
    const cellH = st["row-height"] ? parseFloat(st["row-height"]) : 48;
    const nodeW = st["node-width"] ? parseFloat(st["node-width"]) : 60;
    const nodeH = st["node-height"] ? parseFloat(st["node-height"]) : 36;
    const lineW = st["line-width"] ? parseFloat(st["line-width"]) : 2;
    const lineColor = hexColor(st["line-color"] ?? "#4a4d68", e);

    const nodeNodes = node.children.filter(c => c.tag === "node");
    if (!nodeNodes.length) e(`<skilltree> needs at least one <node id="..." col="N" row="N">`);
    const byId = new Map();
    for (const n of nodeNodes) {
        if (n.tag !== "node") this.err(n, `<skilltree> may only contain <node>, not <${n.tag}>`);
        if (!n.attrs.id) this.err(n, `<node> needs id="..."`);
        if (byId.has(n.attrs.id)) this.err(n, `<node id="${n.attrs.id}"> - duplicate id in this <skilltree>`);
        const col = parseInt(n.attrs.col ?? "", 10);
        const row = parseInt(n.attrs.row ?? "", 10);
        if (!(Number.isInteger(col) && col >= 0)) this.err(n, `<node id="${n.attrs.id}"> needs col="0" (or higher) - a whole-number column index`);
        if (!(Number.isInteger(row) && row >= 0)) this.err(n, `<node id="${n.attrs.id}"> needs row="0" (or higher) - a whole-number row index`);
        byId.set(n.attrs.id, { node: n, col, row });
    }

    let maxCol = 0, maxRow = 0;
    for (const { col, row } of byId.values()) { maxCol = Math.max(maxCol, col); maxRow = Math.max(maxRow, row); }
    const cellCenterX = col => col * cellW + cellW / 2;
    const cellTopY = row => row * cellH + (cellH - nodeH) / 2;
    const seg = (x, y, w, h) => ({ [this.name("line")]: { type: "image", texture: "textures/ui/White", color: lineColor, anchor_from: "top_left", anchor_to: "top_left", offset: [x, y], size: [w, h] } });

    const controls = [];
    // Connectors first, so nodes draw on top of the lines feeding into them.
    for (const [id, { node: n, col, row }] of byId) {
        const reqs = String(n.attrs.requires ?? "").split(",").map(s => s.trim()).filter(Boolean);
        for (const reqId of reqs) {
            const parent = byId.get(reqId);
            if (!parent) this.err(n, `<node id="${id}" requires="${reqId}"> - no <node id="${reqId}"> in this <skilltree>`);
            const px = cellCenterX(parent.col), py = cellTopY(parent.row) + nodeH;
            const cx = cellCenterX(col), cy = cellTopY(row);
            if (parent.col === col) {
                controls.push(seg(px - lineW / 2, py, lineW, cy - py));
            } else {
                const midY = py + (cy - py) / 2;
                controls.push(seg(px - lineW / 2, py, lineW, midY - py));
                controls.push(seg(Math.min(px, cx), midY - lineW / 2, Math.abs(cx - px) + lineW, lineW));
                controls.push(seg(cx - lineW / 2, midY, lineW, cy - midY));
            }
        }
    }
    // Nodes on top of their own incoming connectors.
    for (const [id, { node: n, col, row }] of byId) {
        const inner = this.container(n, this.style(n), loops, { type: "panel" }, this.children(n, loops).map(([nm, c]) => ({ [nm]: c })));
        controls.push({
            [this.name(`node_${id}`)]: {
                ...inner, anchor_from: "top_left", anchor_to: "top_left",
                offset: [cellCenterX(col) - nodeW / 2, cellTopY(row)], size: [nodeW, nodeH],
            },
        });
    }

    const defName = this.name("skilltree_");
    this.defs[`${this.key}_${defName}`] = {
        type: "panel", anchor_from: "top_left", anchor_to: "top_left",
        size: [(maxCol + 1) * cellW, (maxRow + 1) * cellH], controls,
    };
    const place = this.placement(st, node);
    return [[this.name("skilltree"), {
        type: "panel", ...place,
        controls: [{
            [`${this.name("scroll_")}@common.scrolling_panel`]: {
                anchor_to: "top_left", anchor_from: "top_left",
                $show_background: false,
                size: ["100%", "100%"],
                $scrolling_content: `${this.ns}.${this.key}_${defName}`,
                $scroll_size: [5, "100% - 4px"],
                $scrolling_pane_size: ["100% - 4px", "100% - 2px"],
                $scrolling_pane_offset: [2, 0],
                $scroll_bar_right_padding_size: [0, 0],
            },
        }],
    }]];
}

module.exports = { switchEl, tabsEl, skilltreeEl };
