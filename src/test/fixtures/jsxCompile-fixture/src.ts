// A genuinely real TypeScript source using a construct plain JS doesn't
// have (a real enum) - proof `compileWithRealTsc` runs the REAL compiler,
// not a JS-only passthrough.
export enum Answer { Value = 42 }
export const RESULT: number = Answer.Value;
