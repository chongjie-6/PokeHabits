/**
 * The fun-fact corpus. See DESIGN.md §5.3.
 *
 * Sourcing rule, inherited from `data/quotes.ts`: every entry carries a
 * traceable source. The failure mode of this genre is a different one from the
 * quote corpus's — not misattribution but the plausible factoid nobody ever
 * checked ("we use 10% of our brain", "the Great Wall is visible from space") —
 * so a fact that cannot be traced does not ship, and where the popular version
 * is wrong but the real one is still good, `note` carries the correction.
 *
 * `source` is where a fact can be checked, not merely where it was found. It is
 * required here, unlike on a quote, because a fact has no author to stand
 * behind it.
 */

import type { Fact } from "@/lib/types";

export const FACTS: Fact[] = [
  {
    id: "venus-long-day",
    text: "A day on Venus is longer than its year. It takes 243 Earth days to turn once and 225 to go round the Sun.",
    source: "NASA, Venus Fact Sheet",
    tags: ["space"],
  },
  {
    id: "venus-retrograde",
    text: "Venus turns backwards. Stand on it and you would watch the Sun rise in the west — twice a year.",
    source: "NASA, Venus Fact Sheet",
    tags: ["space"],
  },
  {
    id: "saturn-floats",
    text: "Saturn is less dense than water. Given an ocean big enough, it would float.",
    source: "NASA, Saturn Fact Sheet",
    tags: ["space"],
  },
  {
    id: "neptune-first-orbit",
    text: "Neptune was discovered in 1846 and finished its first orbit since, in 2011. A Neptune year is 165 of ours.",
    source: "NASA, Neptune Fact Sheet",
    tags: ["space", "numbers"],
  },
  {
    id: "olympus-mons",
    text: "Olympus Mons on Mars is about 22 km high — two and a half Everests — and so wide that from its slopes the summit sits below the horizon.",
    source: "NASA, Mars Exploration Program",
    tags: ["space"],
  },
  {
    id: "neutron-star-teaspoon",
    text: "A teaspoon of neutron star would weigh about a billion tonnes on Earth.",
    source: "NASA Goddard, Imagine the Universe",
    tags: ["space", "numbers"],
  },
  {
    id: "sunlight-eight-minutes",
    text: "Sunlight takes 8 minutes and 20 seconds to reach us. If the Sun went out, the last thing you would notice is that nothing had happened yet.",
    source: "NASA, Sun Fact Sheet",
    tags: ["space"],
  },
  {
    id: "iss-sixteen-sunrises",
    text: "The International Space Station laps the Earth every 90 minutes, so its crew see sixteen sunrises and sixteen sunsets a day.",
    source: "NASA, International Space Station facts and figures",
    tags: ["space"],
  },
  {
    id: "voyager-distance",
    text: "Voyager 1, launched in 1977, is more than 24 billion km away — the most distant thing human beings have ever made.",
    source: "NASA JPL, Voyager mission status",
    tags: ["space", "technology"],
  },
  {
    id: "moon-footprints",
    text: "The footprints on the Moon have no wind or water to erase them. They will outlast every building on Earth.",
    source: "NASA, Apollo Lunar Surface Journal",
    tags: ["space"],
  },
  {
    id: "titan-methane-rain",
    text: "It rains on Titan, into lakes and rivers that shape the surface the way water shapes ours. The rain is methane.",
    source: "NASA JPL, Cassini–Huygens findings",
    tags: ["space"],
  },
  {
    id: "astronauts-grow",
    text: "Astronauts get taller in orbit. With no gravity compressing the spine, the discs expand by up to 3% of your height — and it is all lost again on the way down.",
    source: "NASA Human Research Program",
    tags: ["space", "body"],
  },
  {
    id: "apollo-computer",
    text: "The computer that guided Apollo 11 to the Moon had about 4 KB of memory — less than one small photo on your phone.",
    source:
      "MIT Instrumentation Laboratory, Apollo Guidance Computer specification",
    tags: ["space", "technology"],
  },
  {
    id: "great-red-spot",
    text: "Jupiter's Great Red Spot is a storm wider than the Earth that has been blowing for at least 190 years, and it is slowly shrinking.",
    source: "NASA, Juno mission",
    tags: ["space"],
  },
  {
    id: "trees-outnumber-stars",
    text: "There are roughly three trillion trees on Earth — about ten times more trees than there are stars in the Milky Way.",
    source: "Crowther et al., Nature, 2015",
    tags: ["earth", "numbers"],
  },
  {
    id: "antarctica-desert",
    text: "The largest desert on Earth is Antarctica. A desert is defined by how little falls on it, not by how hot it is.",
    source: "US National Science Foundation, Antarctic Program",
    tags: ["earth"],
  },
  {
    id: "green-sahara",
    text: "Six thousand years ago the Sahara was grassland dotted with lakes, and the people living there left rock paintings of swimmers.",
    source: "African Humid Period; rock art at Wadi Sura, Egypt",
    tags: ["earth", "history"],
  },
  {
    id: "everest-grows",
    text: "Everest gets about 4 mm taller every year, pushed up by India still crashing into Asia.",
    source: "Plate convergence measurements, US Geological Survey",
    tags: ["earth"],
  },
  {
    id: "lightning-hotter-than-sun",
    text: "Lightning heats the air around it to about 30,000 °C — five times hotter than the surface of the Sun.",
    source: "NOAA National Weather Service, lightning science",
    tags: ["earth"],
  },
  {
    id: "lightning-per-second",
    text: "Lightning strikes the Earth about 44 times a second. Roughly a hundred bolts in the time it takes to read this.",
    source: "NASA Global Hydrology Resource Center",
    tags: ["earth", "numbers"],
  },
  {
    id: "krakatoa-loudest",
    text: "The 1883 eruption of Krakatoa was heard 4,800 km away on Rodrigues Island, where the coastguard reported distant gunfire. It is the loudest sound in recorded history.",
    source: "Royal Society, Report of the Krakatoa Committee, 1888",
    tags: ["earth", "history"],
  },
  {
    id: "point-nemo",
    text: "The remotest spot in the ocean is 2,688 km from the nearest land. When the space station passes overhead, the closest human beings are the ones in orbit.",
    source: "Point Nemo, located by Hrvoje Lukatela, 1992",
    tags: ["ocean", "earth"],
  },
  {
    id: "inner-core-heat",
    text: "The Earth's inner core is a ball of iron about as hot as the surface of the Sun. It stays solid because of the pressure on it.",
    source: "Seismological and mineral-physics estimates of core temperature",
    tags: ["earth"],
  },
  {
    id: "iceland-no-mosquitoes",
    text: "Iceland has no mosquitoes. Its freezes and thaws never leave the larvae a puddle that lasts.",
    source: "Icelandic Institute of Natural History",
    tags: ["earth", "animals"],
  },
  {
    id: "bamboo-growth",
    text: "Some bamboo grows nearly a metre in a day. In the right conditions you can sit and watch it happen.",
    source: "Royal Botanic Gardens, Kew",
    tags: ["earth"],
  },
  {
    id: "sound-in-water",
    text: "Sound travels about four times faster in water than in air, which is why it is so hard to tell underwater where a noise came from.",
    source: "NOAA, Discovery of Sound in the Sea",
    tags: ["ocean"],
  },
  {
    id: "octopus-three-hearts",
    text: "An octopus has three hearts. Two pump blood through the gills and one through the rest of the body — and that one stops whenever it swims, which is why octopuses would rather walk.",
    source: "Smithsonian Ocean, cephalopod biology",
    tags: ["ocean", "animals"],
  },
  {
    id: "octopus-arm-neurons",
    text: "Two thirds of an octopus's neurons are in its arms rather than its head. Each arm works out a good deal of the problem on its own.",
    source: "Hochner, Current Biology, 2012",
    tags: ["ocean", "animals"],
  },
  {
    id: "immortal-jellyfish",
    text: "Turritopsis dohrnii, a jellyfish the size of a fingernail, can revert to its juvenile polyp stage when injured or starving, and start over.",
    source: "Piraino et al., Biological Bulletin, 1996",
    tags: ["ocean", "animals"],
  },
  {
    id: "greenland-shark-age",
    text: "The Greenland shark lives over 250 years and does not reproduce until about 150. One examined in 2016 was born before Newton wrote the Principia.",
    source: "Nielsen et al., Science, 2016",
    tags: ["ocean", "animals"],
  },
  {
    id: "mantis-shrimp-eyes",
    text: "Mantis shrimp have twelve to sixteen kinds of colour receptor to our three — and are worse than us at telling similar colours apart. The eye is built for speed, not for discrimination.",
    source: "Thoen et al., Science, 2014",
    tags: ["ocean", "animals"],
  },
  {
    id: "blue-whale-heart",
    text: "A blue whale's heart weighs about 180 kg and its aorta is roughly the width of a dinner plate.",
    source: "Royal Ontario Museum, blue whale specimen, 2015",
    note: "The familiar version — that a person could swim through the arteries — is folklore. A dinner plate is remarkable enough.",
    tags: ["ocean", "animals", "body"],
  },
  {
    id: "sea-otters-hold-hands",
    text: "Sea otters wrap themselves in kelp, and sometimes hold each other's paws, so that they do not drift apart while they sleep.",
    source: "Monterey Bay Aquarium, sea otter research programme",
    tags: ["ocean", "animals"],
  },
  {
    id: "sharks-older-than-trees",
    text: "Sharks are older than trees. There were sharks in the ocean 450 million years ago, and not one tree stood anywhere on Earth until roughly 385 million.",
    source:
      "Earliest shark scales, c. 450 Ma; Stein et al., Nature, 2007, on the earliest known forest",
    tags: ["ocean", "animals", "earth"],
  },
  {
    id: "wombat-cubes",
    text: "Wombats produce cube-shaped droppings. Stiff and stretchy patches in the intestine shape the corners, and the cubes stay where the wombat leaves them instead of rolling away.",
    source: "Yang et al., Soft Matter, 2021",
    tags: ["animals"],
  },
  {
    id: "tardigrades-in-space",
    text: "Tardigrades were carried into orbit in 2007, exposed to open space for ten days, and brought home. Some of them went on to lay eggs that hatched.",
    source: "Jönsson et al., Current Biology, 2008",
    tags: ["animals", "space"],
  },
  {
    id: "crows-remember-faces",
    text: "Crows recognise individual human faces, hold a grudge for years, and pass the grudge on to other crows that were never there.",
    source: "Marzluff et al., University of Washington, 2011",
    tags: ["animals"],
  },
  {
    id: "waggle-dance",
    text: "A returning honeybee dances a figure of eight on the comb. The angle of the run gives the direction of the flowers relative to the Sun, and how long it lasts gives the distance.",
    source: "Karl von Frisch, Nobel Prize in Physiology or Medicine, 1973",
    tags: ["animals"],
  },
  {
    id: "axolotl-regrowth",
    text: "An axolotl can regrow a lost limb — bone, muscle and nerve — along with parts of its heart and brain, and leaves no scar.",
    source:
      "Regeneration research, Max Planck Institute for Developmental Biology",
    tags: ["animals", "body"],
  },
  {
    id: "butterflies-taste-with-feet",
    text: "Butterflies taste with their feet. A female drums on a leaf to find out whether her caterpillars will be able to eat it.",
    source: "Tarsal chemoreceptors; Royal Entomological Society",
    tags: ["animals"],
  },
  {
    id: "sloth-digestion",
    text: "A sloth can take a month to digest a single leaf, which is roughly why it does everything else slowly too.",
    source: "Cliffe et al., sloth digestive physiology",
    tags: ["animals"],
  },
  {
    id: "hummingbird-heart",
    text: "A hummingbird's heart runs at over 1,200 beats a minute in flight, and drops to about 50 overnight when it goes into torpor.",
    source: "Cornell Lab of Ornithology",
    tags: ["animals", "body"],
  },
  {
    id: "penguin-knight",
    text: "A king penguin at Edinburgh Zoo holds the rank of Major General in the Norwegian King's Guard, and was knighted in 2008. His name is Sir Nils Olav.",
    source: "Norwegian Armed Forces; Royal Zoological Society of Scotland",
    tags: ["animals", "history"],
  },
  {
    id: "cleopatra-timing",
    text: "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.",
    source:
      "Great Pyramid c. 2560 BC; Cleopatra died 30 BC; Apollo 11 landed 1969",
    tags: ["history", "numbers"],
  },
  {
    id: "oxford-older-than-aztecs",
    text: "There was teaching at Oxford by 1096. Tenochtitlan, the Aztec capital, was founded in 1325 — the university is older than the empire.",
    source: "University of Oxford, official history",
    tags: ["history"],
  },
  {
    id: "pyramid-tallest",
    text: "The Great Pyramid was the tallest structure on Earth for about 3,800 years, until a cathedral spire went up in Lincoln around 1311.",
    source:
      "Structural height records; Lincoln Cathedral central spire, c. 1311",
    tags: ["history"],
  },
  {
    id: "shortest-war",
    text: "The shortest war on record lasted about 38 minutes: Britain against Zanzibar, on the morning of 27 August 1896.",
    source: "British Admiralty records of the Anglo-Zanzibar War",
    tags: ["history"],
  },
  {
    id: "harvard-before-calculus",
    text: "Harvard was founded in 1636, a generation before anybody invented calculus.",
    source:
      "Harvard University founding, 1636; Newton and Leibniz, 1660s–1670s",
    tags: ["history"],
  },
  {
    id: "fax-before-phone",
    text: "The fax machine is older than the telephone. Alexander Bain patented a way to send an image down a wire in 1843, thirty-three years before Bell's patent.",
    source: "Bain, British patent 9745, 1843; Bell, US patent 174465, 1876",
    tags: ["history", "technology"],
  },
  {
    id: "nintendo-playing-cards",
    text: "Nintendo was founded in 1889 and spent its first seventy years making hanafuda playing cards by hand.",
    source: "Nintendo, company history",
    tags: ["history", "technology"],
  },
  {
    id: "guillotine-star-wars",
    text: "France's last execution by guillotine was in September 1977 — the year Star Wars opened in cinemas.",
    source: "French Ministry of Justice records; Star Wars released May 1977",
    tags: ["history"],
  },
  {
    id: "anne-frank-mlk",
    text: "Anne Frank and Martin Luther King Jr. were born in the same year, 1929.",
    source: "Anne Frank House; The King Center",
    tags: ["history"],
  },
  {
    id: "wright-flight-wingspan",
    text: "The Wright brothers' first flight covered 36 metres. A Boeing 747 has a longer wingspan than that.",
    source:
      "Smithsonian National Air and Space Museum; Boeing 747-400 wingspan, 64.4 m",
    tags: ["history", "technology"],
  },
  {
    id: "napoleon-height",
    text: "Napoleon was about 1.70 m — an ordinary height for a Frenchman of his day.",
    source:
      "Autopsy record, Saint Helena, 1821, giving 5 foot 2 in pre-revolutionary French measure",
    note: "The short Napoleon comes from that figure being read as English inches, and from British cartoonists who found it useful.",
    tags: ["history", "body"],
  },
  {
    id: "petrichor",
    text: "The smell of rain falling on dry ground has a name — petrichor — coined in 1964 by two Australian scientists who worked out where it comes from.",
    source: "Bear and Thomas, Nature, 1964",
    tags: ["language", "earth"],
  },
  {
    id: "basque-isolate",
    text: "Basque is related to no known language on Earth. It was spoken in the Pyrenees before Latin arrived, and it outlasted it.",
    source: "Royal Academy of the Basque Language",
    tags: ["language"],
  },
  {
    id: "silbo-gomero",
    text: "On La Gomera in the Canary Islands people hold conversations across ravines in a whistled language that carries for kilometres. It is taught in the schools.",
    source: "UNESCO Intangible Cultural Heritage list, 2009",
    tags: ["language"],
  },
  {
    id: "sequoyah-syllabary",
    text: "Sequoyah invented a writing system for Cherokee in the 1820s without being able to read any language at the time. Within a few years much of the nation was literate in it.",
    source: "Cherokee Nation, history of the syllabary",
    tags: ["language", "history"],
  },
  {
    id: "tittle",
    text: "The dot over a lowercase i or j has a name. It is a tittle — the same word as in 'jot or tittle'.",
    source: "Oxford English Dictionary",
    tags: ["language"],
  },
  {
    id: "snabel-a",
    text: "The @ sign is a snabel-a, an elephant's-trunk a, in Danish; a monkey's tail in Dutch; and a little mouse in Chinese.",
    source: "Names for @ collected by the Norwegian Language Council",
    tags: ["language", "technology"],
  },
  {
    id: "oed-run",
    text: "The English word with the most distinct senses in the Oxford English Dictionary is 'run' — over six hundred of them, having overtaken 'set' during the dictionary's third revision.",
    source: "Oxford English Dictionary, third edition revision",
    tags: ["language", "numbers"],
  },
  {
    id: "deck-orderings",
    text: "Shuffle a deck of cards properly and you have almost certainly put it in an order no deck has ever been in before. There are more arrangements of 52 cards than there are atoms making up the Earth.",
    source: "52! ≈ 8×10^67, against roughly 10^50 atoms in the Earth",
    tags: ["numbers"],
  },
  {
    id: "birthday-problem",
    text: "In a room of 23 people it is more likely than not that two of them share a birthday. At 70 people it is a 99.9% bet.",
    source: "The birthday problem, classical probability",
    tags: ["numbers"],
  },
  {
    id: "benford-law",
    text: "In most real tables of numbers about 30% of the entries begin with a 1 and under 5% begin with a 9. Auditors use the gap to spot invented figures.",
    source: "Benford's law; Newcomb, 1881, and Benford, 1938",
    tags: ["numbers"],
  },
  {
    id: "googol-vs-universe",
    text: "A googol — 1 followed by a hundred zeros — is bigger than the number of atoms in the observable universe, which is somewhere around 10^80.",
    source: "Estimates of the baryonic mass of the observable universe",
    tags: ["numbers", "space"],
  },
  {
    id: "point-nine-recurring",
    text: "0.999… is not nearly 1. It is exactly 1, in the same way 0.333… is exactly a third.",
    source: "Standard result on limits of real sequences",
    tags: ["numbers"],
  },
  {
    id: "fields-medal-age",
    text: "The Fields Medal, mathematics' most famous prize, cannot be awarded to anyone over 40.",
    source: "International Mathematical Union, statutes",
    tags: ["numbers"],
  },
  {
    id: "trojan-room-coffee-pot",
    text: "The first webcam pointed at a coffee pot. Researchers in a Cambridge computer lab were tired of walking downstairs to find it empty.",
    source:
      "Trojan Room coffee pot, University of Cambridge Computer Laboratory, 1991",
    tags: ["technology", "history"],
  },
  {
    id: "ebay-laser-pointer",
    text: "The first thing sold on eBay was a broken laser pointer, for $14.83. The founder wrote to check the buyer understood it was broken; he collected them.",
    source: "eBay company history, AuctionWeb, 1995",
    tags: ["technology", "history"],
  },
  {
    id: "email-before-web",
    text: "Email is about twenty years older than the web. The first message went between two computers in 1971; the web was proposed in 1989.",
    source: "Tomlinson, ARPANET, 1971; Berners-Lee, CERN proposal, 1989",
    tags: ["technology", "history"],
  },
  {
    id: "wifi-means-nothing",
    text: "Wi-Fi does not stand for anything. A branding agency made it up because it sounded like hi-fi.",
    source: "Phil Belanger, founding member of the Wi-Fi Alliance",
    note: "'Wireless fidelity' was tacked on afterwards by people who assumed it had to be short for something.",
    tags: ["technology", "language"],
  },
  {
    id: "morning-height",
    text: "You are about a centimetre taller when you get up than when you go to bed. The discs in your spine compress over the day and swell again overnight.",
    source: "Diurnal variation in spinal disc height, orthopaedic literature",
    tags: ["body"],
  },
  {
    id: "baby-bones",
    text: "Babies are born with around 300 bones. Adults have 206, because dozens of them fuse on the way up.",
    source: "Gray's Anatomy; skeletal development",
    tags: ["body"],
  },
  {
    id: "blind-spot",
    text: "Each eye has a hole in its retina where the optic nerve leaves, and you have never seen it. Your brain fills the gap with whatever it thinks ought to be there.",
    source: "Mariotte's description of the blind spot, 1668",
    tags: ["body"],
  },
  {
    id: "humans-glow",
    text: "Human beings glow in the dark. The light is about a thousand times fainter than the eye can detect, and it peaks in the late afternoon.",
    source: "Kobayashi et al., PLOS ONE, 2009",
    tags: ["body"],
  },
  {
    id: "nail-growth",
    text: "Fingernails grow about 3.5 mm a month, faster on your writing hand and faster in summer. We know because a doctor measured his own for 35 years.",
    source: "William Bean, Archives of Internal Medicine, 1980",
    tags: ["body"],
  },
  {
    id: "lung-surface",
    text: "The inside of your lungs is folded into a surface of 50 to 75 square metres — about half a tennis court.",
    source: "Ochs et al., stereological measurement of the human lung",
    note: "The whole-tennis-court figure everyone quotes comes from older estimates; careful measurement roughly halved it.",
    tags: ["body"],
  },
  {
    id: "goosebumps",
    text: "Goosebumps are a leftover. The muscle that pulls each hair upright once made a furrier ancestor look bigger; on us it achieves nothing at all.",
    source: "The arrector pili reflex; comparative physiology",
    tags: ["body"],
  },
  {
    id: "stomach-lining",
    text: "Your stomach would digest itself without its lining of mucus, which is why the lining is replaced every few days.",
    source: "Gastric mucosal turnover, physiology literature",
    tags: ["body"],
  },
  {
    id: "bananas-are-berries",
    text: "A banana is botanically a berry. A strawberry is not.",
    source: "Botanical fruit classification",
    tags: ["food"],
  },
  {
    id: "cashew-poison-ivy",
    text: "Cashews are never sold in the shell. The shell holds the same oil that makes poison ivy itch, and the nuts are roasted to drive it off before anyone can handle them.",
    source: "Urushiol in Anacardium occidentale; Royal Botanic Gardens, Kew",
    tags: ["food"],
  },
  {
    id: "vanilla-hand-pollinated",
    text: "Nearly every vanilla pod in the world is pollinated by hand, using a technique worked out in 1841 by a twelve-year-old enslaved boy on Réunion. Outside Mexico the orchid has no pollinator.",
    source: "Edmond Albius, Réunion, 1841",
    tags: ["food", "history"],
  },
  {
    id: "purple-carrots",
    text: "Carrots were purple, white and yellow long before they were orange. Dutch growers settled on the orange one in the seventeenth century.",
    source: "Domestication history of Daucus carota",
    note: "The story that they did it to honour William of Orange is a much later invention.",
    tags: ["food", "history"],
  },
  {
    id: "peanuts-are-legumes",
    text: "Peanuts are not nuts. They are legumes, closer kin to peas than to almonds, and they ripen underground.",
    source: "Arachis hypogaea, botanical classification",
    tags: ["food"],
  },
  {
    id: "dead-sea-float",
    text: "The Dead Sea is about ten times saltier than the ocean. You cannot sink in it — and you cannot swim in it properly either, because your legs float up behind you.",
    source: "Israel Oceanographic and Limnological Research, Dead Sea salinity",
    tags: ["earth", "ocean"],
  },
];
