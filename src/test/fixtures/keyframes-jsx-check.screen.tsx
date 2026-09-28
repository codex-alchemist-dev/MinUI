import * as MinUI from "../../jsx-runtime.js";
import { Screen, Panel, Image, Keyframes, Key } from "../../components/screen.js";

export default (
    <Screen id="kf_demo">
        <Panel>
            <Image src="a">
                <Keyframes property="offset" duration={0.6} loop curve="catmull-rom" steps={6}>
                    <Key at={0} value="[0,0]" />
                    <Key at={0.5} value="[10,-20]" />
                    <Key at={1} value="[20,0]" />
                </Keyframes>
            </Image>
        </Panel>
    </Screen>
);
