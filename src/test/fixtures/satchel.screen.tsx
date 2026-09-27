// OR-Track D2 proof for the container-screen half: a real ContainerScreen
// authored with actual JSX syntax (not plain function calls), replayed onto
// the real, proven ContainerBuilder via the descriptor-replay bridge in
// src/components/container.ts.
import * as MinUI from "../../jsx-runtime.js";
import { ContainerScreen, Slot, Equip, LockedButton } from "../../components/container.js";

export default (
    <ContainerScreen namespace="cw" declaredInventorySize={40}>
        <Slot label="bag" cols={6} rows={4} />
        <Equip label="equip" cols={2} rows={3} item="minecraft:leather_boots" />
        <LockedButton label="confirm" text="Confirm" />
    </ContainerScreen>
);
