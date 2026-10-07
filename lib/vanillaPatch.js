// Edits to VANILLA screens, emitted as Bedrock's own native `modifications` arrays (the Bedrock Wiki, "Intro to JSON UI":
// a pack that ships ui/<file>.json containing an element of the same name with a `modifications` property patches that
// element in place, no matter which pack defined it). This is the general "edit any screen" door; slot buttons
// (compile/slotButtons.js) and the HUD host (rp/ui/hud_screen.json) are users of it.
//
//   patchFile("common", { inventory_panel: [ insertBack("controls", [ { my_overlay: { type: "panel" } } ]) ] })
//     -> { namespace: "common", inventory_panel: { modifications: [ { array_name: "controls", operation: "insert_back", value: [...] } ] } }
//
// Operations and fields follow the wiki: insert_back / insert_front (value), insert_after / insert_before (control_name or
// where, value), move_back / move_front (control_name), move_after / move_before (control_name, target), swap (control_name,
// target), replace (control_name, value), remove (control_name or where). `control_name` names an entry of a controls array;
// `where` matches an entry of a bindings array by its properties. Only insert_back is proven in this project (the HUD host
// uses it in-game); the others follow the documented shape and are shape-checked here, not game-checked.
"use strict";

const NEEDS = {
    insert_back: ["value"],
    insert_front: ["value"],
    insert_after: ["value", ["control_name", "where"]],
    insert_before: ["value", ["control_name", "where"]],
    move_back: [["control_name", "where"]],
    move_front: [["control_name", "where"]],
    move_after: [["control_name", "where"], "target"],
    move_before: [["control_name", "where"], "target"],
    swap: [["control_name", "where"], "target"],
    replace: [["control_name", "where"], "value"],
    remove: [["control_name", "where"]],
};
const ARRAYS = new Set(["controls", "bindings", "variables"]);

/** One validated modification. @param {string} arrayName controls | bindings | variables */
function modification(operation, arrayName, fields = {}) {
    const need = NEEDS[operation];
    if (!need) throw new Error(`vanillaPatch: unknown operation "${operation}" (known: ${Object.keys(NEEDS).join(", ")})`);
    if (!ARRAYS.has(arrayName)) throw new Error(`vanillaPatch: array_name must be one of ${[...ARRAYS].join(", ")} (got "${arrayName}")`);
    for (const req of need) {
        const options = Array.isArray(req) ? req : [req];
        if (!options.some(k => fields[k] !== undefined)) throw new Error(`vanillaPatch: ${operation} needs ${options.join(" or ")}`);
    }
    if ("value" in fields && !Array.isArray(fields.value)) throw new Error(`vanillaPatch: ${operation} value must be an array of controls/bindings`);
    return { array_name: arrayName, operation, ...fields };
}

const insertBack = (arrayName, value) => modification("insert_back", arrayName, { value });
const insertFront = (arrayName, value) => modification("insert_front", arrayName, { value });
const insertAfter = (arrayName, controlName, value) => modification("insert_after", arrayName, { control_name: controlName, value });
const insertBefore = (arrayName, controlName, value) => modification("insert_before", arrayName, { control_name: controlName, value });
const remove = (arrayName, controlName) => modification("remove", arrayName, { control_name: controlName });

/**
 * The content of a `ui/<file>.json` that patches vanilla elements.
 * @param {string} namespace the vanilla file's namespace (e.g. "common", "hud", "crafting")
 * @param {Record<string, object[]>} elements element name -> modifications (from the helpers above)
 */
function patchFile(namespace, elements) {
    if (!namespace) throw new Error("vanillaPatch: a namespace is required");
    const doc = { namespace };
    for (const [name, mods] of Object.entries(elements)) {
        if (!Array.isArray(mods) || mods.length === 0) throw new Error(`vanillaPatch: "${name}" needs at least one modification`);
        doc[name] = { modifications: mods };
    }
    return doc;
}

/** Folds several patch documents for the SAME file into one (modifications of the same element are concatenated in order). */
function mergePatches(docs) {
    const out = {};
    for (const doc of docs) {
        if (out.namespace && out.namespace !== doc.namespace) throw new Error(`vanillaPatch: cannot merge namespaces "${out.namespace}" and "${doc.namespace}"`);
        for (const [k, v] of Object.entries(doc)) {
            if (k === "namespace") out.namespace = v;
            else out[k] = { modifications: [...(out[k]?.modifications ?? []), ...v.modifications] };
        }
    }
    return out;
}

module.exports = { modification, insertBack, insertFront, insertAfter, insertBefore, remove, patchFile, mergePatches, OPERATIONS: Object.keys(NEEDS) };
