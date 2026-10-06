// Packed numeric channel for fast HUDs (see lib/compile/hudPositioning.js for the client-side slicing):
// every number is a fixed-width zero-padded integer, so one title carries a whole cursor/rectangle update.
export const NUM_WIDTH = 4;
export const MAX_NUM = 9999;

export function packNumbers(values) {
    let out = "";
    for (const v of values) {
        const n = Math.max(0, Math.min(MAX_NUM, Math.round(Number(v) || 0)));
        out += String(n).padStart(NUM_WIDTH, "0");
    }
    return out;
}

export function unpackNumbers(text, count) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(Number(text.slice(i * NUM_WIDTH, (i + 1) * NUM_WIDTH)));
    return out;
}
