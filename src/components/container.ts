// MinUI's JSX component model for container (chest-style) screens
// (OR-Track D2), bridging declarative JSX onto lib/entity-container.js's
// existing, proven, in-game-verified ContainerBuilder - a genuinely
// different, imperative backend from screen.ts's declarative tree (there is
// no ContainerBuilder tree to build, only a sequence of method calls that
// allocate real container_items/horse_equip_items slots as they run).
//
// The bridge: Slot()/Equip()/LockedButton() don't call the builder directly
// (there is no builder instance yet when a JSX child expression evaluates -
// JSX evaluates depth-first, children before parent). Each one instead
// returns a small descriptor object; ContainerScreen(), as the parent,
// walks its own children array (which JSX has already evaluated into that
// descriptor list) and replays each one as the real builder call it
// describes, in the order they were written - preserving Inventory()/
// Equipment()/Button()'s existing sequential-allocation behavior exactly.
"use strict";
import entityContainer = require("../../lib/entity-container.js");
const { ContainerBuilder, validateContainerContract } = entityContainer;
type ContainerBuilder = InstanceType<typeof ContainerBuilder>;

type SlotDescriptor = { kind: "slot"; label: string; cols: number; rows: number; opts: Record<string, unknown> };
type EquipDescriptor = { kind: "equip"; label: string; cols: number; rows: number; opts: Record<string, unknown> };
type ButtonDescriptor = { kind: "button"; label: string; opts: Record<string, unknown> };
type ContainerChild = SlotDescriptor | EquipDescriptor | ButtonDescriptor;

export interface SlotProps {
    label: string;
    cols?: number;
    rows?: number;
    offset?: [number, number];
    acceptedItems?: string[];
    cellSize?: number;
    attachTo?: string;
}
/** A real Inventory() section - bulk storage backed by container_items. */
export function Slot(props: SlotProps): SlotDescriptor {
    const { label, cols = 1, rows = 1, ...opts } = props;
    return { kind: "slot", label, cols, rows, opts };
}

export interface EquipProps {
    label: string;
    cols?: number;
    rows?: number;
    item?: string;
    offset?: [number, number];
    acceptedItems?: string[];
    startAt?: number;
    cellSize?: number;
    attachTo?: string;
}
/** A real Equipment() section - exactly one item per slot, backed by horse_equip_items. */
export function Equip(props: EquipProps): EquipDescriptor {
    const { label, cols = 1, rows = 1, ...opts } = props;
    return { kind: "equip", label, cols, rows, opts };
}

export interface LockedButtonProps {
    label: string;
    text?: string;
    offset?: [number, number];
    width?: number;
    height?: number;
    item?: string;
    acceptedItems?: string[];
    force?: boolean;
    attachTo?: string;
}
/** A real Button() - a proper button (art + label), not a bare item icon. */
export function LockedButton(props: LockedButtonProps): ButtonDescriptor {
    const { label, ...opts } = props;
    return { kind: "button", label, opts };
}

export interface ContainerScreenProps {
    namespace: string;
    equipCollection?: string;
    reservedEquipSlots?: number;
    /** Checked at build time via validateContainerContract() (OR-Track D5) once the whole tree replays. */
    declaredInventorySize?: number;
    children?: unknown;
}

/**
 * Replays its children (Slot()/Equip()/LockedButton() descriptors, in the
 * order they were written) as real ContainerBuilder calls, then runs
 * validateContainerContract() over the finished builder - the same
 * structural check entity-container.js already exposes, now reachable from
 * a declarative screen instead of only from hand-written imperative code.
 */
export function ContainerScreen(props: ContainerScreenProps): ContainerBuilder {
    const { namespace, equipCollection, reservedEquipSlots, declaredInventorySize, children } = props;
    const builder = new ContainerBuilder(namespace, { equipCollection, reservedEquipSlots });
    const items = ([] as unknown[]).concat(children ?? []).flat(Infinity).filter(Boolean) as ContainerChild[];
    for (const item of items) {
        if (item.kind === "slot") builder.Inventory(item.label, item.cols, item.rows, item.opts);
        else if (item.kind === "equip") builder.Equipment(item.label, item.cols, item.rows, item.opts);
        else if (item.kind === "button") builder.Button(item.label, item.opts);
        else throw new Error(`MinUI ContainerScreen: unknown child descriptor ${JSON.stringify(item)}`);
    }
    if (declaredInventorySize !== undefined) {
        const issues: { issue: string; runtimeVerified: boolean }[] = validateContainerContract(builder, { declaredInventorySize });
        if (issues.length) throw new Error(`MinUI ContainerScreen "${namespace}": ${issues.map(i => i.issue).join("; ")}`);
    }
    return builder;
}
