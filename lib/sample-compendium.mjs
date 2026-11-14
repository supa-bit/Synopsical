// Curated starter & demo entries for Synopsical's interactive Sample
// Compendium (logged-out preview mode) and 1-click starter pack for new
// accounts.
//
// Deliberately includes the three entries shown on the homepage's hero
// cards (Byzantine Iconoclasm, Mycorrhizal Networks, Principia Mathematica)
// plus five connected entries across History, Biology, Physics, and
// Architecture so clicking a hero card or opening the Link map immediately
// demonstrates cross-references, custom fields, [[wiki-links]], and
// category stamps.

export const SAMPLE_ENTRIES = [
  {
    id: 'sample-iconoclasm',
    title: 'Byzantine Iconoclasm',
    category: 'History',
    subcategory: 'Eastern Roman Empire',
    summary: 'Two periods of imperial bans on religious icons (726–787 and 814–842), driven by theology and provincial military pressure.',
    body: `The **Iconoclastic Controversy** divided the Byzantine world for over a century, pitting imperial reformers and Anatolian bishops against monastic communities and the devotional traditions of the Mediterranean.

## First Iconoclasm (726–787)

Initiated under Emperor Leo III the Isaurian following a series of volcanic eruptions in the Aegean and Arab sieges of Constantinople, the movement argued that venerating physical images violated the biblical prohibition against graven images.

- **730 AD**: Leo III issues an imperial edict banning figurative religious images; Patriarch Germanus I resigns rather than sign.
- **754 AD**: The Council of Hieria, convened by Constantine V, formally condemns icon manufacture while preserving non-figural cross motifs inside [[Hagia Sophia]].
- **787 AD**: Empress Irene convenes the **Second Council of Nicaea**, restoring icon veneration (*proskynesis*) while distinguishing it from worship (*latreia*) owed to God alone.

## Second Iconoclasm & Triumph of Orthodoxy (814–842)

Following catastrophic military defeats against Bulgaria, Emperor Leo V revived the ban in 814. The second phase was more administrative than popular, ending after the death of Emperor Theophilus when Empress Theodora proclaimed the permanent restoration of icons in 843—still commemorated on the first Sunday of Lent as the *Triumph of Orthodoxy*.

> "What the book is to those who have learned to read, that the image is to the illiterate; what speech is to the ear, that the image is to the eye." — John of Damascus`,
    source: 'Leslie Brubaker & John Haldon, Byzantium in the Iconoclast Era, c. 680–850 (Cambridge University Press, 2011)',
    faceplate_type: 'text',
    faceplate_text: 'HIS',
    faceplate_bg: '#eef1f4',
    faceplate_color: '#0a29fa',
    faceplate_font: 'default',
    faceplate_image: null,
    created_at: '2026-08-12T10:00:00Z',
    updated_at: '2026-08-18T14:20:00Z',
    tags: ['byzantine-empire', 'theology', 'constantinople', 'art-history'],
    fields: [
      { field_name: 'First Period', field_value: '726–787 AD (Leo III to Empress Irene)', sort_order: 0 },
      { field_name: 'Second Period', field_value: '814–842 AD (Leo V to Empress Theodora)', sort_order: 1 },
      { field_name: 'Key Councils', field_value: 'Hieria (754), Second Nicaea (787)', sort_order: 2 },
      { field_name: 'Primary Defenders', field_value: 'John of Damascus, Theodore the Studite', sort_order: 3 },
    ],
  },
  {
    id: 'sample-mycorrhiza',
    title: 'Mycorrhizal Networks',
    category: 'Biology',
    subcategory: 'Forest Ecology',
    summary: 'Symbiotic fungal threads linking tree root systems — sometimes called the "wood wide web."',
    body: `A **mycorrhizal network** arises when the subterranean mycelium of a mycorrhizal fungus colonizes the roots of multiple plants simultaneously, forming a living conduit for carbon, nitrogen, phosphorus, water, and defense signaling molecules across an ecosystem.

## Architecture of the Symbiosis

Over 90% of terrestrial plant species form mycorrhizal associations, an ancient evolutionary partnership that represents a textbook case of [[Symbiogenesis]] enabling plants to colonize dry land roughly 450 million years ago.

- **Ectomycorrhizae (EM)**: Form a dense sheath (*Hartig net*) around root tips without penetrating plant cell walls; dominant in boreal and temperate forests (pines, oaks, birches).
- **Arbuscular Mycorrhizae (AM)**: Penetrate root cortical cells to form branched tree-like structures (*arbuscules*) for nutrient exchange; found in ~70–80% of all vascular plants.

## Resource Transfer & Chemical Signaling

Isotope-tracing experiments passed through shaded Douglas fir and paper birch seedlings demonstrated net carbon transfer along source-sink gradients. When an insect herbivore attacks a connected plant, jasmonic acid and volatile defense signals travel through the hyphal network within hours, priming neighboring trees to synthesize defensive tannins before the pest arrives.`,
    source: 'Suzanne W. Simard et al., "Net transfer of carbon between ectomycorrhizal tree species in the field," Nature 388 (1997)',
    faceplate_type: 'text',
    faceplate_text: 'BIO',
    faceplate_bg: '#e7f4f0',
    faceplate_color: '#0e7a5f',
    faceplate_font: 'default',
    faceplate_image: null,
    created_at: '2026-08-13T11:30:00Z',
    updated_at: '2026-08-19T09:15:00Z',
    tags: ['mycology', 'forest-ecology', 'symbiosis', 'botany'],
    fields: [
      { field_name: 'Major Types', field_value: 'Ectomycorrhizal (EM) & Arbuscular (AM)', sort_order: 0 },
      { field_name: 'Fossil Origin', field_value: '~450 Ma (Ordovician–Devonian transition)', sort_order: 1 },
      { field_name: 'Exchanged Nutrients', field_value: 'Carbon, Phosphorus, Nitrogen, Water', sort_order: 2 },
    ],
  },
  {
    id: 'sample-principia',
    title: 'Principia Mathematica',
    category: 'Physics',
    subcategory: 'Classical Mechanics',
    summary: "Newton's 1687 work laying out the three laws of motion and universal gravitation.",
    body: `Formally titled *Philosophiæ Naturalis Principia Mathematica* ("Mathematical Principles of Natural Philosophy"), Isaac Newton's three-volume treatise unified terrestrial mechanics and celestial dynamics under a single mathematical framework. Published in July 1687 with the imprimatur of Samuel Pepys at the [[Royal Society of London]], its printing was personally financed by Edmond Halley after the Society exhausted its funds.

## Structure of the Three Books

- **Book I — De Motu Corporum**: Establishes the definitions of mass, momentum, and centripetal force, states the three axioms of motion, and proves geometrically that an inverse-square central force produces Keplerian elliptical orbits.
- **Book II — Resisting Media**: Examines fluid mechanics, pendulum oscillations in resisting media, wave propagation, and refutes Descartes' vortex theory of planetary motion.
- **Book III — De Mundi Systemate**: Applies universal gravitation to empirical astronomical data—explaining lunar perturbations, oceanic tides, the oblate figure of the Earth, and the trajectories of comets.

## Methodological Legacy

Whereas [[Opticks]] was written in English and grounded in tabletop prism experiments, the *Principia* was composed in austere Latin geometry so its demonstrations would be unimpeachable to classical mathematicians.`,
    source: 'Isaac Newton, The Principia: Mathematical Principles of Natural Philosophy, trans. I. Bernard Cohen & Anne Whitman (1999)',
    faceplate_type: 'text',
    faceplate_text: '1687',
    faceplate_bg: '#eef1f4',
    faceplate_color: '#0a29fa',
    faceplate_font: 'default',
    faceplate_image: null,
    created_at: '2026-08-14T15:00:00Z',
    updated_at: '2026-08-20T16:45:00Z',
    tags: ['newton', 'classical-mechanics', 'scientific-revolution', 'gravitation'],
    fields: [
      { field_name: 'Author', field_value: 'Isaac Newton', sort_order: 0 },
      { field_name: 'Published', field_value: '5 July 1687 (1st ed.), 1713 (2nd), 1726 (3rd)', sort_order: 1 },
      { field_name: 'Editor & Financier', field_value: 'Edmond Halley', sort_order: 2 },
      { field_name: 'Original Language', field_value: 'New Latin', sort_order: 3 },
    ],
  },
  {
    id: 'sample-hagia-sophia',
    title: 'Hagia Sophia',
    category: 'Architecture',
    subcategory: 'Late Antiquity',
    summary: 'Justinian I’s 537 AD cathedral in Constantinople, engineered by mathematician-architects Anthemius of Tralles and Isidore of Miletus.',
    body: `Built in just five years (532–537 AD) after the Nika riots destroyed its predecessor, **Hagia Sophia** (*Holy Wisdom*) remained the world's largest interior vaulted space for nearly a millennium.

## Pendentive Dome Engineering

By resting a 31-meter hemispherical dome atop four spherical triangles (*pendentives*) carried by massive ashlar piers, Anthemius and Isidore solved the geometric problem of placing a circular dome over a square nave. Forty arched windows pierce the base of the dome, creating the optical illusion—celebrated by court historian Procopius—that the canopy is "suspended from heaven by a golden chain."

## Mosaics & [[Byzantine Iconoclasm]]

During [[Byzantine Iconoclasm]], figurative mosaics were stripped or plastered over in favor of plain gold tesserae and the jewel-encrusted cross in the apse. Following the 843 restoration of icons, the monumental *Virgin and Child* apse mosaic (dedicated in 867 by Patriarch Photios) inaugurated the Macedonian Renaissance.`,
    source: 'Rowland Mainstone, Hagia Sophia: Architecture, Structure and Liturgy of Justinian’s Great Church (1988)',
    faceplate_type: 'text',
    faceplate_text: 'ARC',
    faceplate_bg: '#faeeec',
    faceplate_color: '#c23b2e',
    faceplate_font: 'default',
    faceplate_image: null,
    created_at: '2026-08-15T12:10:00Z',
    updated_at: '2026-08-20T11:00:00Z',
    tags: ['byzantine-empire', 'constantinople', 'architecture', 'art-history'],
    fields: [
      { field_name: 'Dedicated', field_value: '27 December 537 AD', sort_order: 0 },
      { field_name: 'Architects', field_value: 'Anthemius of Tralles & Isidore of Miletus', sort_order: 1 },
      { field_name: 'Dome Diameter', field_value: '31.24 m (102.5 ft), crown 55.6 m high', sort_order: 2 },
    ],
  },
  {
    id: 'sample-symbiogenesis',
    title: 'Symbiogenesis',
    category: 'Biology',
    subcategory: 'Evolutionary Theory',
    summary: 'Evolutionary origin of eukaryotic organelles (mitochondria and plastids) through permanent intracellular symbiosis between distinct microbes.',
    body: `First proposed in outline by Konstantin Mereschkowski (1905) and rigorously championed in 1967 by **Lynn Margulis**, symbiogenesis (endosymbiotic theory) demonstrated that major evolutionary leaps occur not only by gradual branching mutation, but by the physical merger of separate lineages.

## Evidence for Endosymbiotic Origin

- **Double lipid membranes** surrounding both mitochondria (derived from alphaproteobacteria) and chloroplasts (derived from cyanobacteria).
- **Independent circular genomes** that replicate via binary fission and encode bacterial-type ` + '`70S`' + ` ribosomes.
- **Ecological continuity**: Macro-scale mutualisms like [[Mycorrhizal Networks]] and lichens reflect the same cooperative evolutionary imperative at the tissue and ecosystem level.`,
    source: 'Lynn Sagan (Margulis), "On the origin of mitosing cells," Journal of Theoretical Biology 14 (1967)',
    faceplate_type: 'text',
    faceplate_text: 'EVO',
    faceplate_bg: '#e7f4f0',
    faceplate_color: '#0e7a5f',
    faceplate_font: 'default',
    faceplate_image: null,
    created_at: '2026-08-16T09:00:00Z',
    updated_at: '2026-08-21T08:30:00Z',
    tags: ['symbiosis', 'evolution', 'cell-biology', 'botany'],
    fields: [
      { field_name: 'Key Proponents', field_value: 'Konstantin Mereschkowski (1905), Lynn Margulis (1967)', sort_order: 0 },
      { field_name: 'Organelles', field_value: 'Mitochondria (Alphaproteobacteria), Plastids (Cyanobacteria)', sort_order: 1 },
    ],
  },
  {
    id: 'sample-royal-society',
    title: 'Royal Society of London',
    category: 'History',
    subcategory: 'Scientific Revolution',
    summary: 'Founded in 1660 as an "invisible college" of experimental philosophers under the motto Nullius in verba ("take nobody’s word for it").',
    body: `Chartered by King Charles II following a lecture by astronomer and architect Christopher Wren at Gresham College in November 1660, the **Royal Society** institutionalized public experimental verification and scientific publishing.

## Milestones & Publications

- **1665**: Henry Oldenburg launches *Philosophical Transactions*, establishing peer-reviewed scientific priority and open correspondence.
- **1665**: Curator of Experiments Robert Hooke publishes *Micrographia*, revealing cellular structure in cork and fungal spores under compound lenses.
- **1687**: Publishes Isaac Newton's [[Principia Mathematica]], edited by Clerk Edmond Halley.
- **1703–1727**: Newton serves as President of the Society, publishing [[Opticks]] in 1704.`,
    source: 'Michael Hunter, Establishing the New Science: The Experience of the Early Royal Society (1989)',
    faceplate_type: 'text',
    faceplate_text: '1660',
    faceplate_bg: '#f0ecf9',
    faceplate_color: '#6a4fc4',
    faceplate_font: 'default',
    faceplate_image: null,
    created_at: '2026-08-17T14:00:00Z',
    updated_at: '2026-08-21T12:00:00Z',
    tags: ['scientific-revolution', 'newton', 'institutions'],
    fields: [
      { field_name: 'Founded', field_value: '28 November 1660 (Gresham College, London)', sort_order: 0 },
      { field_name: 'Motto', field_value: 'Nullius in verba ("Take nobody’s word for it")', sort_order: 1 },
      { field_name: 'Journal', field_value: 'Philosophical Transactions (est. 1665)', sort_order: 2 },
    ],
  },
  {
    id: 'sample-opticks',
    title: 'Opticks',
    category: 'Physics',
    subcategory: 'Light & Color',
    summary: 'Newton’s 1704 experimental treatise proving that white light is a heterogeneous mixture of refrangible spectral rays.',
    body: `Unlike the deductive Latin geometry of [[Principia Mathematica]], Newton's *Opticks: or, A Treatise of the Reflexions, Refractions, Inflexions and Colours of Light* (1704) was published in English and organized around concrete laboratory demonstrations.

## The Experimentum Crucis

Prior natural philosophers believed prisms stained pure white light to produce color. By isolating a single narrow violet ray from a first prism and passing it through a second prism, Newton showed that the isolated ray underwent no further color change—proving color is an innate property of light corresponding to its degree of refrangibility.

## The Queries

At the close of Book III, Newton appended speculative **Queries** (expanded from 16 in 1704 to 31 in the 1717 English edition), posing open questions on double refraction in Iceland spar, chemical affinity, ether vibrations, and atomic forces that guided experimental physics at the [[Royal Society of London]] for the next century.`,
    source: 'Isaac Newton, Opticks (4th ed., 1730; Dover reprint 1952)',
    faceplate_type: 'text',
    faceplate_text: 'OPT',
    faceplate_bg: '#eef1f4',
    faceplate_color: '#0a29fa',
    faceplate_font: 'default',
    faceplate_image: null,
    created_at: '2026-08-18T16:00:00Z',
    updated_at: '2026-08-21T15:10:00Z',
    tags: ['newton', 'scientific-revolution', 'optics'],
    fields: [
      { field_name: 'Published', field_value: '1704 (English), 1706 (Latin trans. by Samuel Clarke)', sort_order: 0 },
      { field_name: 'Key Discovery', field_value: 'Spectral composition of white light & reflecting telescope', sort_order: 1 },
    ],
  },
  {
    id: 'sample-alexandria',
    title: 'Library of Alexandria',
    category: 'History',
    subcategory: 'Ancient Scholarship',
    summary: 'Ptolemaic research institution and universal archive where Callimachus compiled the Pinakes, the first subject-indexed library catalogue.',
    body: `Founded under Ptolemy I Soter and Ptolemy II Philadelphus in the early 3rd century BC as part of the *Mouseion* of Alexandria, the Royal Library sought to collect and critically edit all Greek and translated Mediterranean knowledge.

## Callimachus and the *Pinakes*

A vast heap of papyrus scrolls is useless without an index. The poet-scholar **Callimachus of Cyrene** created the *Pinakes* ("Tables of Persons Eminent in Every Branch of Learning, Together with a List of Their Writings")—120 books dividing holdings into major categories (rhetoric, law, epic, tragedy, history, medicine, mathematics, natural science) with biographical metadata, incipit lines, and stichometric line counts.

- Established the foundational principle of any real compendium: **cross-referenced categories + structured metadata**, rather than an unindexed pile of rolls.
- Later textual traditions—from the scriptoria of Constantinople during and after [[Byzantine Iconoclasm]] to the archives of the [[Royal Society of London]]—built directly upon Alexandrian cataloguing methods.`,
    source: 'Lionel Casson, Libraries in the Ancient World (Yale University Press, 2001)',
    faceplate_type: 'text',
    faceplate_text: 'LIB',
    faceplate_bg: '#faeeec',
    faceplate_color: '#c23b2e',
    faceplate_font: 'default',
    faceplate_image: null,
    created_at: '2026-08-19T08:00:00Z',
    updated_at: '2026-08-21T17:00:00Z',
    tags: ['antiquity', 'archives', 'institutions', 'cataloguing'],
    fields: [
      { field_name: 'Founded', field_value: 'c. 285–246 BC (Reign of Ptolemy II Philadelphus)', sort_order: 0 },
      { field_name: 'Chief Catalogue', field_value: 'Pinakes (120 books, compiled by Callimachus)', sort_order: 1 },
      { field_name: 'Estimated Holdings', field_value: '40,000 to 400,000 papyrus scrolls', sort_order: 2 },
    ],
  },
];

export const SAMPLE_LINKS = [
  {
    id: 'slink-1',
    from_entry_id: 'sample-iconoclasm',
    to_entry_id: 'sample-hagia-sophia',
    relation: 'Imperial icon bans reshaped its apse mosaics',
  },
  {
    id: 'slink-2',
    from_entry_id: 'sample-iconoclasm',
    to_entry_id: 'sample-alexandria',
    relation: 'Byzantine scriptoria preserved classical manuscripts',
  },
  {
    id: 'slink-3',
    from_entry_id: 'sample-mycorrhiza',
    to_entry_id: 'sample-symbiogenesis',
    relation: 'Macro-scale fungal-plant mutualism (~450 Ma)',
  },
  {
    id: 'slink-4',
    from_entry_id: 'sample-principia',
    to_entry_id: 'sample-royal-society',
    relation: 'Published under the Society’s imprimatur (1687)',
  },
  {
    id: 'slink-5',
    from_entry_id: 'sample-principia',
    to_entry_id: 'sample-opticks',
    relation: 'Companion treatise by Isaac Newton',
  },
  {
    id: 'slink-6',
    from_entry_id: 'sample-royal-society',
    to_entry_id: 'sample-opticks',
    relation: 'Published when Newton became Society President (1704)',
  },
  {
    id: 'slink-7',
    from_entry_id: 'sample-royal-society',
    to_entry_id: 'sample-mycorrhiza',
    relation: 'Hooke’s Micrographia (1665) first illustrated fungal hyphae',
  },
  {
    id: 'slink-8',
    from_entry_id: 'sample-royal-society',
    to_entry_id: 'sample-alexandria',
    relation: 'Successors in systematic scientific cataloguing',
  },
  {
    id: 'slink-9',
    from_entry_id: 'sample-hagia-sophia',
    to_entry_id: 'sample-opticks',
    relation: 'Applied geometric optics to interior daylight reflection',
  },
];

/**
 * Returns a fresh deep clone of the sample entries and links so mutations in
 * demo mode never corrupt the canonical definitions above.
 */
export function cloneSampleCompendium() {
  const entries = SAMPLE_ENTRIES.map((e) => ({
    ...e,
    tags: [...e.tags],
    fields: e.fields.map((f) => ({ ...f })),
  }));
  const links = SAMPLE_LINKS.map((l) => ({ ...l }));
  const linkCount = new Map();
  for (const l of links) {
    linkCount.set(l.from_entry_id, (linkCount.get(l.from_entry_id) ?? 0) + 1);
    linkCount.set(l.to_entry_id, (linkCount.get(l.to_entry_id) ?? 0) + 1);
  }
  for (const e of entries) {
    e.linkCount = linkCount.get(e.id) ?? 0;
  }
  return { entries, links };
}
