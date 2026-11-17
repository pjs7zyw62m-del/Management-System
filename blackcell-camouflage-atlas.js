/* BLACKCELL Camouflage Atlas v1.
 * Original brief annotations, attribution and source links.
 * No third-party photographs or wholesale article copies.
 * Historical pattern use is not proof of a person's country or military service.
 */
export const SOURCES=Object.freeze({
 camopedia_world:{name:"Camopedia · International country index",url:"https://www.camopedia.org/index.php/Main_Page",kind:"historical reference",note:"Country-organized scholarly camouflage index; copyrighted source, link/attribute only."},
 camopedia_usa:{name:"Camopedia · United States",url:"https://www.camopedia.org/index.php/USA",kind:"national reference",note:"US pattern histories and variants. Confirm dates and use against current documents."},
 wiki:{name:"Wikipedia · Military camouflage patterns",url:"https://en.wikipedia.org/wiki/List_of_military_clothing_camouflage_patterns",kind:"cross-country index",note:"Pattern families and multinational usage; information requires corroboration."},
 militarymachine:{name:"Military Machine · 20 military patterns",url:"https://militarymachine.com/military-camouflage-patterns",kind:"overview",note:"Accessible overview; cross-check claims against Camopedia and primary records."},
 epochs:{name:"Epochs · Field Guide to Camouflage",url:"https://epochs.co/features/epochs-field-guide-to-camouflage",kind:"historical and fashion context",note:"Explains historic fabric families and civilian fashion use, so a pattern is not proof of affiliation."},
 militaire:{name:"Militaire-Uitrusting.nl · Camouflage patterns",url:"https://www.militaire-uitrusting.nl/en/camouflage-patterns",kind:"international pattern directory",note:"Pattern names and illustrated country-specific references, linked only. Verify national service against insignia and dates."}
});
export const PATTERNS=Object.freeze([
 {name:"Netherlands Fractal Pattern (NFP)",family:"Fractal multiterrain",origin:"NL",uses:"Royal Netherlands Armed Forces",era:"Modern",distinguish:"National fractal family with separate woodland and desert/multiterrain variants; verify markings.",source:"militaire",status:"regional"},
 {name:"Bariolage Multi-Environnement (BME)",family:"Multi-environment",origin:"FR",uses:"France · Armed Forces",era:"Modern",distinguish:"French next-generation multi-environment scheme, distinguish from earlier CCE patterns.",source:"militaire",status:"regional"},
 {name:"Camouflage Centre-Europe (CCE)",family:"Woodland organic",origin:"FR",uses:"France · Armed Forces",era:"1990s onwards",distinguish:"French woodland pattern; overlaps with other national designs; confirm French service context.",source:"militaire",status:"shared"},
 {name:"MM-14",family:"Digital multiterrain",origin:"UA",uses:"Ukraine · Armed Forces",era:"2010s onwards",distinguish:"Ukrainian digital family, verify recognizable Ukrainian insignia and garments.",source:"militaire",status:"lookalike"},
 {name:"Type 07",family:"Digital multienvironment",origin:"CN",uses:"China · People's Liberation Army",era:"2000s onwards",distinguish:"Chinese family of multiple environment variants; pixels alone cannot confirm PLA service.",source:"militaire",status:"regional"},
 {name:"Disruptive Pattern Camouflage Uniform (DPCU)",family:"Disruptive arid/woodland",origin:"AU",uses:"Australia · Defence Force",era:"1980s onwards",distinguish:"Australian historic 'jellybean' family; distinct from Australian Multicam derivatives.",source:"militaire",status:"regional"},
 {name:"Jigsaw Pattern",family:"Angular geometric",origin:"BE",uses:"Belgium · Armed Forces",era:"1950s onwards",distinguish:"Highly geometric Belgian family; era-specific versions need verification.",source:"militaire",status:"regional"},
 {name:"M/84",family:"Digital woodland",origin:"DK",uses:"Denmark · Armed Forces",era:"1980s onwards",distinguish:"Danish spot family; can resemble Flecktarn at a glance but has distinct shapes.",source:"militaire",status:"lookalike"},
 {name:"Telo Mimetico",family:"Historical splinter / geometric",origin:"IT",uses:"Italy; historically also used by some German and Czechoslovak forces",era:"1929 onwards",distinguish:"Italian 1929-pattern family; modified variants and postwar civilian use; uniform cut and historical proof matter.",source:"epochs",status:"historical"},
 {name:"Denison Smock / brushstroke",family:"Brushstroke",origin:"GB",uses:"United Kingdom and other historic European airborne forces",era:"1940s onwards",distinguish:"Large brush-applied forms; similar-looking French lizard pattern descendants require further evidence.",source:"epochs",status:"historical"},
 {name:"French Lizard / Leopard",family:"Horizontal brushstroke",origin:"FR",uses:"France; derivatives used internationally",era:"1950s onwards",distinguish:"Striped brushstroke family with many international derivatives, do not equate the pattern to France.",source:"epochs",status:"shared"},
 {name:"Strichtarn / Raindrop",family:"Raindrop over olive",origin:"DE",uses:"Historical East Germany and other former Warsaw Pact users",era:"1960s onwards",distinguish:"Fine rain streaks associated with East German historical designs; other countries used or adapted related materials.",source:"epochs",status:"historical"},
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
 {name:"Pattern introduction and broad overview",source:"militarymachine"},
 {name:"Historical camouflage and civilian fashion use",source:"epochs"},
 {name:"Illustrated international country-by-country pattern references",source:"militaire"}
]);

/* User-supplied external image exemplar. Classification intentionally unknown.
 * Browser UI opens this link; no media is copied or used for embeddings. */
export const EXTERNAL_SAMPLES=Object.freeze([{label:"User-supplied camouflage image · unverified",url:"https://i.imgur.com/PfLuTUR.jpeg",status:"unknown",note:"Do not assign country, branch, or pattern without viewing and verifying the image."}]);

/* Candidate examples transcribed from user-submitted three-panel illustration charts.
 * These labels come from the charts, not from independent verification.
 * Do not use as verified AI memory or publish source images automatically.
 */
export const COUNTRY_COMPARISON_LESSONS=Object.freeze([
 {group:"Europe · three-country comparison",description:"Composite charts label Germany, Italy, and Spain. Similar tactical silhouettes and camouflage require distinguishing sleeve flags and authenticated insignia.",countries:[
   {code:"DE",label:"Germany",visualClues:"German tricolor on background and sleeve; camo appears flecked or woodland-style.",warning:"Do not identify Flecktarn or a Bundeswehr branch from this illustration alone."},
   {code:"IT",label:"Italy",visualClues:"Italian tricolor on background and sleeve; green-brown mottled uniform.",warning:"Exact Italian pattern and branch are unconfirmed."},
   {code:"ES",label:"Spain",visualClues:"Spanish flag on background and sleeve; darker multicolor camouflage.",warning:"Exact Spanish pattern, force and period are unconfirmed."}
 ]},
 {group:"North Africa · three-country comparison",description:"Composite charts label Algeria, Morocco, and Tunisia. Differences in sleeve flags and headgear are more informative than general woodland or arid camouflage.",countries:[
   {code:"DZ",label:"Algeria",visualClues:"Algerian flag and a green beret; brown-green woodland-style uniform.",warning:"The chart does not authenticate a particular Algerian service or pattern."},
   {code:"MA",label:"Morocco",visualClues:"Moroccan flag patch and green beret; green-brown woodland-style uniform.",warning:"Similar gear and colors are not proof of Moroccan service."},
   {code:"TN",label:"Tunisia",visualClues:"Tunisian flag patch, red beret and arid camouflage.",warning:"No verified exact model, uniform issue year or service branch."}
 ]},
 {group:"Africa · three-country comparison",description:"Composite charts label Libya, South Africa, and Nigeria. Flag patches differ, while body armor, rifles and gear resemble one another.",countries:[
   {code:"LY",label:"Libya",visualClues:"Libyan flag patch, black beret, tan desert-style camouflage.",warning:"Specific military organization and historical date not verified."},
   {code:"ZA",label:"South Africa",visualClues:"South African flag patch, maroon beret, green-brown camouflage.",warning:"Cannot confirm SANDF unit or national issue from this illustration."},
   {code:"NG",label:"Nigeria",visualClues:"Nigerian flag patch, green beret, green-brown camouflage.",warning:"Cannot confirm a particular Nigerian service or pattern."}
 ]}
]);
