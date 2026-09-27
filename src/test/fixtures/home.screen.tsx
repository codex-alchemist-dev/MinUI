// OR-Track D2's real pilot proof: a faithful port of Claude Waifus'
// PATCHES/ui/home.ui.html into the new JSX authoring format, to confirm the
// new authoring surface compiles to equivalent JSON UI through the
// SAME, unchanged, proven lib/compile.js backend a real .ui.html file
// already goes through - not a synthetic toy example.
import * as MinUI from "../../jsx-runtime.js";
import { Screen, Panel, Column, Row, Text, Image, Spacer, Button } from "../../components/screen.js";

export default (
    <Screen id="home" data="home">
        <Panel class="window wide">
            <Column class="content">
                <Row class="line" style="height: 15">
                    <Text class="title" style="width: fill">{"{t:cw.ui.home.title}"}</Text>
                    <Text class="dim" style="width: 150; text-align: right; height: 15">{"{count}/{max}  -  {summoned} {t:cw.ui.summoned_lower}"}</Text>
                </Row>
                <Image src="textures/ui/cw/divider" class="divider" />
                <Spacer style="height: 2" />
                <Row class="line" style="height: 18">
                    <Button class="half primary" on:press="open(roster)"><Text class="dark-text center">{"{t:cw.ui.home.roster}"}</Text></Button>
                    <Button class="half primary" on:press="open(summon)"><Text class="dark-text center">{"{t:cw.ui.home.summon_new}"}</Text></Button>
                </Row>
                <Row class="line" style="height: 18">
                    <Button class="half" on:press="open(squads)"><Text class="center">{"{t:cw.ui.home.squads} ({squads})"}</Text></Button>
                    <Button class="half" on:press="surround"><Text class="center">{"{t:cw.ui.home.surround}"}</Text></Button>
                </Row>
                <Button class="menu" on:press="close"><Text class="center">{"{t:cw.ui.close}"}</Text></Button>
                <Text class="dim center">{"{t:cw.ui.home.tip}"}</Text>
            </Column>
        </Panel>
    </Screen>
);
