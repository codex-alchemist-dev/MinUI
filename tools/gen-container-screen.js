#!/usr/bin/env node
// Generates rp/ui/horse_screen.json - a full, unconditional replacement of
// horse_screen.json's real content. Not part of the normal build; run by
// hand (`node tools/gen-container-screen.js`) whenever the layout needs
// regenerating, and the OUTPUT file is what actually ships.
//
// The actual container mechanism (Inventory/Equipment, why they work, the
// headroom requirement) is documented in lib/entity-container.js - this
// file is just the concrete layout for our satchel screen. Hard
// constraints that still apply regardless of layout: container_type is a
// fixed 7-value enum with no "use my own screen" option, and per-instance
// content swapping is confirmed impossible - so this replaces
// horse_screen.json unconditionally, for every container_type "horse"
// entity including real horses/donkeys/mules/llamas.
"use strict";
const fs = require("fs");
const path = require("path");
const { ContainerBuilder, CELL } = require("../lib/entity-container.js");

const GAP = 6;        // daylight between major sections (was 10 - tightened)
const SHORT_GAP = 3;  // daylight between the two hotbar rows
const START_X = 60, START_Y = 18; // clears the renderer/equip column to the left
const SMALL = 12;     // shrunk cell size for the big grids (vanilla's own is 18) - fits much more on screen

const b = new ContainerBuilder("horse");

// Equip column: single-item quick slots, to the left of the renderer.
// Slots 0/1 (saddle/armor) are reserved automatically by the builder.
const narrow = b.Equipment("equip_narrow", 1, 5, { offset: [START_X - SMALL - GAP, START_Y], cellSize: SMALL });

// Main bulk storage: two real, independent Inventory sections (genuinely
// disjoint slot ranges of the same container_items collection). STRESS
// TEST: 12x20 = 240 slots each, 480 total - just to see how far this holds.
const B_COLS = 12, B_ROWS = 20, C_COLS = 12, C_ROWS = 20;
const gridB = b.Inventory("B", B_COLS, B_ROWS, { offset: [START_X, START_Y], cellSize: SMALL });
const gridC = b.Inventory("C", C_COLS, C_ROWS, { offset: [START_X + B_COLS * SMALL + GAP, START_Y], cellSize: SMALL });

// Two separate 1-row hotbar-style sections, now Inventory (stacks), with a
// short gap between them - per request, two separate 1-row sections
// instead of one 2-row block.
const gridsBottom = START_Y + Math.max(B_ROWS, C_ROWS) * SMALL;
const hotbarY = gridsBottom + GAP;
const HOTBAR_COLS = Math.max(B_COLS, C_COLS);
const hotbarRow1 = b.Inventory("hotbar1", HOTBAR_COLS, 1, { offset: [START_X, hotbarY], cellSize: SMALL });
const hotbarRow2 = b.Inventory("hotbar2", HOTBAR_COLS, 1, { offset: [START_X, hotbarY + SMALL + SHORT_GAP], cellSize: SMALL });

const panelW = START_X + B_COLS * SMALL + GAP + C_COLS * SMALL + 7;
const contentBottom = hotbarY + SMALL + SHORT_GAP + SMALL;
// Tightened bottom margin: a small gap, then the player inventory panel
// (fixed 93px, self-anchors to root_panel's bottom edge - see the note
// below), then just enough room for the hotbar strip poking out below it.
const rootH = contentBottom + 4 + 93 + 18;

const doc = {
    namespace: "horse",

    ...b.templateDefs(),

    oc_panel: {
        type: "panel",
        controls: [
            { "container_gamepad_helpers@common.container_gamepad_helpers": {} },
            { "selected_item_details_factory@common.selected_item_details_factory": {} },
            { "item_lock_notification_factory@common.item_lock_notification_factory": {} },
            {
                "root_panel@common.root_panel": {
                    size: [panelW, rootH],
                    layer: 1,
                    controls: [
                        { "common_panel@common.common_panel": { size: [panelW, rootH] } },
                        { "horse_section_label@horse.horse_label": {} },
                        { "renderer@horse.horse_renderer": { offset: [7, 18] } },
                        ...b.controls,
                        // Self-anchors to the bottom of root_panel (bottom_left/bottom_left,
                        // fixed 93px tall) - never pass an explicit offset here, it's
                        // measured from the BOTTOM edge, not the top (confirmed bug: an
                        // earlier top-style offset pushed this panel off-screen entirely).
                        { "inventory_panel_bottom_half_with_label@common.inventory_panel_bottom_half_with_label": {} },
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

const outPath = path.join(__dirname, "..", "rp", "ui", "horse_screen.json");
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log(`equip_narrow (Equipment, single-item): indices ${narrow.startIndex}-${narrow.endIndex}`);
console.log(`grid_B (Inventory, stacks): indices ${gridB.startIndex}-${gridB.endIndex}`);
console.log(`grid_C (Inventory, stacks): indices ${gridC.startIndex}-${gridC.endIndex}`);
console.log(`hotbar1 (Inventory, stacks): indices ${hotbarRow1.startIndex}-${hotbarRow1.endIndex}`);
console.log(`hotbar2 (Inventory, stacks): indices ${hotbarRow2.startIndex}-${hotbarRow2.endIndex}`);
console.log(`Recommended container_items inventory_size (with headroom): ${b.recommendedInventorySize()}`);
console.log(`Equippable slots needed: ${b.equippableSlots.length} (write these into container_wide.json's minecraft:equippable.slots)`);
console.log(`Panel size: ${panelW}x${rootH}`);

// Write the equippable slots + inventory_size straight into container_wide.json
// so this script is the single source of truth for both the UI and the
// entity - no more manually keeping them in sync by hand.
const entityPath = path.join(__dirname, "..", "..", "OpenChara", "engine", "bp", "entities", "container_wide.json");
const entityDoc = JSON.parse(fs.readFileSync(entityPath, "utf8"));
const tameGroup = entityDoc["minecraft:entity"].component_groups["{{ns}}_container_tamed"];
tameGroup["minecraft:inventory"].inventory_size = b.recommendedInventorySize();
tameGroup["minecraft:equippable"].slots = [
    { slot: 0, item: "minecraft:saddle", accepted_items: ["minecraft:saddle"] },
    { slot: 1, item: "minecraft:apple" },
    ...b.equippableSlots,
];
fs.writeFileSync(entityPath, JSON.stringify(entityDoc, null, 2) + "\n");
console.log(`Wrote ${entityPath} (inventory_size=${b.recommendedInventorySize()}, ${tameGroup["minecraft:equippable"].slots.length} equippable slots)`);
