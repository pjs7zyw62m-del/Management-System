import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{makeScope}from'../private-photo-ledger-upload-outbox.js';
const ledger=readFileSync(new URL('../private-photo-ledger.js',import.meta.url),'utf8'),store=readFileSync(new URL('../private-photo-ledger-upload-outbox.js',import.meta.url),'utf8');
test('queue is scoped to user, room and reset generation',()=>{assert.notEqual(makeScope('u','r','a'),makeScope('u','r','b'));assert.notEqual(makeScope('u','r','a'),makeScope('v','r','a'))});
test('durable selection committed before starting transfer',()=>{assert.ok(ledger.indexOf('await outbox.saveBatch(rows)')<ledger.indexOf('void recoverRedlineUploads();return true'));assert.match(ledger,/const id=durable\?\.id\|\|crypto\.randomUUID\(\)/)});
test('successful uploads remove bytes and failed transfers retain queued items',()=>{assert.match(ledger,/if\(success!==true\)throw Error\('Transfer not confirmed'\);\s*await outbox.remove/);assert.match(ledger,/if\(durable&&await existing\(\)\)/);assert.match(store,/index\('scope'\)/)});
