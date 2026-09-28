// JSON UI linter: catches the "silent killer" mistakes documented in
// docs/UI.md - ones that load fine and simply do nothing in-game, with no
// error anywhere - plus a set of confirmed CRASH cases, which are worse
// than silent. Runs over every *.json under a resource pack's `ui/` folder,
// both the compiler's own generated output (a regression check on the
// compiler itself) and any hand-written overlay files a project adds.
//
// Checked, from the UI-0 spikes and bedrock-core/ui's own spike research
// (docs/spikes/jsonui-container-facts.md, S13/S14 - credited in
// CREDITS.md):
//   - no `>=` in a Molang expression (Bedrock's binding language has no
//     greater-or-equal operator; it silently parses as something else)
//   - no `''` empty string literal in a Molang expression - confirmed to
//     CRASH the client outright when combined with a binding read (not
//     just silently misbehave)
//   - no `/` division applied to #inventory_stack_count - confirmed to
//     CRASH the client outright (stack count is a string in binding
//     expressions; `/` on a float property like durability is fine)
//   - `collection_index` only means something under an ancestor that
//     declares `collection_name`, AND only at an instantiation site (an
//     entry in a parent's `controls`) - never on a root-level definition
//     itself, which the engine rejects
//   - a `"type": "button"` needs its own `collection_details` binding to
//     report which collection cell was pressed
//   - `$variable` in a binding inside a `modifications`-injected subtree
//     (these don't resolve there - UI-0 finding)
//   - duplicate `collection_index` values declared under the same
//     `collection_name` scope within one file - two cells silently
//     fighting over the same real slot, this project's own
//     entity-container.js button-index-collision check generalized to
//     ANY json UI file (hand-written overlays included, not just
//     ContainerBuilder-generated output)

"use strict";

// Fields whose string value is itself a Molang expression, not plain text/a path.
const MOLANG_FIELDS = new Set(["source_property_name", "visible", "enabled", "collection_length"]);

// The one property confirmed (bedrock-core/ui S14, jsonui-container-facts)
// to be a STRING inside a binding expression, where a division crashes the
// client - not an exhaustive string-type checker, just the one real,
// confirmed-dangerous case.
const KNOWN_STRING_PROPERTIES = ["#inventory_stack_count"];

function walk(node, ctx, path, errors, file, collisions) {
    if (Array.isArray(node)) {
        // Each array entry of a `controls` array is a real instantiation
        // site - a collection_index found on an entry here is valid; one
        // found on a bare root-level definition object is not (see
        // atInstantiationSite below).
        const childCtx = ctx.parentKey === "controls" ? { ...ctx, atInstantiationSite: true } : ctx;
        node.forEach((v, i) => walk(v, childCtx, `${path}[${i}]`, errors, file, collisions));
        return;
    }
    if (!node || typeof node !== "object") return;

    const hasCollection = "collection_name" in node;
    const baseCtx = { hasCollection: ctx.hasCollection || hasCollection, inModification: ctx.inModification, atInstantiationSite: ctx.atInstantiationSite };

    if ("collection_index" in node) {
        if (!ctx.hasCollection && !hasCollection) {
            errors.push(`${file}: ${path} has collection_index with no ancestor collection_name`);
        } else if (!ctx.atInstantiationSite) {
            errors.push(`${file}: ${path} declares collection_index on what looks like a root-level definition, not an instantiation site (an entry in a parent's controls) - the engine rejects this`);
        } else {
            const collectionName = hasCollection ? node.collection_name : ctx.collectionName;
            const key = `${collectionName}#${node.collection_index}`;
            if (!collisions.has(key)) collisions.set(key, []);
            collisions.get(key).push(path);
        }
    }
    if (node.type === "button") {
        const bindings = Array.isArray(node.bindings) ? node.bindings : [];
        if (!bindings.some(b => b && b.binding_type === "collection_details")) {
            errors.push(`${file}: ${path} is a button with no collection_details binding - it can't report a press`);
        }
    }

    for (const [key, value] of Object.entries(node)) {
        if (typeof value === "string" && MOLANG_FIELDS.has(key)) {
            if (/>=/.test(value)) errors.push(`${file}: ${path}.${key} uses ">=" - Molang bindings have no >= operator: "${value}"`);
            if (/''/.test(value)) errors.push(`${file}: ${path}.${key} has an empty string literal '' - confirmed to crash the client: "${value}"`);
            if (/\//.test(value) && KNOWN_STRING_PROPERTIES.some(p => value.includes(p))) {
                errors.push(`${file}: ${path}.${key} divides a string-valued property (${KNOWN_STRING_PROPERTIES.find(p => value.includes(p))}) - confirmed to crash the client: "${value}"`);
            }
            if (baseCtx.inModification && /\$[A-Za-z_]\w*/.test(value)) {
                errors.push(`${file}: ${path}.${key} uses a $variable inside a modifications subtree - these don't resolve there: "${value}"`);
            }
        }
        // Only the modifications key's own subtree counts as "inside a
        // modifications-injected subtree" - the rest of the file (its own
        // description block, etc.) isn't.
        const childCtx = key === "modifications" ? { ...baseCtx, inModification: true, parentKey: key } : { ...baseCtx, parentKey: key, collectionName: hasCollection ? node.collection_name : ctx.collectionName };
        walk(value, childCtx, `${path}.${key}`, errors, file, collisions);
    }
}

function lintJsonUi(map, label) {
    const errors = [];
    for (const rel of [...map.keys()]) {
        if (!rel.endsWith(".json") || !/(^|\/)ui\//.test(rel)) continue;
        let doc;
        try { doc = JSON.parse(map.get(rel).toString("utf8")); } catch (e) { continue; } // JSON validity is checkTree's job
        const collisions = new Map();
        walk(doc, { hasCollection: false, inModification: false, atInstantiationSite: false }, "$", errors, `${label}/${rel}`, collisions);
        for (const [key, paths] of collisions) {
            if (paths.length > 1) errors.push(`${label}/${rel}: collection_index collision on ${key} declared at ${paths.join(", ")} - these cells silently fight over the same real slot`);
        }
    }
    return errors;
}

module.exports = { lintJsonUi };
