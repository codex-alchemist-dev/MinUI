// Hand-written type declarations for container.js - see runtime.d.ts's
// own header comment for the authoring-layer-only rationale (OR-Track D2).
// startContainers() is engine-internal bootstrap, left untyped/unexported
// here on purpose.
import type { Player, ItemStack, Entity } from "@minecraft/server";

export interface ContainerHandle {
    readonly entity: Entity;
    readonly player: Player;
    set(slot: number, item: ItemStack | undefined): void;
    setAll(items: Array<ItemStack | undefined>): void;
    items(): Array<ItemStack | undefined>;
    close(): void;
}

export interface ContainerSpec {
    title?: string;
    /** Defaults to the standard satchel entity - must be a type container.js's own TYPES set knows about. */
    entityType?: string;
    /** Defaults to 27 - must match entityType's own inventory_size. */
    size?: number;
    slots?: Array<ItemStack | undefined>;
    /** Slot indices treated as buttons/fillers - restored the instant anything moves them. */
    locked?: number[];
    /** Unlocked slots changed since the last sync. */
    onSync?: (items: Array<ItemStack | undefined>, handle: ContainerHandle) => void;
    /** A locked slot was clicked. */
    onPress?: (slot: number, handle: ContainerHandle) => void;
    isValid?: () => boolean;
    onClose?: (handle: ContainerHandle) => void;
}

/** A locked-slot "button" item - swept from every player's inventory/cursor wherever it ends up. */
export function markerItem(typeId: string, name: string, lore?: string[]): ItemStack;
/** Returns `item` to the player's real inventory (or drops it at their feet if it's full). */
export function giveBack(player: Player, item: ItemStack): void;
export function isContainerOpen(player: Player): boolean;
export function closeContainer(player: Player): void;
/** Places a satchel entity where the player is looking; their next right-click opens it as a real chest screen. */
export function openContainer(player: Player, spec: ContainerSpec): ContainerHandle;
