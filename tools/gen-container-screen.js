#!/usr/bin/env node
// Generates rp/ui/horse_screen.json - a full, unconditional replacement of
// horse_screen.json's real content. Not part of the normal build; run by
// hand (`node tools/gen-container-screen.js`) whenever the layout needs
// regenerating, and the OUTPUT file is what actually ships.
//
// Findings so far, kept for the record:
//   1. Hand-placed standalone common.container_item cells crashed on
//      select - fixed by adding "$item_collection_name": "container_items"
//      (required by the game's Bundle-interaction system).
//   2. collection_index does NOT offset a grid bound to "container_items" -
//      every grid sharing that collection always starts at index 0 and
//      mirrors, confirmed four separate ways. No property offsets a
//      container_items grid's starting index.
//   3. A single real native type:"grid" at 90 slots worked correctly for
//      exactly its first 30 slots - container_type "horse" has a real,
//      undocumented client-side interaction ceiling there, matching AC's
//      own real production inventory_size (30) exactly.
//   4. Furnace/brewing/anvil/etc's real per-slot collections
//      (furnace_ingredient_items, etc.) are each their own uniquely-named,
//      single-slot collection tied to real crafting logic - doesn't
//      generalize to arbitrary made-up names (those crash on select).
//   5. minecraft:equippable's "horse_equip_items" collection is different
//      from all of the above: indices 2+ are genuinely independent,
//      single-item slots (confirmed via simultaneous distinct items sitting
//      in different indices without mirroring) - the first real, non-fake,
//      non-mirrored multi-slot mechanism found all session. Indices 0/1
//      are natively special-cased (validate only against the literal
//      "item" field, ignore accepted_items; index 1 additionally refuses
//      to accept from a held stack, single non-stacked items only).
//      Stacking beyond 1 item per slot is not possible in this collection
//      at all (confirmed: neither accepted_items nor an item's own
//      max_stack_size/format_version unlocks it).
//
// THIS ATTEMPT: testing whether "horse_equip_items" - unlike
// "container_items" - actually DOES respect collection_index as a grid
// offset. Vanilla's own stock equip_panel (equip_grid + saddle/armor ghost
// icons) is dropped entirely in favor of two custom grids we fully control:
//   - equip_narrow: 1x5, collection_index 1 (skips slot 0/saddle)
//   - equip_wide: 9x2 (18 slots), collection_index 6
// If collection_index works here, these are two disjoint, real, independent
// slot ranges. If it doesn't (same as container_items), both will just
// mirror index 0 onward - worth finding out either way.
//
// Two hard constraints from earlier attempts still apply: container_type
// is a fixed 7-value enum with no "use my own screen" option, and
// per-instance content swapping is confirmed impossible - so this still
// replaces horse_screen.json unconditionally, for every container_type
// "horse" entity including real horses/donkeys/mules/llamas.
"use strict";
const fs = require("fs");
const path = require("path");

const CELL = 18; // vanilla's own slot pixel size
const GAP = 10;  // visible daylight between the three grids
const START_X = 79, START_Y = 18; // clears equip_panel/horse_renderer to the left

// container_items sections (the main bulk-storage grids).
const SECTIONS = [
    ["B", 9, 10],   // 9x10 = 90, container_items
    ["C", 9, 3],    // 9x3 = 27, container_items
];

// horse_equip_items sections - each an independent test of collection_index
// as a grid offset. [label, columns, rows, startIndex]
const EQUIP_SECTIONS = [
    ["narrow", 1, 5, 1],   // skips slot 0 (saddle), shows indices 1-5
    ["wide", 9, 2, 6],     // shows indices 6-23
];

const doc = {
    namespace: "horse",

    // Shared item template for the container_items sections.
    "oc_grid_item@common.container_item": { "$item_collection_name": "container_items" },
    // Separate template for horse_equip_items sections.
    "oc_grid_item_equip@common.container_item": { "$item_collection_name": "horse_equip_items" },

    oc_panel: {
        type: "panel",
        controls: [
            { "container_gamepad_helpers@common.container_gamepad_helpers": {} },
            { "selected_item_details_factory@common.selected_item_details_factory": {} },
            { "item_lock_notification_factory@common.item_lock_notification_factory": {} },
            {
                "root_panel@common.root_panel": {
                    size: [panelWidth(), rootHeight()],
                    layer: 1,
                    controls: [
                        { "common_panel@common.common_panel": { size: [panelWidth(), rootHeight()] } },
                        { "horse_section_label@horse.horse_label": {} },
                        { "renderer@horse.horse_renderer": { offset: [7, 18] } },
                        ...equipGridControls(),
                        ...gridControls(),
                        { "inventory_panel_bottom_half_with_label@common.inventory_panel_bottom_half_with_label": { offset: [0, bottomHalfY()] } },
                        { "hotbar_grid_template@common.hotbar_grid_template": {} },
                        { "inventory_selected_icon_button@common.inventory_selected_icon_button": {} },
                        { "gamepad_cursor@common.gamepad_cursor_button": {} },
                    ],
                },
            },
            { "flying_item_renderer@common.flying_item_renderer": { layer: 10 } },
        ],
    },

    "horse_screen@common.inventory_screen_common": {
        "$close_on_player_hurt|default": false,
        close_on_player_hurt: "$close_on_player_hurt",
        variables: [
            { requires: "true", "$screen_content": "horse.oc_panel" },
        ],
    },
};

// Narrow equip column sits where vanilla's equip_panel used to (x=7), next
// to the horse renderer (x=25-79, 54 wide) - container_items grids start
// right after both, at START_X.
function equipGridControls() {
    const out = [];
    let y = START_Y;
    // narrow column, to the left of the renderer
    const [, ncols, nrows, nstart] = EQUIP_SECTIONS[0];
    out.push({
        grid_equip_narrow: {
            type: "grid",
            anchor_from: "top_left", anchor_to: "top_left",
            size: [ncols * CELL, nrows * CELL],
            offset: [79 - ncols * CELL - GAP, START_Y],
            grid_dimensions: [ncols, nrows],
            grid_item_template: "horse.oc_grid_item_equip",
            collection_name: "horse_equip_items",
            collection_index: nstart,
        },
    });
    // wide row, full width, below the container_items grids
    const [, wcols, wrows, wstart] = EQUIP_SECTIONS[1];
    const gridsBottom = START_Y + Math.max(...SECTIONS.map(([, , rows]) => rows * CELL));
    out.push({
        grid_equip_wide: {
            type: "grid",
            anchor_from: "top_left", anchor_to: "top_left",
            size: [wcols * CELL, wrows * CELL],
            offset: [START_X, gridsBottom + GAP],
            grid_dimensions: [wcols, wrows],
            grid_item_template: "horse.oc_grid_item_equip",
            collection_name: "horse_equip_items",
            collection_index: wstart,
        },
    });
    return out;
}
function gridControls() {
    let x = START_X;
    const out = [];
    for (const [label, cols, rows] of SECTIONS) {
        out.push({
            [`grid_${label}`]: {
                type: "grid",
                anchor_from: "top_left", anchor_to: "top_left",
                size: [cols * CELL, rows * CELL],
                offset: [x, START_Y],
                grid_dimensions: [cols, rows],
                grid_item_template: "horse.oc_grid_item",
                collection_name: "container_items",
            },
        });
        x += cols * CELL + GAP;
    }
    return out;
}
function panelWidth() {
    return SECTIONS.reduce((acc, [, cols]) => acc + cols * CELL + GAP, START_X) - GAP + 7;
}
function bottomHalfY() {
    const gridsHeight = Math.max(...SECTIONS.map(([, , rows]) => rows * CELL));
    const [, , wrows] = EQUIP_SECTIONS[1];
    return START_Y + gridsHeight + GAP + wrows * CELL + 12;
}
function rootHeight() {
    return bottomHalfY() + 90 + 40; // grids + player inv block + hotbar/margin
}

const outPath = path.join(__dirname, "..", "rp", "ui", "horse_screen.json");
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log(`container_items sections: ${SECTIONS.map(([l, c, r]) => `${l}=${c}x${r}=${c * r}`).join(", ")}`);
console.log(`horse_equip_items sections: ${EQUIP_SECTIONS.map(([l, c, r, s]) => `${l}=${c}x${r}=${c * r} (indices ${s}-${s + c * r - 1})`).join(", ")}`);
console.log(`Panel size: ${panelWidth()}x${rootHeight()}`);
