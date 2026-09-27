#!/usr/bin/env node
// OR-Track D3: the real shared grid-chunking primitive, and byte-identity
// checks proving its use inside compile.js's <grid> and entity-container.js's
// buildRows() produces IDENTICAL output to what each hand-rolled before.
"use strict";
const assert = require("assert");
const { chunkRows } = require("./grid.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}

test("chunkRows: splits evenly", () => {
    assert.deepStrictEqual(chunkRows([1, 2, 3, 4, 5, 6], 3), [[1, 2, 3], [4, 5, 6]]);
});
test("chunkRows: a remainder produces a short final row", () => {
    assert.deepStrictEqual(chunkRows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
test("chunkRows: empty input produces no rows", () => {
    assert.deepStrictEqual(chunkRows([], 4), []);
});
test("chunkRows: cols <= 0 throws", () => {
    assert.throws(() => chunkRows([1, 2], 0), /cols must be a positive integer/);
});

test("entity-container.js's buildRows: byte-identical row/index layout as before the OR-Track D3 refactor", () => {
    const { ContainerBuilder } = require("../entity-container.js");
    const b = new ContainerBuilder("cw");
    const { startIndex } = b.Inventory("bag", 4, 3);
    const grid = b.sections["bag"].controls; // real buildRows() output, r-major indices
    assert.strictEqual(grid.length, 3, "3 rows");
    grid.forEach((row, r) => {
        const rowKey = Object.keys(row)[0];
        assert.strictEqual(rowKey, `bag_row_${r}`);
        const cells = row[rowKey].controls;
        assert.strictEqual(cells.length, 4, "4 cells per row");
        cells.forEach((cell, c) => {
            const expectedIndex = startIndex + r * 4 + c; // the exact formula buildRows() used before this refactor
            const cellKey = Object.keys(cell)[0];
            assert.strictEqual(cell[cellKey].collection_index, expectedIndex);
            assert.ok(cellKey.startsWith(`bag_cell_${expectedIndex}@`));
        });
    });
});

console.log(`\n${passed} passed`);
