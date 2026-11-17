import assert from "node:assert/strict";
import {
 chooseHuntGoal,goalCatalogCount,makeDiscoveryChain,makeCollectorRank,
 makeLivingAtlas,recommendPhotoPace
} from "../blackcell-the-hunt-engine.js";
const stats={
 media:{photos:9,pending:0},references:{verified:7},
 countries:[{code:"US",count:5}],branches:[{branch:"Army",count:5}],
 worlds:[{world:"military",count:5}],eras:[{era:"1990s",count:5}]
};
const goal={id:"g1",enabled:true,dimension:"country",value:"US",priority:5,target_count:5};
assert.equal(chooseHuntGoal([goal]).id,"g1");
assert.equal(chooseHuntGoal([],null),null);
assert.equal(goalCatalogCount(stats,goal),5);
const completed=makeDiscoveryChain(stats,goal,1);
assert.equal(completed.complete,true);
assert.deepEqual(completed.stages.map(s=>s.status),["done","done","done"]);
assert.equal(makeDiscoveryChain(stats,goal,0).complete,false);
assert.equal(makeDiscoveryChain(stats,goal,null).stages[2].status,"active");
assert.deepEqual(makeDiscoveryChain(stats,{...goal,target_count:8},1).stages.map(s=>s.status),["done","active","locked"]);
assert.equal(makeDiscoveryChain(stats,null,null).stages[0].status,"active");
assert.equal(makeCollectorRank(stats).level,2);
assert.equal(makeCollectorRank(stats).points,140);
assert.equal(makeCollectorRank({references:{verified:0}}).level,1);
assert.equal(makeLivingAtlas(stats).worldsRepresented,1);
assert.equal(makeLivingAtlas(stats).worlds.length,6);
const p={photo:{ready:true,daily:20}};
assert.equal(recommendPhotoPace(p,"focused").target,20);
assert.equal(recommendPhotoPace(p,"intense").target,25);
assert.equal(recommendPhotoPace(p,"steady").target,15);
assert.equal(recommendPhotoPace(p,"paused").ready,false);
assert.equal(recommendPhotoPace(null).ready,false);
console.log("The Hunt 2.0 progression tests passed.");
