// A build-time, non-destructive JSON UI tree patcher (OR-Track D6),
// crediting EasyUIBuilder (MIT, see CREDITS.md) for the operation
// vocabulary: insert_back/insert_front/insert_after/insert_before/
// move_back/move_front/move_after/move_before/swap/replace/remove.
//
// This is NOT an emitter of Bedrock's own native runtime `"modifications"`
// array (that format is only confirmed, in real documentation, for
// insert_back/insert_front against a live resource-pack-load-order merge -
// move_*/swap/replace/remove's exact native anchor syntax isn't documented
// anywhere findable). applyModifications() instead computes the final,
// already-merged JSON at BUILD TIME, in plain JS - the same real role
// EasyUIBuilder itself plays (a build-time tool producing final JSON UI,
// not a thing Bedrock's engine executes directly). This is what lets a mod
// non-destructively patch another mod's or the base engine's screen
// (inserting/reordering/replacing named controls) instead of only ever
// being able to replace a whole file wholesale.
"use strict";

// A control array entry is always a single-key object: { "name": {...} }
// or { "name@ns.template": {...} }. Matching an anchor by name must accept
// either form - a mod patching "confirm_button" shouldn't need to know
// whether it was declared as a template reference or an inline control.
function keyOf(entry) {
    const raw = Object.keys(entry)[0];
    const at = raw.indexOf("@");
    return at === -1 ? raw : raw.slice(0, at);
}

function findIndex(arr, name, ctx) {
    const i = arr.findIndex(e => keyOf(e) === name);
    if (i === -1) throw new Error(`applyModifications: ${ctx} - no control named "${name}" in this array`);
    return i;
}

function resolveTargetArray(baseJson, targetPath) {
    const parts = targetPath.split(".");
    let node = baseJson;
    for (const part of parts) {
        if (node == null || typeof node !== "object") throw new Error(`applyModifications: target "${targetPath}" - "${part}" doesn't resolve to an object`);
        node = node[part];
    }
    if (!Array.isArray(node)) throw new Error(`applyModifications: target "${targetPath}" must resolve to an array, got ${typeof node}`);
    return node;
}

const OPS = {
    insert_back(arr, mod) { arr.push(...mod.value); },
    insert_front(arr, mod) { arr.unshift(...mod.value); },
    insert_after(arr, mod, ctx) { arr.splice(findIndex(arr, mod.anchor, ctx) + 1, 0, ...mod.value); },
    insert_before(arr, mod, ctx) { arr.splice(findIndex(arr, mod.anchor, ctx), 0, ...mod.value); },
    move_back(arr, mod, ctx) { const i = findIndex(arr, mod.anchor, ctx); arr.push(...arr.splice(i, 1)); },
    move_front(arr, mod, ctx) { const i = findIndex(arr, mod.anchor, ctx); arr.unshift(...arr.splice(i, 1)); },
    move_after(arr, mod, ctx) {
        const from = findIndex(arr, mod.anchor, ctx);
        const [item] = arr.splice(from, 1);
        const to = findIndex(arr, mod.target2 ?? mod.after, ctx);
        arr.splice(to + 1, 0, item);
    },
    move_before(arr, mod, ctx) {
        const from = findIndex(arr, mod.anchor, ctx);
        const [item] = arr.splice(from, 1);
        const to = findIndex(arr, mod.target2 ?? mod.before, ctx);
        arr.splice(to, 0, item);
    },
    swap(arr, mod, ctx) {
        const i = findIndex(arr, mod.anchor, ctx);
        const j = findIndex(arr, mod.target2 ?? mod.with, ctx);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    },
    replace(arr, mod, ctx) { arr[findIndex(arr, mod.anchor, ctx)] = mod.value; },
    remove(arr, mod, ctx) { arr.splice(findIndex(arr, mod.anchor, ctx), 1); },
};

/**
 * Applies a list of modifications to baseJson IN PLACE (and returns it),
 * each `{ target, op, ...opArgs }`:
 *   - target: a dot-path resolving to an array in baseJson, e.g. "screen_home.controls"
 *   - op: one of the OPS keys above
 *   - insert_back/insert_front: { value: [entries...] }
 *   - insert_after/insert_before/move_back/move_front/replace/remove: { anchor: "controlName", value?: entry }
 *   - move_after/move_before/swap: { anchor: "controlName", target2: "otherControlName" }
 *     (move_after/move_before also accept the more readable { after: "..." }/{ before: "..." };
 *      swap also accepts { with: "..." })
 * Applied in array order - a later modification sees the result of every
 * earlier one, matching how a real overlay-merge pipeline is expected to run.
 */
function applyModifications(baseJson, modList) {
    for (const mod of modList) {
        const op = OPS[mod.op];
        if (!op) throw new Error(`applyModifications: unknown op "${mod.op}" (target "${mod.target}") - valid ops: ${Object.keys(OPS).join(", ")}`);
        const arr = resolveTargetArray(baseJson, mod.target);
        op(arr, mod, `target "${mod.target}", op "${mod.op}"`);
    }
    return baseJson;
}

module.exports = { applyModifications, keyOf };
