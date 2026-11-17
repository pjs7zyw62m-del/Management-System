import assert from "node:assert/strict";
import {
 HUNT_RESUME_SECTIONS,normalizeHuntSession,makeReturnDelta,nextHuntStep,
 makeHuntBrief,suggestHuntWorlds
} from "../blackcell-the-hunt-retention.js";
const stats={media:{total:18,pending:0,missing_country:4,missing_branch:2},
 references:{verified:3},countries:[{code:"US",count:4}],
 branches:[{branch:"Army",count:4}],worlds:[{world:"military",count:4}],
 eras:[{era:"1980s",count:4}]};
const goal={id:"a",enabled:true,priority:5,dimension:"country",value:"US",target_count:7};
const v={goalId:"a",section:"#scout",seen:{total:13,verified:2},savedAt:123};
assert.equal(normalizeHuntSession(v,[goal]).goalId,"a");
assert.equal(normalizeHuntSession(v,[goal]).section,"#scout");
assert.equal(normalizeHuntSession({...v,section:"javascript:evil"},[goal]).section,"#discovery");
assert.equal(normalizeHuntSession({...v,goalId:"another"},[goal]).goalId,"");
assert.equal(normalizeHuntSession({...v,seen:{total:-4,verified:0}},[goal]).seen,null);
assert.equal(makeReturnDelta(stats,v.seen).catalog,5);
assert.equal(makeReturnDelta(stats,v.seen).verified,1);
assert.equal(makeReturnDelta(stats,null).available,false);
assert.equal(nextHuntStep(stats,null,null).stage,"goal");
assert.equal(nextHuntStep(stats,goal,0).stage,"research");
const achieved={...goal,target_count:4};
assert.equal(nextHuntStep(stats,achieved,0).stage,"verify");
assert.equal(nextHuntStep(stats,achieved,null).stage,"verify");
assert.equal(nextHuntStep(stats,achieved,1).stage,"complete");
assert.equal(makeHuntBrief({...stats,media:{...stats.media,pending:2}},[goal],"a",0).priorityLabel,"OPEN APPROVAL QUEUE");
assert.equal(makeHuntBrief(stats,[goal],"a",0).goal.id,"a");
assert.equal(suggestHuntWorlds(stats).length,3);
assert.equal(suggestHuntWorlds(stats,7).length,6);
assert.ok(suggestHuntWorlds(stats).every(x=>x.query.includes("uniform")));
assert.ok(HUNT_RESUME_SECTIONS.includes("#research-next"));
console.log("The Hunt 3.0 retention tests passed.");
