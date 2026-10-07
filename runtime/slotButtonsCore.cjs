"use strict";

// Slot buttons: a locked "marker" item sitting in a player-inventory slot IS a button. This is the same mechanism MinUI's
// container and horse screens use (see container.js and lib/entity-container.js): no UI control can call a script, but a
// REAL slot underneath can be watched. Clicking the marker picks it up (or swaps it for whatever the cursor holds); the
// script notices the slot no longer holds the marker, puts the marker back, clears the cursor and runs the button's action.
//
// This file is the pure decision: given what each button slot holds right now, what must be done. The game binding
// (slotButtons.js) reads the inventory, calls reconcile(), and carries the result out.

/**
 * The invisible text every marker's name starts with. Formatting codes only, so a tooltip shows nothing odd, but a JSON UI
 * binding can recognise a marker by "item name contains this" (see lib/compile/slotButtons.js).
 */
const NAME_SENTINEL = "§0§r§0§r";

/**
 * @param {object} p
 * @param {Iterable<number>} p.buttons slots that must hold a marker
 * @param {Map<number, {marker: boolean, empty: boolean}>} p.slots what every inventory slot holds (at least the button slots and any slot holding a marker)
 * @param {boolean} p.cursorMarker whether the cursor holds a marker
 * @returns {{pressed: number[], displaced: number[], restore: number[], stray: number[], clearCursor: boolean}}
 *   pressed   button slots whose marker is gone (run their actions)
 *   displaced pressed slots that now hold a REAL item the player swapped in: give it back to them (it must not be overwritten)
 *   restore   slots to (re)write the marker into: every pressed slot
 *   stray     slots that are NOT buttons but hold a marker (the marker was dropped into another slot): remove it
 *   clearCursor whether to clear the cursor
 */
function reconcile({ buttons, slots, cursorMarker }) {
    const wanted = new Set(buttons);
    const pressed = [], displaced = [], stray = [];
    for (const slot of wanted) {
        const s = slots.get(slot);
        if (s?.marker) continue;
        pressed.push(slot);
        if (s && !s.empty) displaced.push(slot);
    }
    for (const [slot, s] of slots) if (s.marker && !wanted.has(slot)) stray.push(slot);
    return { pressed, displaced, restore: [...pressed], stray, clearCursor: Boolean(cursorMarker) };
}

module.exports = { reconcile, NAME_SENTINEL };
