// Proves the new <switch>/<case>/<default>/<animate> compile.js elements
// are reachable from the JSX authoring layer (OR-Track D2), not just .ui.html.
import * as MinUI from "../../jsx-runtime.js";
import { Screen, Panel, Text, Switch, Case, Default, Animate } from "../../components/screen.js";

export default (
    <Screen id="rarity_demo">
        <Panel>
            <Switch on="c.rarity">
                <Case value="legendary">
                    <Text>{"Legendary"}</Text>
                    <Animate type="color" duration="0.3" easing="out_quad" from="[1,1,1]" to="[1,0.8,0]" />
                </Case>
                <Case value="rare">
                    <Text>{"Rare"}</Text>
                </Case>
                <Default>
                    <Text>{"Common"}</Text>
                </Default>
            </Switch>
        </Panel>
    </Screen>
);
