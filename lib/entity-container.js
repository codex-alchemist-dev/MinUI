// MinUI's "entity inventory" primitives - Inventory() and Equipment() - the
// two real, independent multi-slot mechanisms this whole investigation
// found, cleaned up into a reusable builder instead of hand-rolled JSON.
//
// THE THREE PRIMITIVES
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
// Button(label, opts) - a real, proper button, not an item icon in a slot.
// Reverse-engineered from vanilla's own real buttons (beacon's power/
// confirm/cancel tiles, villager trade selection): every one of them turns
// out to be a plain container_item cell with its background/icon swapped
// for button art, reading from a collection - there is no separate
// "button" data channel anywhere in the engine (confirmed exhaustively,
// see BUTTONS ARE NOT A SEPARATE CHANNEL below). Button() does the same,
// honestly, on container_items (the one collection we can actually read
// from script) - a real interactive slot underneath, background swapped to
// a real vanilla button texture, item icon hidden, a text label on top.
// The caller still locks the returned index and wires onPress, same as any
// button-as-slot - Button() only fixes the LOOK, not the mechanism (nothing
// can fix the mechanism further; see below).
//
// BUTTON POSITIONING (investigated at length 2026-09-27, NOT actually
// fixed - documenting the dead ends so they aren't retried): a Button()'s
// declared cell's own LOOK ($background_images) always renders at its
// correct declared JSON position. Its real interactive slot (the
// collection_index a press/press-poll actually reads) and its native item
// icon (when not hidden) do NOT - they land somewhere else on screen,
// shifting depending on how many other container_items slots are declared
// before it. Confirmed NONE of the following fix it: (a) a uniform 1x1
// buildRows()-shaped cell instead of one stretched to [width,height]; (b)
// declaring the real cell and a decorative overlay as two independent
// top-level siblings at the same offset (the overlay rendered fine, the
// real cell still misaligned); (c) stretching only $cell_image_size while
// keeping the outer cell CELL-sized (broke the overlay's own position
// too). Current shipped behavior: Button() looks right immediately (the
// declared LOOK always has, every attempt), but the caller must
// empirically find which real container_items index the interactive
// hitbox actually lands on (place a test item, read its real index back
// via script, exactly the placement-test technique already used to find
// the SHARED PHYSICAL SLOT ARRAY offset below) and lock/seed THAT index
// instead of the value Button() returns - see ui.js's CODEX_BUTTON_SLOT
// for a real worked example (declared index 146, real interactive index
// empirically found to be 153 for that specific layout).
//
// THE MECHANISM ALL THREE USE (the actual finding this session)
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
//
// HARD CEILING: a SEPARATE, fixed limit exists on top of the headroom rule
// above, and headroom cannot buy your way past it. Confirmed at real scale:
// a two-section layout (240 + 240 = 480 total container_items slots,
// inventory_size bumped all the way to 1512 - 3x headroom over what was
// needed) still broke exactly at global index 249 (the 12x20 first section
// fully worked; the second section's 10th slot onward silently bounced
// items back to the player or duplicated into an earlier real slot). Since
// more headroom did nothing here (unlike the ratio-based ceiling above),
// this looks like a genuine fixed cap on total real interactive
// container_items slots per screen, independent of inventory_size.
// MAX_CONTAINER_SLOTS below is set conservatively under the observed
// break point (249) - Inventory() throws rather than silently shipping a
// layout with dead slots past this line. Not yet confirmed whether
// Equipment()/horse_equip_items has its own separate ceiling of the same
// kind - no layout has come close to testing it at this scale yet.
//
// SHARED PHYSICAL SLOT ARRAY (the real explanation for what was first
// misdiagnosed as a "top-level panel limit" - see below): container_items
// and horse_equip_items are NOT two independent arrays on a horse-type
// entity. They share ONE combined physical slot array - horse_equip_items
// claims the FRONT of it (however many equippable slots are declared,
// including the 2 reserved native ones), and container_items starts
// immediately after, regardless of what collection_index we declare in
// JSON UI. Confirmed with a real placement test: the user manually placed
// items at known visual positions while a script dump printed the actual
// real index each one landed at - every single one was shifted by exactly
// +7, matching exactly 7 declared horse_equip_items slots (2 reserved + 5
// for equip_narrow). The deployed JSON's own collection_index values were
// separately verified correct (0 for grid_A's first cell, 4 for grid_B's,
// etc.) - ruling out a generator bug and confirming the shift happens on
// the engine's side, between "the index we ask for" and "the real slot it
// resolves to". Fixed by _ensureContainerItemsBase(): container_items'
// real starting index is set lazily to horse_equip_items' current slot
// count the first time it's needed - so declare all Equipment() sections
// BEFORE the first Inventory()/Button() call on container_items, or this
// offset will be computed wrong.
//
// (The "top-level panel limit" theory that first explained the same
// symptom was wrong - attaching sections via attachTo didn't fix anything,
// because the real +7 offset was present regardless of panel structure.
// attachTo itself isn't harmful, just solves a problem that didn't exist.)
//
// BUTTONS ARE NOT A SEPARATE CHANNEL: exhaustively confirmed there is no
// way for a real type:"button" control to trigger a custom script action
// from inside a container-type screen. Checked four independent real
// vanilla examples (beacon's power/confirm/cancel buttons, villager trade
// selection, anvil's rename box, NPC dialogue's real command-running
// buttons) - every one turns out to be either a plain collection binding
// dressed up as a button (beacon/villager/anvil), or a genuinely different
// screen category entirely (NPC dialogue is a form, not a container
// screen - forms DO get a real button-press-to-server channel, containers
// never do). Also directly tested: button_mappings/$pressed_button_name
// with both a dot-format fake action name and a real colon-format
// scriptevent id - neither produced any signal. Property_bag was checked
// too - it's one-directional (script pushes a value in via a real bound
// API like setTitle; a UI control can never write a NEW value back out to
// script). This is why Button() above still allocates a real
// container_items slot underneath - that's genuinely the only working
// mechanism, not a fallback chosen for lack of trying harder.
"use strict";

const { chunkRows } = require("./layout/grid.js");

const CELL = 18; // vanilla's own slot pixel size
const HEADROOM_MULTIPLIER = 3; // empirically-derived, see note above - not a proven exact ratio
const MAX_CONTAINER_SLOTS = 240; // hard ceiling, see note above - confirmed break point was 249, this leaves margin

class ContainerBuilder {
    /**
     * @param {string} namespace - the JSON UI namespace item templates/cells are declared under (must match the screen's own "namespace").
     * @param {object} [opts]
     * @param {string} [opts.equipCollection="horse_equip_items"] - the real
     *   equippable-slot collection name, for entity types other than horse
     *   that expose their own equivalent (or "" for a container_type with
     *   none at all, e.g. a plain chest - pass reservedEquipSlots: 0 too).
     * @param {number} [opts.reservedEquipSlots=2] - how many of that
     *   collection's front slots are natively engine-reserved (horse: 2 -
     *   saddle + one fixed-item slot). Pass 0 for a container_type with no
     *   such reservation.
     */
    constructor(namespace, { equipCollection = "horse_equip_items", reservedEquipSlots = 2 } = {}) {
        this.namespace = namespace;
        this.equipCollection = equipCollection;
        this.controls = [];           // ordered list of ready-to-embed JSON UI controls (top-level sections only)
        this.itemTemplates = {};      // collectionName -> template key, deduped
        // container_items' real starting index is NOT 0 on entities that
        // share a physical slot array with an equip-style collection - see
        // SHARED PHYSICAL SLOT ARRAY in the file header. It's set lazily,
        // the first time it's actually needed, to whatever equipCollection's
        // current slot count is (see _ensureContainerItemsBase).
        this.nextIndex = { [equipCollection]: reservedEquipSlots };
        this.equippableSlots = [];    // {slot, item, accepted_items?} - feeds container_wide.json's minecraft:equippable
        this.maxContainerIndex = -1;  // highest container_items index actually used
        this.buttonDefs = {};         // extra namespace-level defs Button() needs (bg panels + overlay defs)
        this.buttonSlots = [];        // {label, index} - every Button() allocated, for the caller to lock + wire onPress
        this.sections = {};           // label -> the section's live JSON object (its "controls" array can be appended to via attachTo)
        this.allocatedLabels = [];    // every label ever assigned into this.sections, in call order (duplicates NOT deduped) - see validateContainerContract()
    }

    _templateFor(collectionName) {
        if (!this.itemTemplates[collectionName]) {
            this.itemTemplates[collectionName] = `oc_item_${collectionName.replace(/[^a-z0-9]/gi, "_")}`;
        }
        return this.itemTemplates[collectionName];
    }

    // See SHARED PHYSICAL SLOT ARRAY in the file header. Lazily fixes
    // container_items' real starting index to however many equipCollection
    // slots exist AT THE TIME this is first called - so declare all your
    // Equipment() sections before your first Inventory()/Button() call on
    // container_items, or this offset will be wrong. A builder constructed
    // with reservedEquipSlots: 0 and no Equipment() calls (e.g. a plain
    // chest-type screen) naturally resolves this to 0 - no shared-array
    // offset applies there at all.
    _ensureContainerItemsBase() {
        if (this.nextIndex.container_items === undefined) {
            this.nextIndex.container_items = this.nextIndex[this.equipCollection] ?? 0;
        }
        return this.nextIndex.container_items;
    }

    /**
     * Real bulk storage - stacks, accepts anything by default. cellSize
     * shrinks the slots (default 18, vanilla's own size).
     *
     * attachTo: label of a PREVIOUSLY created section (Inventory/Equipment/
     * Button) to nest this one's rows into, instead of creating a new
     * independent top-level panel. See TOP-LEVEL PANEL LIMIT in the file
     * header - only the first 3 independent top-level sections render at
     * their own declared position; a 4th+ collapses into an earlier one's
     * screen space. Attaching stacks the new rows below whatever the target
     * section already has (its own vertical stack_panel just gets more
     * children), keeping the real top-level count at 3 or fewer.
     */
    Inventory(label, cols, rows, { offset, acceptedItems, cellSize = CELL, attachTo } = {}) {
        const collectionName = "container_items";
        this._ensureContainerItemsBase();
        const startIndex = this.nextIndex[collectionName];
        const endIndex = startIndex + cols * rows - 1;
        if (endIndex >= MAX_CONTAINER_SLOTS) {
            throw new Error(
                `Inventory("${label}", ${cols}x${rows}) would use container_items indices ${startIndex}-${endIndex}, ` +
                `crossing the confirmed hard ceiling of ${MAX_CONTAINER_SLOTS} total real interactive slots per screen ` +
                `(see entity-container.js's HARD CEILING note - a real 480-slot two-section layout broke at index 249, ` +
                `and more inventory_size headroom did not fix it). Shrink this section or an earlier one.`
            );
        }
        this.nextIndex[collectionName] += cols * rows;
        this.maxContainerIndex = Math.max(this.maxContainerIndex, startIndex + cols * rows - 1);
        const template = this._templateFor(collectionName);
        this.allocatedLabels.push(label);
        if (attachTo) {
            const parent = this.sections[attachTo];
            if (!parent) throw new Error(`Inventory("${label}"): attachTo "${attachTo}" isn't a known section (create it first).`);
            parent.controls.push(...buildRows(this.namespace, label, cols, rows, collectionName, template, startIndex, cellSize));
        } else {
            const built = buildSection(this.namespace, label, cols, rows, collectionName, template, startIndex, offset, cellSize);
            this.controls.push(built.control);
            this.sections[label] = built.section;
        }
        return { startIndex, endIndex: startIndex + cols * rows - 1, width: cols * cellSize, height: rows * cellSize };
    }

    /** Single-item slots - each must declare what it accepts. Never stacks (not fixable). cellSize shrinks the slots (default 18). attachTo: see Inventory(). */
    Equipment(label, cols, rows, { offset, item = "minecraft:apple", acceptedItems, startAt, cellSize = CELL, attachTo } = {}) {
        const collectionName = this.equipCollection;
        const startIndex = startAt ?? this.nextIndex[collectionName];
        this.nextIndex[collectionName] = Math.max(this.nextIndex[collectionName], startIndex + cols * rows);
        for (let i = 0; i < cols * rows; i++) {
            const slot = { slot: startIndex + i, item };
            if (acceptedItems) slot.accepted_items = acceptedItems;
            this.equippableSlots.push(slot);
        }
        const template = this._templateFor(collectionName);
        this.allocatedLabels.push(label);
        if (attachTo) {
            const parent = this.sections[attachTo];
            if (!parent) throw new Error(`Equipment("${label}"): attachTo "${attachTo}" isn't a known section (create it first).`);
            parent.controls.push(...buildRows(this.namespace, label, cols, rows, collectionName, template, startIndex, cellSize));
        } else {
            const built = buildSection(this.namespace, label, cols, rows, collectionName, template, startIndex, offset, cellSize);
            this.controls.push(built.control);
            this.sections[label] = built.section;
        }
        return { startIndex, endIndex: startIndex + cols * rows - 1, width: cols * cellSize, height: rows * cellSize };
    }

    /**
     * A real, proper button - not an item icon in a slot. Villager/beacon's own
     * real buttons turned out to just be a styled cell reading from a
     * collection (see file header) - this does the same honest thing, on the
     * one collection we can actually observe from script (container_items).
     * Real interactivity: a genuine container_items slot underneath (locked +
     * marker-itemed by the caller, same as any other button-as-slot). Real
     * button LOOK: common.container_item's own $background_images/
     * $item_renderer hooks are swapped to a real vanilla button texture plus
     * a text label, and the item icon is hidden entirely (size 0) - so it
     * reads as a labeled button, never as "an item sitting in a slot."
     *
     * collection defaults to "container_items" - the ONLY collection
     * confirmed readable from script (via
     * entity.getComponent("minecraft:inventory").container), which is the
     * whole reason a button-as-slot can detect a press at all. Picking a
     * different collection is allowed (opts.force required) but almost
     * certainly makes a non-functional button:
     *  - the entity's equip-style collection (this.equipCollection, e.g.
     *    "horse_equip_items"): confirmed NO Script API read path for
     *    arbitrary indices - EntityEquippableComponent.getEquipment() only
     *    accepts the fixed enum slots (head/chest/legs/feet/mainhand/
     *    offhand/body), which numeric equip indices (2+) don't map to.
     *    Real storage, real interactivity in the UI, invisible to script.
     *  - anything else (furnace_ingredient_items, cartography_input_items,
     *    etc.): tied to a native subsystem this entity doesn't have. May
     *    render fine, may crash on select like every other unrecognized-
     *    for-this-entity collection name tested this session - untested,
     *    no allocation/cap tracking exists for it here.
     */
    Button(label, { offset, text = "", width = CELL * 4, height = CELL, collection = "container_items", item = "minecraft:emerald", acceptedItems, force = false, attachTo } = {}) {
        if (collection !== "container_items" && !force) {
            throw new Error(
                `Button("${label}"): collection "${collection}" has no confirmed Script API read path - a button built on it ` +
                `would render and be clickable in-game but the server could never detect the press (confirmed for ` +
                `${this.equipCollection}; untested and likely worse for any other named collection, which is tied to a native ` +
                `subsystem this entity doesn't have). Pass { force: true } if that's intentional (e.g. purely decorative).`
            );
        }

        let startIndex;
        if (collection === "container_items") {
            this._ensureContainerItemsBase();
            startIndex = this.nextIndex.container_items;
            if (startIndex >= MAX_CONTAINER_SLOTS) {
                throw new Error(`Button("${label}") would use container_items index ${startIndex}, crossing the confirmed hard ceiling of ${MAX_CONTAINER_SLOTS} slots per screen.`);
            }
            this.nextIndex.container_items = startIndex + 1;
            this.maxContainerIndex = Math.max(this.maxContainerIndex, startIndex);
        } else if (collection === this.equipCollection) {
            startIndex = this.nextIndex[collection];
            this.nextIndex[collection] = startIndex + 1;
            const slot = { slot: startIndex, item };
            if (acceptedItems) slot.accepted_items = acceptedItems;
            this.equippableSlots.push(slot);
        } else {
            this.nextIndex[collection] ??= 0;
            startIndex = this.nextIndex[collection];
            this.nextIndex[collection] = startIndex + 1;
        }

        const bgKey = `oc_button_bg_${label}`;
        const itemKey = `oc_button_item_${label}`;
        const emptyKey = "oc_button_empty_renderer";
        this.buttonDefs[bgKey] = {
            type: "panel",
            controls: [
                { bg: { type: "image", texture: "textures/ui/button_borderless_light", size: ["100%", "100%"] } },
                { lbl: { type: "label", text, size: ["100%", "100%"], text_alignment: "center", color: [1, 1, 1] } },
            ],
        };
        // A real, genuinely-blank control (no texture at all) - shrinking the
        // real item renderer's $item_renderer_size to [0,0] was NOT enough to
        // actually hide it (confirmed: the real item icon still rendered and
        // was still clickable independent of the new button visuals).
        // $item_renderer is type:"custom" internally and may simply ignore an
        // externally-passed size hint - swapping the whole renderer control
        // out is more reliable than trying to shrink it.
        this.buttonDefs[emptyKey] = { type: "image" };
        this.buttonDefs[`${itemKey}@common.container_item`] = {
            "$item_collection_name": collection,
            "$background_images": `${this.namespace}.${bgKey}`,
            "$item_renderer": `${this.namespace}.${emptyKey}`,
            "$stack_count_required": false,
            "$durability_bar_required": false,
            "$storage_bar_required": false,
        };

        // Confirmed empirically (2026-09-27): the button's declared cell
        // (size [width,height]) renders its own LOOK at the right place,
        // but its real interactive/collection_index position - and the
        // native item icon, when not hidden - lands elsewhere on screen,
        // shifting depending on how many other slots are declared before
        // it. No JSON structure found this session fixes that drift
        // (single cell, attachTo, a separate overlay, a uniform 1x1 cell
        // all tried). Workaround: lock the WHOLE row's real index range in
        // the caller (ui.js) and empirically find the index that lands
        // wherever this cell visually renders, then seed the marker there
        // instead of at `index` - see ui.js's CODEX_BUTTON_SLOT comment.
        const row = {
            type: "stack_panel",
            orientation: "horizontal",
            size: [width, height],
            collection_name: collection,
            controls: [
                {
                    [`${label}_cell@${this.namespace}.${itemKey}`]: {
                        size: [width, height],
                        "$cell_image_size": [width, height], // common.container_item's own inner bg/icon panel size - must match or the button art stays 18x18 regardless of the outer size
                        collection_index: startIndex,
                    },
                },
            ],
        };
        this.allocatedLabels.push(label);
        if (attachTo) {
            const parent = this.sections[attachTo];
            if (!parent) throw new Error(`Button("${label}"): attachTo "${attachTo}" isn't a known section (create it first).`);
            parent.controls.push({ [`${label}_row`]: row });
        } else {
            row.anchor_from = "top_left";
            row.anchor_to = "top_left";
            row.offset = offset;
            this.controls.push({ [`grid_${label}`]: row });
            this.sections[label] = row;
        }

        this.buttonSlots.push({ label, index: startIndex, collection, functional: collection === "container_items" });
        return { index: startIndex, collection, functional: collection === "container_items" };
    }

    /** The `oc_item_*@common.container_item` template defs this layout's sections reference, plus any Button() extras. */
    templateDefs() {
        const out = {};
        for (const [collectionName, key] of Object.entries(this.itemTemplates)) {
            out[`${key}@common.container_item`] = { "$item_collection_name": collectionName };
        }
        return { ...out, ...this.buttonDefs };
    }

    /** The container_items inventory_size to declare on the entity, with headroom (see file header). */
    recommendedInventorySize() {
        return Math.max(200, Math.ceil((this.maxContainerIndex + 1) * HEADROOM_MULTIPLIER));
    }
}

// Just the row-level controls (each row its own collection_name-declaring
// stack_panel) - reusable both as a standalone top-level section
// (buildSection) and as extra rows appended into an EXISTING top-level
// panel (see ContainerBuilder's attachTo option and the TOP-LEVEL PANEL
// LIMIT note in the file header).
function buildRows(namespace, label, cols, rows, collectionName, template, startIndex, cellSize = CELL) {
    const indices = Array.from({ length: cols * rows }, (_, i) => startIndex + i);
    return chunkRows(indices, cols).map((rowIndices, r) => ({
        [`${label}_row_${r}`]: {
            type: "stack_panel",
            orientation: "horizontal",
            size: [cols * cellSize, cellSize],
            collection_name: collectionName,
            controls: rowIndices.map(index => ({
                [`${label}_cell_${index}@${namespace}.${template}`]: {
                    size: [cellSize, cellSize],
                    collection_index: index,
                },
            })),
        },
    }));
}

// A stack_panel of row stack_panels - the one structure confirmed to
// respect a real starting index (see file header).
function buildSection(namespace, label, cols, rows, collectionName, template, startIndex, offset, cellSize = CELL) {
    const section = {
        type: "stack_panel",
        orientation: "vertical",
        anchor_from: "top_left", anchor_to: "top_left",
        size: [cols * cellSize, rows * cellSize],
        offset,
        controls: buildRows(namespace, label, cols, rows, collectionName, template, startIndex, cellSize),
    };
    return { key: `grid_${label}`, control: { [`grid_${label}`]: section }, section };
}

// ---- chest-contract structural validation (OR-Track D5) --------------------
// Declarative, pre-deploy structural checks over a finished ContainerBuilder,
// modeled on mcbejsonuimasterAI's own chest-contract pattern: every check
// here is about internal CONSISTENCY of the builder's own output (duplicate
// labels, duplicate/overlapping indices, a declared entity size too small
// for what was actually allocated) - never a claim about real in-game
// behavior. Each returned issue is explicitly `runtimeVerified: false` for
// that reason, matching the research this pattern is credited from.
//
// A duplicate label is a genuine, otherwise-silent bug class this project
// found while writing this check: `this.sections[label] = ...` is a plain
// object-key assignment with no duplicate guard anywhere in Inventory()/
// Equipment()/Button() - a second call reusing an earlier label silently
// replaces that label's entry in `this.sections`, so a LATER attachTo
// referencing that label attaches to the wrong (second) section instead of
// throwing, with nothing to say so.
/**
 * @param {ContainerBuilder} builder
 * @param {object} [opts]
 * @param {number} [opts.declaredInventorySize] - the consuming entity's own
 *   `minecraft:inventory`'s `container.size` (or equivalent), if known - to
 *   check it actually covers every index this builder allocated.
 * @returns {Array<{issue: string, runtimeVerified: false}>}
 */
function validateContainerContract(builder, { declaredInventorySize } = {}) {
    const issues = [];
    const note = issue => issues.push({ issue, runtimeVerified: false });

    const seenLabels = new Map(); // label -> how many times allocated
    for (const label of builder.allocatedLabels) seenLabels.set(label, (seenLabels.get(label) ?? 0) + 1);
    for (const [label, count] of seenLabels) {
        if (count > 1) note(`label "${label}" was allocated ${count} times - a later call silently overwrote this.sections["${label}"], so any attachTo referencing it attaches to the WRONG section`);
    }

    // Real collection_index collisions (a button/slot silently sharing a
    // real index with another one, container_items-vs-container_items or
    // any other collection) are checked by lib/lintjsonui.js (OR-Track D5)
    // instead, over the actual compiled JSON tree - a strict superset of
    // what a button-only, pre-serialization check here could ever catch
    // (it also sees Inventory()/Equipment() cells, and any hand-written
    // overlay JSON, not just Button() calls on one builder instance).

    if (typeof declaredInventorySize === "number" && builder.maxContainerIndex >= declaredInventorySize) {
        note(`builder allocated up to container_items index ${builder.maxContainerIndex}, but the declared entity inventory size is only ${declaredInventorySize} (needs >= ${builder.maxContainerIndex + 1})`);
    }

    return issues;
}

module.exports = { ContainerBuilder, CELL, MAX_CONTAINER_SLOTS, validateContainerContract };
