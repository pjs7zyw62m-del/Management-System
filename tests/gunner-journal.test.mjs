import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const backend=readFileSync("supabase/functions/blackcell-military-gunner/index.ts","utf8");
const gunner=readFileSync("military-gunner.js","utf8");
const migration=readFileSync("supabase/migrations/20261117_gunner_private_journal_memory.sql","utf8");

test("Private journal is protected by verified owner access",()=>{
 assert.match(migration,/enable row level security/i);
 assert.match(migration,/grant select .* authenticated/i);
 assert.match(migration,/revoke all .* public,anon,authenticated/i);
 assert.match(migration,/corp_private\.social_verified\(\)/);
 assert.match(migration,/m\.role='owner' and m\.clearance_level=7/);
 assert.match(migration,/security invoker/i);
 assert.match(migration,/grant execute .* authenticated/i);
});

test("Gunner only gets relevant excerpts, never the full archive",()=>{
 assert.match(backend,/blackcell_gunner_journal_recall/);
 assert.match(backend,/p_limit:entryNo\?1:2/);
 assert.match(backend,/\.slice\(0,400\)/);
 assert.match(backend,/PRIVATE FICTIONAL JOURNAL EXCERPT/);
 assert.match(backend,/NOT a real historical record/);
});

test("Original Dolphin personality and real stats are preserved",()=>{
 assert.match(backend,/blackcell-gunner-dolphin/);
 assert.match(backend,/blackcell_gunner_collection_stats/);
 assert.match(backend,/Modern upload counts and quotas must come from verified live BLACKCELL stats/);
 assert.match(backend,/corp_social_gunner_messages/);
});

test("UI uses authenticated backend and a prompt-only journal control",()=>{
 assert.match(gunner,/bcGunnerJournal/);
 assert.match(gunner,/blackcell-military-gunner/);
 assert.doesNotMatch(gunner,/The county veterans' hall smelled/);
 assert.match(gunner,/private fictional 1999 journal/);
});
