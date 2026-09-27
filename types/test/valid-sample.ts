// A realistic mod content script, written in TypeScript, importing MinUI's
// real runtime modules by relative path exactly as a real project would.
// TypeScript resolves the adjacent .d.ts file for each automatically - no
// bundler, no MinUI build step involved. This file is expected to
// type-check with ZERO errors (see run.js); invalid-sample.ts is its
// deliberately-broken counterpart, proving these types actually catch
// real mistakes rather than silently accepting anything.
import type { Player } from "@minecraft/server";
import { registerUiProvider, registerUiHandler, registerUiAction, openScreen, confirm, askText, askChoice, dialogue, choose } from "../../runtime/runtime.js";
import { registerHudProvider, showToast, isHudEnabled, setHudEnabled } from "../../runtime/hud.js";
import { openContainer, markerItem, giveBack, type ContainerHandle } from "../../runtime/container.js";
import { getPlayerLanguage, setPlayerLanguage, listLanguages } from "../../runtime/i18n.js";
import { registerControlItem, setControlItems } from "../../runtime/controlItems.js";

registerUiProvider("roster", (player: Player, params, state) => {
    return { level: 5, name: player.name };
});

registerUiHandler("summon", async function (this, player: Player, speciesId: unknown) {
    const ok = await confirm(player, { title: "Summon?", body: `Summon ${String(speciesId)}?`, yes: "Yes", no: "No" });
    if (!ok) return { flash: "Cancelled" };
    return { open: ["roster"] };
});

registerUiAction("rename", async (player: Player) => {
    const name = await askText(player, { title: "Rename", label: "New name" });
    if (name === null) return;
    return `Renamed to ${name}`;
});

registerHudProvider("squadBar", (player: Player) => ({ hp: 42 }));

async function demo(player: Player) {
    openScreen(player, "home");
    const picked = await choose(player, "confirm", "Sure?");
    const index = await askChoice(player, { title: "Pick one", options: ["a", "b"] });
    const line = await dialogue(player, { name: "Yuki", text: "Hello!", choices: ["Hi", "Bye"] });
    showToast(player, "Welcome!", "textures/ui/icon");
    const enabled = isHudEnabled(player, "squadBar");
    setHudEnabled(player, "squadBar", !enabled);

    const lang = getPlayerLanguage(player);
    setPlayerLanguage(player, lang ?? "en_US");
    const langs = listLanguages();
    console.log(langs.map(l => l.name));

    const marker = markerItem("cw:marker", "Summon", ["A soul"]);
    const handle: ContainerHandle = openContainer(player, {
        title: "Bag",
        size: 27,
        slots: [marker],
        locked: [0],
        onSync(items, h) { giveBack(player, items[1]!); },
        onPress(slot, h) { h.close(); },
    });
    handle.set(1, undefined);

    registerControlItem("cw:tool", p => showToast(p, "used!"));
    setControlItems(player, { 1: "cw:tool" });

    void picked;
    void index;
    void line;
}
void demo;
