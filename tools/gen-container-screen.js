#!/usr/bin/env node
// Generates rp/ui/horse_screen.json - a full, unconditional replacement of
// horse_screen.json's real content. Not part of the normal build; run by
// hand (`node tools/gen-container-screen.js`) whenever the layout needs
// regenerating, and the OUTPUT file is what actually ships.
//
// EIGHTH ATTEMPT. Findings so far, kept for the record:
//   1. Hand-placed standalone common.container_item cells crashed on
//      select - fixed by adding "$item_collection_name": "container_items"
//      (required by the game's Bundle-interaction system).
//   2. With that fixed, every hand-placed cell read/wrote the SAME
//      underlying slot regardless of its own collection_index, on the cell
//      itself or on a wrapping panel - collection_index appears to only
//      patch a cell that already exists inside a real, engine-generated
//      grid, not freely sample an arbitrary index into a standalone
//      control.
//   3. A single real native type:"grid" at 90 slots worked correctly for
//      exactly its first 30 slots - container_type "horse" has a real,
//      undocumented client-side interaction ceiling there, matching AC's
//      own real production inventory_size (30) exactly.
//   4. Furnace's real ingredient/fuel/output slots use no collection_index
//      at all - each gets its own uniquely named collection, which only
//      works because the engine natively exposes those specific names for
//      a furnace. Confirmed this doesn't generalize: three real grids each
//      given a MADE-UP collection_name crashed identically to finding 1 -
//      an unrecognized name doesn't render empty, it crashes.
//
// THIS ATTEMPT: three real, native type:"grid" elements again, but this
// time all three on the one real collection ("container_items") instead
// of inventing new names - prompted by noticing the single real-collection
// grid in the previous experiment (section A) rendered and behaved
// correctly on its own. Each grid still independently numbers its own
// cells from index 0 of that shared collection (confirmed earlier, no
// property offsets a grid's starting index), so this does NOT create
// three disjoint storage regions - it's three different-shaped WINDOWS
// onto the same underlying items, all overlapping on whichever indices
// each grid's own size covers. Worth seeing exactly what that looks and
// behaves like in practice rather than assuming it's undesirable.
//
// Two other hard constraints from earlier attempts still apply: container_type
// is a fixed 7-value enum with no "use my own screen" option, and
// per-instance content swapping is confirmed impossible - so this still
// replaces horse_screen.json unconditionally, for every container_type
// "horse" entity including real horses/donkeys/mules/llamas. equip_panel
// and horse_renderer are kept at their real original offsets.
"use strict";
const fs = require("fs");
const path = require("path");

const CELL = 18; // vanilla's own slot pixel size
const GAP = 10;  // visible daylight between the three grids
const START_X = 79, START_Y = 18; // clears equip_panel/horse_renderer to the left

// [label, columns, rows, collectionName?] - collectionName defaults to
// "container_items"; a section can override it to probe whether some other
// string names a real, separate collection too (e.g. "inventory" - the
// literal container_type enum value, on the chance it's coincidentally
// also a real collection name, the way "horse_equip_items" is).
const SECTIONS = [
    ["A", 1, 4],                        // 1x4 = 4, container_items
    ["B", 9, 10],                       // 9x10 = 90, container_items
    ["C", 9, 3],                        // 9x3 = 27, container_items
    ["D", 3, 3, "inventory"],           // 3x3 = 9, TEST: collection_name "inventory"
];

const doc = {
    namespace: "horse",

    // Shared item template for the container_items sections.
    "oc_grid_item@common.container_item": { "$item_collection_name": "container_items" },
    // Separate template for the "inventory" collection test - $item_collection_name
    // must match whatever collection_name the grid actually uses.
    "oc_grid_item_inv@common.container_item": { "$item_collection_name": "inventory" },

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
                        { "equipment@horse.equip_panel": { offset: [7, 18] } },
                        { "renderer@horse.horse_renderer": { offset: [25, 18] } },
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

function gridControls() {
    let x = START_X;
    const out = [];
    for (const [label, cols, rows, collectionName = "container_items"] of SECTIONS) {
        out.push({
            [`grid_${label}`]: {
                type: "grid",
                anchor_from: "top_left", anchor_to: "top_left",
                size: [cols * CELL, rows * CELL],
                offset: [x, START_Y],
                grid_dimensions: [cols, rows],
                grid_item_template: collectionName === "container_items" ? "horse.oc_grid_item" : "horse.oc_grid_item_inv",
                collection_name: collectionName,
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
    const maxGridHeight = Math.max(...SECTIONS.map(([, , rows]) => rows * CELL));
    return START_Y + maxGridHeight + 12;
}
function rootHeight() {
    return bottomHalfY() + 90 + 40; // grids + player inv block + hotbar/margin
}

const outPath = path.join(__dirname, "..", "rp", "ui", "horse_screen.json");
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log(`Sections (all on "container_items"): ${SECTIONS.map(([l, c, r]) => `${l}=${c}x${r}=${c * r}`).join(", ")}`);
console.log(`Panel size: ${panelWidth()}x${rootHeight()}`);
