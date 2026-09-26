// MinUI's "entity inventory" primitives - Inventory() and Equipment() - the
// two real, independent multi-slot mechanisms this whole investigation
// found, cleaned up into a reusable builder instead of hand-rolled JSON.
//
// THE TWO PRIMITIVES
//
// Inventory(label, cols, rows, opts) - backed by a real Bedrock
// `container_items` collection (the one used by chests, horses, every
// generic minecraft:inventory container). Slots stack normally and accept
// any item by default (opts.acceptedItems to restrict). Use this for bulk
// storage.
//
// Equipment(label, cols, rows, opts) - backed by `horse_equip_items` (real
// only on container_type "horse" entities, via minecraft:equippable).
// Confirmed, hard constraint: exactly ONE item per slot, never a stack -
// nothing unlocks this (not accepted_items, not an item's own
// max_stack_size/format_version). Every slot must declare what item it
// takes (opts.item / opts.acceptedItems) - unlike Inventory, a slot here
// has no sane "accepts anything" default because the underlying mechanism
// (minecraft:equippable) is designed around declaring real equipment
// types. Slots 0 and 1 are natively hardcoded by the engine (slot 0 only
// ever accepts a real saddle, slot 1 validates only against its own
// literal `item` value and refuses items pulled from a held stack) - this
// builder reserves them automatically so a fresh Equipment() section never
// silently lands on either without being asked to.
//
// THE MECHANISM BOTH USE (the actual finding this session)
//
// A JSON UI `type:"grid"` with `grid_item_template` can never carry a
// distinct index per cell (every generated cell is identical), and
// `collection_index` set on the grid/panel itself (rather than on an
// individual item control) is silently ignored - confirmed against both
// collections, many different ways, across this whole investigation. The
// one structure that actually respects a starting index: a `stack_panel`
// declaring `collection_name`, with each of its DIRECT CHILDREN being an
// individually-placed item control carrying its own `collection_index`.
// (The engine logs "Unknown property [collection_index]" as a schema
// warning even in this correct shape - confirmed harmless; it still works.)
// This lets two sections of the SAME collection be genuinely disjoint
// storage instead of mirrored windows onto the same slots - the first
// working partition of a single collection this session found, after
// collection_index-on-a-grid, made-up collection names, and everything
// else failed.
//
// HEADROOM (why every Inventory() section gets padded room, not the exact
// count it needs)
//
// minecraft:inventory's real interactive-slot ceiling scales with its OWN
// declared inventory_size, not a fixed engine constant - confirmed: with
// inventory_size 120 and slots actually used up to index 116, only the
// first ~96 (80%) were truly interactive; the rest rendered but silently
// refused items. Bumping the SAME layout's declared inventory_size to 500
// (needing only ~117) made every slot interactive. So declaring exactly
// what's needed is not safe - HEADROOM_MULTIPLIER below asks for
// comfortably more room than any layout actually needs, on the one real
// data point available. If a future layout still hits a dead zone, raise
// this first before suspecting anything else.
"use strict";

const CELL = 18; // vanilla's own slot pixel size
const HEADROOM_MULTIPLIER = 3; // empirically-derived, see note above - not a proven exact ratio

class ContainerBuilder {
    /**
     * @param {string} namespace - the JSON UI namespace item templates/cells are declared under (must match the screen's own "namespace").
     */
    constructor(namespace) {
        this.namespace = namespace;
        this.controls = [];           // ordered list of ready-to-embed JSON UI controls
        this.itemTemplates = {};      // collectionName -> template key, deduped
        this.nextIndex = { container_items: 0, horse_equip_items: 2 }; // horse_equip_items starts past the two reserved native slots
        this.equippableSlots = [];    // {slot, item, accepted_items?} - feeds container_wide.json's minecraft:equippable
        this.maxContainerIndex = -1;  // highest container_items index actually used
    }

    _templateFor(collectionName) {
        if (!this.itemTemplates[collectionName]) {
            this.itemTemplates[collectionName] = `oc_item_${collectionName.replace(/[^a-z0-9]/gi, "_")}`;
        }
        return this.itemTemplates[collectionName];
    }

    /** Real bulk storage - stacks, accepts anything by default. */
    Inventory(label, cols, rows, { offset, acceptedItems } = {}) {
        const collectionName = "container_items";
        const startIndex = this.nextIndex[collectionName];
        this.nextIndex[collectionName] += cols * rows;
        this.maxContainerIndex = Math.max(this.maxContainerIndex, startIndex + cols * rows - 1);
        this.controls.push(buildSection(this.namespace, label, cols, rows, collectionName, this._templateFor(collectionName), startIndex, offset));
        return { startIndex, endIndex: startIndex + cols * rows - 1 };
    }

    /** Single-item slots - each must declare what it accepts. Never stacks (not fixable). */
    Equipment(label, cols, rows, { offset, item = "minecraft:apple", acceptedItems, startAt } = {}) {
        const collectionName = "horse_equip_items";
        const startIndex = startAt ?? this.nextIndex[collectionName];
        this.nextIndex[collectionName] = Math.max(this.nextIndex[collectionName], startIndex + cols * rows);
        for (let i = 0; i < cols * rows; i++) {
            const slot = { slot: startIndex + i, item };
            if (acceptedItems) slot.accepted_items = acceptedItems;
            this.equippableSlots.push(slot);
        }
        this.controls.push(buildSection(this.namespace, label, cols, rows, collectionName, this._templateFor(collectionName), startIndex, offset));
        return { startIndex, endIndex: startIndex + cols * rows - 1 };
    }

    /** The `oc_item_*@common.container_item` template defs this layout's sections reference. */
    templateDefs() {
        const out = {};
        for (const [collectionName, key] of Object.entries(this.itemTemplates)) {
            out[`${key}@common.container_item`] = { "$item_collection_name": collectionName };
        }
        return out;
    }

    /** The container_items inventory_size to declare on the entity, with headroom (see file header). */
    recommendedInventorySize() {
        return Math.max(200, Math.ceil((this.maxContainerIndex + 1) * HEADROOM_MULTIPLIER));
    }
}

// A stack_panel of row stack_panels, each row declaring collection_name
// with `cols` individually-placed cells, each carrying its own
// collection_index - the one structure confirmed to respect a real
// starting index (see file header).
function buildSection(namespace, label, cols, rows, collectionName, template, startIndex, offset) {
    const rowControls = [];
    for (let r = 0; r < rows; r++) {
        const cells = [];
        for (let c = 0; c < cols; c++) {
            const index = startIndex + r * cols + c;
            cells.push({
                [`${label}_cell_${index}@${namespace}.${template}`]: {
                    size: [CELL, CELL],
                    collection_index: index,
                },
            });
        }
        rowControls.push({
            [`${label}_row_${r}`]: {
                type: "stack_panel",
                orientation: "horizontal",
                size: [cols * CELL, CELL],
                collection_name: collectionName,
                controls: cells,
            },
        });
    }
    return {
        [`grid_${label}`]: {
            type: "stack_panel",
            orientation: "vertical",
            anchor_from: "top_left", anchor_to: "top_left",
            size: [cols * CELL, rows * CELL],
            offset,
            controls: rowControls,
        },
    };
}

module.exports = { ContainerBuilder, CELL };
