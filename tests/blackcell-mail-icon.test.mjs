import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('approved artwork is preserved in the optimized icon asset',()=>{
 const data=read('blackcell-mail-icon.svg').match(/base64,([A-Za-z0-9+/=]+)/)[1];
 let hash=0;for(const ch of data)hash=(Math.imul(hash,31)+ch.charCodeAt(0))>>>0;
 assert.equal(hash,3108993526);
 const bytes=Buffer.from(data,'base64');assert.equal(bytes.length,3166);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
});
test('shared icon renders in OS, App Store, home, dock and Mail header',()=>{
 assert.match(read('blackcell-os.js'),/"artwork":"blackcell-mail-icon.svg/);
 assert.match(read('blackcell-os.js'),/image.setAttribute\('href',app.artwork\)/);
 assert.match(read('blackcell-os.js'),/icon:t.querySelector\('svg'\)/);
 assert.match(read('blackcell-app-store.js'),/app.icon.cloneNode\(true\)/);
 for(const p of ['blackcell-os-unified-home.js','blackcell-os-springboard.js'])assert.match(read(p),/child.cloneNode\(true\)/);
 assert.match(read('blackcell-mail.html'),/<img class="logo" src="blackcell-mail-icon.svg/);
 assert.match(read('blackcell-os.html'),/blackcell-mail-icon.css\?v=1/);
 assert.match(read('blackcell-member-preview.js'),/data:image/);
});
