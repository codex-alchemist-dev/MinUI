// The one real shared grid-layout primitive between lib/compile.js's
// <grid> tag and lib/entity-container.js's Inventory()/Equipment(): given a
// flat sequence, chunk it into rows of `cols` items. Both files
// independently hand-rolled this identical loop before this extraction
// (OR-Track D3).
//
// row/column's one-axis stacking is native Bedrock stack_panel layout, not
// something this module touches or replaces - a full CSS-flexbox solver was
// considered and rejected for that reason (see the OR-Track D3 discussion
// in happy-wibbling-pie.md): stack_panel already handles one-axis flow
// correctly, so reimplementing it would replace working, native-backed
// layout with custom math for no functional gain. This module is scoped to
// the one thing that actually was duplicated: cols x rows grid chunking.
"use strict";

function chunkRows(items, cols) {
    if (!(Number.isInteger(cols) && cols > 0)) throw new Error(`chunkRows: cols must be a positive integer, got ${cols}`);
    const rows = [];
    for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
    return rows;
}

module.exports = { chunkRows };
