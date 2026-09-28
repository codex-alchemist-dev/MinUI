// The pure expression-evaluation engine behind MinUI's `{path | filter}`
// templates: interprets the plain-JSON AST lib/markup.js's parseExpr()
// produces (no eval(), no Bedrock imports) - kept in its own module,
// separate from runtime.js's Bedrock-specific form/HUD glue, specifically
// so it's testable in plain Node without mocking @minecraft/server. A real
// ES module (like runtime.js itself) since that's what Minecraft's script
// engine actually loads - test files use a dynamic import() to reach it
// from Node's CommonJS side.

const FILTERS = {
    len: v => (Array.isArray(v) || typeof v === "string" ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0),
    int: v => Math.trunc(Number(v) || 0),
    round: v => Math.round(Number(v) || 0),
    pct: v => `${Math.round((Number(v) || 0) * 100)}%`,
    upper: v => String(v ?? "").toUpperCase(),
    lower: v => String(v ?? "").toLowerCase(),
    default: (v, d) => (v === undefined || v === null || v === "" ? d : v),
    fixed: (v, n) => (Number(v) || 0).toFixed(Number(n) || 0),
    clamp: (v, lo, hi) => Math.min(Number(hi), Math.max(Number(lo), Number(v) || 0)),
    // One page of a list: each="c in characters | page:state.page:10"
    page: (v, p, size) => {
        const n = Number(size) || 10, k = Number(p) || 0;
        return Array.isArray(v) ? v.slice(k * n, (k + 1) * n) : [];
    },
    pages: (v, size) => Math.max(1, Math.ceil((Array.isArray(v) ? v.length : 0) / (Number(size) || 10))),
    // Shortens to n characters with "..." - labels have a fixed height, so an
    // over-long value would otherwise wrap into the line below.
    trunc: (v, n) => { const s = String(v ?? ""); const k = Number(n) || 12; return s.length > k ? `${s.slice(0, Math.max(1, k - 2))}..` : s; },
};

// A project can add its own `{path | myFilter:arg}` filters (e.g. a
// species-name lookup, a rarity-star renderer) without touching runtime.js
// itself - matches the register*() convention already used for
// providers/handlers/actions. Refusing to shadow a built-in filter name is
// deliberate: a project silently redefining `int`/`pct`/etc. would be an
// easy-to-miss source of confusing bugs elsewhere in the same screen set.
export function registerFilter(name, fn) {
    if (name in FILTERS) throw new Error(`registerFilter("${name}"): a built-in filter already has this name - pick a different one`);
    FILTERS[name] = fn;
}

export function evaluate(ast, env) {
    switch (ast[0]) {
        case "num": case "str": case "bool": return ast[1];
        case "null": return null;
        case "path": {
            let v = env;
            for (const seg of ast[1]) {
                const key = typeof seg === "string" ? seg : evaluate(seg, env);
                if (v === undefined || v === null) return undefined;
                v = v[key];
            }
            return v;
        }
        case "not": return !evaluate(ast[1], env);
        case "neg": return -evaluate(ast[1], env);
        case "bin": {
            const op = ast[1];
            if (op === "&&") return evaluate(ast[2], env) && evaluate(ast[3], env);
            if (op === "||") return evaluate(ast[2], env) || evaluate(ast[3], env);
            const a = evaluate(ast[2], env), b = evaluate(ast[3], env);
            switch (op) {
                case "+": return (typeof a === "string" || typeof b === "string") ? `${a ?? ""}${b ?? ""}` : (a ?? 0) + (b ?? 0);
                case "-": return a - b;
                case "*": return a * b;
                case "/": return b ? a / b : 0;
                case "%": return b ? a % b : 0;
                case "==": return a == b; // eslint-disable-line eqeqeq
                case "!=": return a != b; // eslint-disable-line eqeqeq
                case ">": return a > b;
                case "<": return a < b;
                case ">=": return a >= b;
                case "<=": return a <= b;
                default: return undefined;
            }
        }
        case "filter": {
            const fn = FILTERS[ast[1]];
            const v = evaluate(ast[2], env);
            return fn ? fn(v, ...ast[3].map(a => evaluate(a, env))) : v;
        }
        default: return undefined;
    }
}

export function withLoops(env, loops) {
    if (!loops?.length) return env;
    const scoped = Object.create(env);
    for (const [name, listAst, index, indexName] of loops) {
        const list = evaluate(listAst, scoped);
        scoped[name] = Array.isArray(list) ? list[index] : undefined;
        if (indexName) scoped[indexName] = index;
    }
    return scoped;
}

export { FILTERS };
