// Proof that arbitrary/obscure TypeScript syntax genuinely compiles and
// runs correctly through MinUI's real pipeline (real tsc, no custom parser,
// no restricted subset) - exercises generics, decorators, enums, private
// class fields, optional chaining/nullish coalescing, template literal
// types, discriminated unions, async/await, satisfies, and namespaces, all
// feeding into a real JSX screen's actual values.
import * as MinUI from "../../jsx-runtime.js";
import { Screen, Panel, Text } from "../../components/screen.js";

// Decorators (require experimentalDecorators).
function loud(_target: any, _key: string, descriptor: PropertyDescriptor) {
    const orig = descriptor.value;
    descriptor.value = function (this: unknown, ...args: unknown[]) { return String(orig.apply(this, args)).toUpperCase(); };
    return descriptor;
}

// Generics + a discriminated union.
type Result<T> = { kind: "ok"; value: T } | { kind: "err"; message: string };
function unwrap<T>(r: Result<T>, fallback: T): T { return r.kind === "ok" ? r.value : fallback; }

// Enum.
enum Rarity { Common, Rare, Legendary }

// Namespace.
namespace Labels {
    export const forRarity: Record<Rarity, string> = { [Rarity.Common]: "Common", [Rarity.Rare]: "Rare", [Rarity.Legendary]: "Legendary" };
}

// Template literal type + `satisfies`.
type ScreenId = `screen_${string}`;
const HOME_ID = "home" satisfies string as ScreenId extends `screen_${infer _}` ? string : never;

// Class with private fields + a decorated method.
class Greeter {
    #name: string;
    constructor(name: string) { this.#name = name; }
    @loud
    greet(): string { return `hello, ${this.#name}`; }
}

class Data {
    static compute(input: { count?: number } | null): number {
        // optional chaining + nullish coalescing
        return (input?.count ?? 0) + 1;
    }
}

async function loadTitle(): Promise<string> {
    const g = new Greeter("world");
    await Promise.resolve();
    return unwrap<string>({ kind: "ok", value: g.greet() }, "fallback");
}

const rarityLabel = Labels.forRarity[Rarity.Legendary];
const count = Data.compute({ count: 4 });

export default (
    <Screen id={HOME_ID as unknown as string} data="obscure">
        <Panel>
            <Text>{`${rarityLabel} x${count}`}</Text>
        </Panel>
    </Screen>
);

export { loadTitle, Greeter, Data, rarityLabel, count };
