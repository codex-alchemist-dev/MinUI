// <slotbuttons> - frames the marker items of runtime/slotButtons.js as buttons in the player's inventory screen.
//
//   <slotbuttons screen="inventory" frame="textures/ui/highlight_slot" tint="#ffd24a"/>
//
// A slot button is a locked item whose name carries an invisible sentinel (slotButtonsCore.cjs NAME_SENTINEL). This emits a
// native `modifications` patch of vanilla's `common.inventory_panel` (the player's 9x3 inventory grid used by the inventory
// screen and every container screen) that inserts one frame overlay per inventory slot. Each overlay reads its own slot
// (collection_name + collection_index), and is visible only while that slot's item name contains the sentinel - so on a
// normal inventory nothing shows, and a button slot gets a frame drawn over its icon.
//
// Attributes: screen (only "inventory"), first (collection index of the first cell, default 9), count (cells, default 27),
// cols (default 9), cell (cell size, default 18), frame (texture), tint (#rrggbb), layer (default 10).
//
// Honest limits: the classic (desktop / large-screen) inventory layout only - the pocket layout scrolls its grid and has
// different cell sizes, so there the buttons still work but are not framed. Whether `first` is 9 (inventory_items indexes
// are the real slot numbers) or 0 is the one thing to confirm in-game: set `first="0"` if the frames land on the wrong cells.
"use strict";

const { insertBack, patchFile } = require("../vanillaPatch.js");
const { UiSyntaxError } = require("../markup.js");
const { NAME_SENTINEL } = require("../../runtime/slotButtonsCore.cjs");

const GRID = { size: [162, 54], offset: [0, -26] };   // vanilla common.inventory_panel > inventory_grid

function hexColor(hex, fail) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) fail(`tint must be #rrggbb (got "${hex}")`);
    return [0, 2, 4].map(i => Math.round(parseInt(m[1].slice(i, i + 2), 16) / 255 * 1000) / 1000);
}

/**
 * @param {{attrs: object, line: number}} node the <slotbuttons> node
 * @param {string} file for error messages
 * @returns {object} the patch document for ui/ui_common.json
 */
function compileSlotButtons(node, file) {
    const a = node.attrs ?? {};
    const fail = msg => { throw new UiSyntaxError(file, node.line, `<slotbuttons> ${msg}`); };
    const screen = String(a.screen ?? "inventory");
    if (screen !== "inventory") fail(`screen "${screen}" is not supported (only "inventory")`);
    const num = (name, fallback, min) => {
        const v = a[name] === undefined ? fallback : Number(a[name]);
        if (!Number.isInteger(v) || v < min) fail(`${name} must be a whole number >= ${min}`);
        return v;
    };
    const first = num("first", 9, 0), count = num("count", 27, 1), cols = num("cols", 9, 1), cell = num("cell", 18, 1), layer = num("layer", 10, 0);
    if (count > 36) fail("count cannot exceed the 36 inventory slots");
    const frame = String(a.frame ?? "textures/ui/highlight_slot");
    if (!/^textures\/[\w\/.-]+$/.test(frame)) fail(`frame "${frame}" must be a texture path like textures/ui/highlight_slot`);
    const color = a.tint ? hexColor(String(a.tint), fail) : undefined;

    const cells = [];
    for (let k = 0; k < count; k++) {
        cells.push({
            [`oc_sb_${first + k}`]: {
                type: "image",
                texture: frame,
                size: [cell, cell],
                anchor_from: "top_left",
                anchor_to: "top_left",
                offset: [(k % cols) * cell, Math.floor(k / cols) * cell],
                layer,
                ...(color ? { color } : {}),
                collection_name: "inventory_items",
                collection_index: first + k,
                bindings: [
                    { binding_name: "#item_name", binding_type: "collection", binding_collection_name: "inventory_items" },
                    { binding_type: "view", source_property_name: `(not ((#item_name - '${NAME_SENTINEL}') = #item_name))`, target_property_name: "#visible" },
                ],
            },
        });
    }
    const host = {
        oc_slot_buttons: {
            type: "panel",
            size: GRID.size,
            anchor_from: "bottom_middle",
            anchor_to: "bottom_middle",
            offset: GRID.offset,
            layer,
            controls: cells,
        },
    };
    return patchFile("common", { inventory_panel: [insertBack("controls", [host])] });
}

module.exports = { compileSlotButtons };
