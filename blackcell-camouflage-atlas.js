/* BLACKCELL Camouflage Atlas v1.
 * Original brief annotations, attribution and source links.
 * No third-party photographs or wholesale article copies.
 * Historical pattern use is not proof of a person's country or military service.
 */
export const SOURCES=Object.freeze({
 camopedia_world:{name:"Camopedia · International country index",url:"https://www.camopedia.org/index.php/Main_Page",kind:"historical reference",note:"Country-organized scholarly camouflage index; copyrighted source, link/attribute only."},
 camopedia_usa:{name:"Camopedia · United States",url:"https://www.camopedia.org/index.php/USA",kind:"national reference",note:"US pattern histories and variants. Confirm dates and use against current documents."},
 wiki:{name:"Wikipedia · Military camouflage patterns",url:"https://en.wikipedia.org/wiki/List_of_military_clothing_camouflage_patterns",kind:"cross-country index",note:"Pattern families and multinational usage; information requires corroboration."},
 militarymachine:{name:"Military Machine · 20 military patterns",url:"https://militarymachine.com/military-camouflage-patterns",kind:"overview",note:"Accessible overview, lower priority than official service and specialist material."}
});
export const PATTERNS=Object.freeze([
 {name:"Frogskin / M1942 reversible spot",family:"Spotted / reversible",origin:"US",uses:"United States, WWII, predominantly USMC; limited Army use",era:"1942 onwards",distinguish:"Reversible green-dominant and tan-dominant sides; distinguish from other spot camouflage using garments and provenance.",source:"camopedia_usa",status:"historical"},
 {name:"USMC Mitchell / Wine Leaf",family:"Leaf / cloud reversible",origin:"US",uses:"USMC covers and shelter halves, historical; variants appeared elsewhere",era:"1950s–1970s",distinguish:"Leaf and cloud sides of vintage helmet-cover/shelter patterns; not direct proof of USMC membership.",source:"camopedia_usa",status:"historical"},
 {name:"ERDL",family:"Woodland organic",origin:"US",uses:"United States and internationally copied variants; historical Vietnam-era use",era:"1960s onwards",distinguish:"Four-color organic forms and dark branches; other countries adopted derivative designs.",source:"camopedia_usa",status:"historical"},
 {name:"M81 Woodland",family:"Woodland organic",origin:"US",uses:"United States and numerous other national forces",era:"1981 onwards",distinguish:"Woodland shapes are widely copied and do not establish national origin.",source:"wiki",status:"international"},
 {name:"Six-color desert / chocolate chip",family:"Desert spotted",origin:"US",uses:"United States originally; variants widely used in other countries",era:"1980s onwards",distinguish:"Desert blotches with distinctive smaller black and white specks; lookalikes occur internationally.",source:"wiki",status:"shared"},
 {name:"Three-color Desert Camouflage Uniform",family:"Desert organic",origin:"US",uses:"United States and other countries with related patterns",era:"1990s onwards",distinguish:"Broad sand and brown patches; country assignment requires other cues.",source:"wiki",status:"shared"},
 {name:"Desert Night Camouflage",family:"Grid / night",origin:"US",uses:"U.S. desert-era overgarments; historical",era:"1990s",distinguish:"Unusual two-color grid pattern rather than standard daytime desert camouflage.",source:"camopedia_usa",status:"historical"},
 {name:"MARPAT",family:"Digital woodland / desert",origin:"US",uses:"U.S. Marine Corps; visual derivatives or variants in other countries",era:"2000s onwards",distinguish:"Digital pattern alone is insufficient; check USMC eagle-globe-anchor motifs and name tapes.",source:"wiki",status:"lookalike"},
 {name:"Universal Camouflage Pattern (UCP)",family:"Digital multiterrain",origin:"US",uses:"U.S. Army; historical",era:"2000s–2010s",distinguish:"Muted grey/green digital pixel fields; distinct from MARPAT and modern OCP.",source:"militarymachine",status:"historical"},
 {name:"MultiCam",family:"Multiterrain",origin:"US",uses:"Many militaries and commercial users globally",era:"2000s onwards",distinguish:"Shared multi-terrain commercial family; not identical to every nation's derivative.",source:"wiki",status:"shared"},
 {name:"Operational Camouflage Pattern (OCP)",family:"Multiterrain",origin:"US",uses:"U.S. Army and Air Force, with history of similar patterns elsewhere",era:"2010s onwards",distinguish:"Related to MultiCam family but a distinct pattern/designation; inspect named uniform and insignia.",source:"militarymachine",status:"lookalike"},
 {name:"AOR-1 / NWU Type II",family:"Digital arid",origin:"US",uses:"U.S. Navy specialized communities",era:"2010 onwards",distinguish:"Arid naval digital field; must not be conflated with Marine Corps desert MARPAT.",source:"wiki",status:"lookalike"},
 {name:"AOR-2 / NWU Type III",family:"Digital woodland",origin:"US",uses:"U.S. Navy",era:"2010 onwards",distinguish:"Naval woodland digital; patch and uniform design matter because of similarity to MARPAT.",source:"wiki",status:"lookalike"},
 {name:"CADPAT TW / AR / MT",family:"Digital multienvironment",origin:"CA",uses:"Canadian Armed Forces",era:"1990s onwards",distinguish:"Canadian family of temperate, arid and multiterrain patterns; resembles other pixel designs.",source:"wiki",status:"lookalike"},
 {name:"DPM",family:"Woodland disruptive",origin:"GB",uses:"United Kingdom and multiple other militaries",era:"1960s onwards",distinguish:"British disruptive family broadly copied; independent origin verification needed.",source:"wiki",status:"shared"},
 {name:"Multi-Terrain Pattern (MTP)",family:"Multiterrain",origin:"GB",uses:"United Kingdom",era:"2010s onwards",distinguish:"British pattern influenced by DPM and multiterrain designs; can resemble MultiCam.",source:"wiki",status:"lookalike"},
 {name:"Flecktarn",family:"Spotted woodland",origin:"DE",uses:"Germany and various derivatives",era:"1990s onwards",distinguish:"Dense overlapping spots; derivative spot camouflage is not automatically German.",source:"militarymachine",status:"shared"},
 {name:"Tropentarn",family:"Spotted desert",origin:"DE",uses:"German Bundeswehr, historical Danish use",era:"1990s onwards",distinguish:"Three-color desert member of Flecktarn family; confirm national markings.",source:"wiki",status:"shared"},
 {name:"EMR / Digital Flora",family:"Digital woodland",origin:"RU",uses:"Russia",era:"2000s onwards",distinguish:"Russian digital family, with local variations; don't assume country from pixels alone.",source:"wiki",status:"lookalike"},
 {name:"Wz.93 Pantera",family:"Woodland",origin:"PL",uses:"Poland",era:"1990s onwards",distinguish:"Polish woodland pattern family; verify insignia, patches and garment details.",source:"militarymachine",status:"regional"},
 {name:"M90 Splinter",family:"Geometric splinter",origin:"SE",uses:"Sweden",era:"1990s onwards",distinguish:"Angular broad geometric blocks; distinctive but adapted versions may exist.",source:"militarymachine",status:"regional"},
 {name:"M05",family:"Woodland / winter",origin:"FI",uses:"Finland",era:"2000s onwards",distinguish:"Finnish modern digital/organic derivatives and winter variations require careful scene comparison.",source:"militarymachine",status:"regional"},
 {name:"Australian Multicam Camouflage Uniform (AMCU)",family:"Multiterrain",origin:"AU",uses:"Australian Defence Force",era:"2010s onwards",distinguish:"Australia's multiterrain derivative; similar-looking pattern to MultiCam/OCP but different designation.",source:"wiki",status:"lookalike"},
 {name:"Tigerstripe variants",family:"Striped woodland",origin:"multiple",uses:"Vietnam-era variants, United States specialty personnel, Southeast Asia and commercial designs",era:"1960s onwards",distinguish:"Many different national and commercial tigerstripe fabrics; not a single fixed country.",source:"camopedia_world",status:"shared"},
 {name:"Singapore No. 4 digital camouflage",family:"Digital",origin:"SG",uses:"Singapore Armed Forces",era:"2000s onwards",distinguish:"Modern Singapore digital scheme sometimes described as semi-MARPAT; requires national context.",source:"wiki",status:"lookalike"}
]);
export const WORLD_DIRECTORY=Object.freeze([
 {name:"Global country and region index",source:"camopedia_world"},
 {name:"United States historical pattern catalog",source:"camopedia_usa"},
 {name:"Cross-country patterns and users",source:"wiki"},
 {name:"Pattern introduction and broad overview",source:"militarymachine"}
]);
