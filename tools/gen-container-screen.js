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

const GAP = 10;       // daylight between major sections
const SHORT_GAP = 4;  // daylight between the two hotbar rows
const START_X = 79, START_Y = 18; // clears the renderer/equip column to the left

const b = new ContainerBuilder("horse");

// Equip column: single-item quick slots, to the left of the renderer
// (original spot: equip at x=7, renderer at x=25).
const narrow = b.Equipment("equip_narrow", 1, 5, { offset: [7, START_Y] });

// Back to the original reasonable 3-section design, dev-sized (full
// vanilla 18px cells): A=1x4, B=9x10, C=9x3. All real, independent
// Inventory sections now (not mirrored windows like the old attempts).
const gridA = b.Inventory("A", 1, 4, { offset: [START_X, START_Y] });
const gridB = b.Inventory("B", 9, 10, { offset: [START_X + 1 * CELL + GAP, START_Y] });
const gridC = b.Inventory("C", 9, 3, { offset: [START_X + 1 * CELL + GAP + 9 * CELL + GAP, START_Y] });

// B is the tallest (10 rows = 180px) - C (3 rows = 54px) leaves a large
// free rectangle under it, same width as C, from y=72 to y=180 (108px
// tall) - this is where the codex-open test slot goes (see below).
const cX = START_X + 1 * CELL + GAP + 9 * CELL + GAP;
const freeSpaceY = START_Y + 3 * CELL + GAP; // right under C's 3 rows
const codexButton = b.Inventory("codex_button", 1, 1, { offset: [cX, freeSpaceY] });

// Two separate 1-row hotbar-style sections (stack), with a short gap
// between them, below the tallest main section (B).
const gridsBottom = START_Y + 10 * CELL;
const hotbarY = gridsBottom + GAP;
const hotbarRow1 = b.Inventory("hotbar1", 9, 1, { offset: [START_X + 1 * CELL + GAP, hotbarY] });
const hotbarRow2 = b.Inventory("hotbar2", 9, 1, { offset: [START_X + 1 * CELL + GAP, hotbarY + CELL + SHORT_GAP] });

const panelW = START_X + 1 * CELL + GAP + 9 * CELL + GAP + 9 * CELL + 7;
const contentBottom = hotbarY + CELL + SHORT_GAP + CELL;
const rootH = contentBottom + 8 + 93 + 20; // content + margin + player inv panel (fixed 93px, self-anchors) + hotbar strip room

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
console.log(`grid_A (Inventory, stacks): indices ${gridA.startIndex}-${gridA.endIndex}`);
console.log(`grid_B (Inventory, stacks): indices ${gridB.startIndex}-${gridB.endIndex}`);
console.log(`grid_C (Inventory, stacks): indices ${gridC.startIndex}-${gridC.endIndex}`);
console.log(`codex_button (Inventory, single slot - real button test): index ${codexButton.startIndex}`);
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
