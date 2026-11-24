// ============================================================================
// ARABIAN POLYPLAST — site content (single source of truth)
// ============================================================================
// Contact details supplied by the owner (Nov 2026). Only CR and photos remain
// TODO. Prices are deliberately absent: every lot is quoted per market day.
// ============================================================================

export const SITE = {
  name: 'Arabian Polyplast Trading LLC',
  shortName: 'Arabian Polyplast',
  domain: 'https://arabianpolyplast.com',
  tagline: 'Plastic & metal scrap buyers, suppliers and exporters in Oman',
  description:
    'Arabian Polyplast buys, processes and exports PET, PC, HDPE, PVC, UPVC, PP, LDPE, aluminium and iron scrap from Barka, Oman to the GCC and worldwide.',
  phone: '+968 7694 2126',
  phoneRaw: '+96876942126',
  whatsapp: '+968 9517 4888',
  whatsappRaw: '96895174888',
  email: 'arabianpolyplast@gmail.com',
  cr: 'CR 0000000', // TODO: commercial registration number
  founded: '2020',
  hours: 'Sat–Thu 07:00–19:00',
  address: {
    line1: 'As-Saqsuq',
    city: 'Barka',
    region: 'Al Batinah South Governorate',
    country: 'Oman'
  },
  geo: { lat: 23.6848, lng: 57.8861 },
  ports: ['Sohar', 'Muscat (Sultan Qaboos)'],
  mapUrl: 'https://maps.google.com/?q=Arabian+Polyplast+Trading+LLC+Barka+Oman',
  areas: ['Muscat', 'Barka', 'Sohar', 'Al Batinah', 'Salalah', 'UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'GCC', 'Worldwide'],
  languages: ['en', 'ar'],
  ga4Id: '', // set to the G- measurement ID once the GA4 property exists; the tag is emitted only when this is filled
  indexNowKey: 'a7f3c1d9e04b47c8b2e6f5a90d1c3b8e'
};

export const NAV = [
  { href: '/', label: 'Home' },
  { href: '/products/', label: 'Scrap we buy' },
  { href: '/services', label: 'Services' },
  { href: '/scrap-oman', label: 'Local & Global' },
  { href: '/sell-scrap', label: 'Sell Scrap' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' }
];

const STD_SPECS = (overrides = []) => [
  ['Form', 'As inspected (baled, loose, regrind or as agreed)'],
  ['Packaging', 'Bales or big bags, labelled with grade and weight'],
  ['MOQ', 'One 40ft container or LCL by arrangement'],
  ['Loading port', 'Sohar / Muscat — FOB, CFR, CIF worldwide'],
  ['Area served', 'Oman, GCC and worldwide'],
  ...overrides
];

export const TRUST = [
  'Established 2020 in Barka, Oman',
  'Local buyers & suppliers',
  'Import & export worldwide',
  'Loading at Sohar & Muscat — FOB, CFR, CIF'
];

export const ROLES = [
  {
    title: 'Local buyers — Oman',
    text: 'We buy scrap from factories, contractors, collectors and municipalities across Oman, and arrange collection for larger lots.'
  },
  {
    title: 'Local suppliers — Oman',
    text: 'We supply washed, ground and baled material to factories in Muscat, Sohar, Salalah and the rest of Oman.'
  },
  {
    title: 'Importers',
    text: 'We import selected polymers and metals for Omani manufacturers when local supply cannot meet the specification.'
  },
  {
    title: 'Exporters — worldwide',
    text: 'We export containers from Sohar and Muscat to the GCC and worldwide, on FOB, CFR and CIF terms.'
  }
];

export const PRODUCTS = [
  // ---------------------------------------------------------------- PET family
  {
    slug: 'pet-bottle-scrap',
    group: 'plastic',
    name: 'PET Bottle Scrap',
    h1: 'PET Bottle Scrap in Oman — Baled & Sorted',
    card: 'Post-consumer PET bottles, baled and colour-sorted for recycling.',
    seoTitle: 'PET Bottle Scrap in Oman | Baled PET Bottles — Arabian Polyplast',
    seoDesc: 'Buy and sell PET bottle scrap in Oman. Baled, colour-sorted post-consumer bottles from Barka, loaded at Sohar or Muscat. GCC export available.',
    intro:
      'PET bottle scrap from post-consumer water and soft-drink bottles collected across Oman. We buy baled bottles from collectors, municipalities and factories, sort by colour and contamination, and supply recyclers and flake producers in Oman and the GCC.',
    specs: STD_SPECS([
      ['Colours', 'Clear, light blue, green, mixed'],
      ['Contamination', 'Caps, labels and rings removed where required'],
      ['Bale weight', 'Approx. 200–400 kg']
    ]),
    uses: ['Flake and pellet production', 'Fibre and strapping', 'Export to GCC recyclers']
  },
  {
    slug: 'pet-flakes',
    group: 'plastic',
    name: 'PET Bottle Flakes Scrap',
    h1: 'PET Bottle Flakes Scrap — Hot Washed, Oman',
    card: 'Hot-washed clear, blue and green flakes for fibre and sheet producers.',
    seoTitle: 'PET Bottle Flakes Scrap in Oman | Hot Washed Flakes — Arabian Polyplast',
    seoDesc: 'Hot-washed PET bottle flakes in clear, blue and green from Oman. Sorted, washed, dried and packed for GCC and export buyers.',
    intro:
      'Hot-washed PET bottle flakes produced from post-consumer bottles collected across Oman and the Gulf. Colour-sorted, de-labelled, washed and dried, then packed for fibre, sheet and strapping producers.',
    specs: STD_SPECS([
      ['Colours', 'Clear (natural), light blue, green'],
      ['Form', 'Flakes, hot washed, dried'],
      ['Moisture', 'Below 1% after drying'],
      ['Packing', 'Big bags approx. 1,000–1,250 kg']
    ]),
    uses: ['Polyester fibre and yarn', 'Sheet and strapping', 'Re-pelletising']
  },
  {
    slug: 'pet-preform-scrap',
    group: 'plastic',
    name: 'PET Preform Scrap',
    h1: 'PET Preform Scrap — Factory Offcuts & Rejects',
    card: 'Preform rejects, injection scrap and offcuts from bottle plants.',
    seoTitle: 'PET Preform Scrap in Oman | Factory Rejects — Arabian Polyplast',
    seoDesc: 'PET preform scrap and injection rejects from bottle factories in Oman. Clean, colour-sorted material for recycling and export in the GCC.',
    intro:
      'PET preform scrap from bottle factories: rejects, start-up shots, colour-change material and offcuts. Clean, single-polymer material that needs no washing, collected directly from production lines in Oman.',
    specs: STD_SPECS([
      ['Source', 'Preform and injection moulding factories'],
      ['Colours', 'Clear and coloured, kept separate'],
      ['Contamination', 'Low — factory scrap, no labels or caps']
    ]),
    uses: ['Regrind and re-pelletising', 'Blending with bottle flake', 'Export to GCC processors']
  },
  {
    slug: 'pet-sheet-scrap',
    group: 'plastic',
    name: 'PET Sheet Scrap',
    h1: 'PET Sheet Scrap — Clear Sheet Offcuts',
    card: 'Clear PET sheet, thermoform offcuts and roll ends.',
    seoTitle: 'PET Sheet Scrap in Oman | Thermoform Offcuts — Arabian Polyplast',
    seoDesc: 'Clear PET sheet scrap and thermoform offcuts from Oman. Clean, colour-sorted sheet for recycling and GCC export.',
    intro:
      'PET sheet scrap from thermoforming and packaging lines — sheet offcuts, roll ends and rejects. Clean, transparent material supplied to sheet producers and recyclers in Oman and the GCC.',
    specs: STD_SPECS([
      ['Source', 'Thermoforming and packaging plants'],
      ['Form', 'Sheet offcuts, roll ends, rejects'],
      ['Colours', 'Clear, some coloured by agreement']
    ]),
    uses: ['Sheet extrusion', 'Regrind for packaging', 'Export to GCC']
  },

  // ---------------------------------------------------------------- HDPE family
  {
    slug: 'hdpe-scrap',
    group: 'plastic',
    name: 'HDPE Scrap',
    h1: 'HDPE Scrap in Oman — Bottles, Drums & Crates',
    card: 'Bottle-grade, drum-grade and crate HDPE in bales, regrind or flakes.',
    seoTitle: 'HDPE Scrap in Oman | Bottles, Drums & Crates — Arabian Polyplast',
    seoDesc: 'Buy and sell HDPE scrap in Oman: bottles, jerry cans, drums and crates. Washed flakes, regrind or bales, loaded at Sohar or Muscat.',
    intro:
      'HDPE scrap from bottles, jerry cans, drums, crates and industrial containers. We buy from factories, collectors and municipalities across Oman, wash and grind to your specification, and supply reprocessors in Oman and the GCC.',
    specs: STD_SPECS([
      ['Grades', 'Bottle grade, drum grade, crate regrind'],
      ['Form', 'Washed flakes, regrind, bales'],
      ['Colours', 'Natural, mixed, black, coloured']
    ]),
    uses: ['Pipe and conduit', 'Injection moulding', 'Blow moulding (non-food)']
  },
  {
    slug: 'hdpe100-scrap',
    group: 'plastic',
    name: 'HDPE 100 Scrap',
    h1: 'HDPE 100 Scrap — PE100 Pipe Grade',
    card: 'PE100 pipe offcuts and pressure-pipe scrap, black or natural.',
    seoTitle: 'HDPE 100 Scrap in Oman | PE100 Pipe Grade — Arabian Polyplast',
    seoDesc: 'HDPE 100 (PE100) pipe scrap in Oman: offcuts, coils and pressure-pipe rejects. Ground and packed for pipe producers in the GCC.',
    intro:
      'HDPE 100 (PE100) scrap from pressure pipes, fittings and coils. Pipe offcuts and production rejects are collected from infrastructure projects and pipe plants in Oman, then ground and packed for pipe and fitting producers across the GCC.',
    specs: STD_SPECS([
      ['Grade', 'PE100 pipe grade'],
      ['Form', 'Pipe offcuts, ground regrind'],
      ['Colours', 'Black, natural (blue stripe by agreement)']
    ]),
    uses: ['PE100 pipe extrusion', 'Fittings and couplings', 'Compounding']
  },
  {
    slug: 'hdpe-pipes-scrap',
    group: 'plastic',
    name: 'HDPE Pipes Scrap',
    h1: 'HDPE Pipes Scrap — Offcuts & Coils',
    card: 'Irrigation and pressure pipe offcuts, coils and rejects.',
    seoTitle: 'HDPE Pipes Scrap in Oman | Offcuts & Coils — Arabian Polyplast',
    seoDesc: 'HDPE pipe scrap in Oman: irrigation and pressure pipe offcuts, coils and rejects. Collected, ground and exported from Sohar or Muscat.',
    intro:
      'HDPE pipe scrap from irrigation lines, pressure networks and construction sites — offcuts, damaged coils and rejected sections. We collect across Oman, remove fittings and metal, and prepare the material for reprocessing.',
    specs: STD_SPECS([
      ['Source', 'Irrigation, infrastructure and construction'],
      ['Form', 'Pipe sections, coils, regrind'],
      ['Preparation', 'Fittings and metal inserts removed']
    ]),
    uses: ['Regrind for pipe and conduit', 'Injection moulding', 'Export to GCC']
  },

  // ---------------------------------------------------------------- PVC family
  {
    slug: 'pvc-scrap',
    group: 'plastic',
    name: 'PVC Scrap',
    h1: 'PVC Scrap in Oman — Rigid & Flexible',
    card: 'Rigid PVC from pipes, fittings, profiles and window frames.',
    seoTitle: 'PVC Scrap in Oman | Rigid PVC Buyers — Arabian Polyplast',
    seoDesc: 'PVC scrap in Oman: pipes, fittings, profiles and window frames. Sorted, ground and packed for PVC processors in Oman and the GCC.',
    intro:
      'Rigid PVC scrap from pipes, fittings, profiles and window frames. We buy from factories, contractors and demolition projects in Oman, remove metal and rubber, and supply ground material to PVC compounders and extruders.',
    specs: STD_SPECS([
      ['Types', 'Pipe, profile, window frame, fittings'],
      ['Form', 'Regrind, granules, loose'],
      ['Colours', 'White, grey, mixed']
    ]),
    uses: ['Pipe extrusion', 'Profile extrusion', 'PVC compounds']
  },
  {
    slug: 'pvc-pipe-scrap',
    group: 'plastic',
    name: 'PVC Pipe Scrap',
    h1: 'PVC Pipe Scrap — Offcuts & Rejects in Oman',
    card: 'White and grey PVC pipe offcuts, rejects and demolition pipe.',
    seoTitle: 'PVC Pipe Scrap in Oman | Offcuts & Rejects — Arabian Polyplast',
    seoDesc: 'PVC pipe scrap in Oman: offcuts, production rejects and demolition pipe in white and grey. Ground and packed for export.',
    intro:
      'PVC pipe scrap from production lines, construction projects and demolition — offcuts, rejects and full sections. Sorted by colour, stripped of metal and rubber, then ground and packed for pipe producers and compounders in Oman and the GCC.',
    specs: STD_SPECS([
      ['Source', 'Pipe plants, construction, demolition'],
      ['Form', 'Pipe sections, ground regrind'],
      ['Colours', 'White, grey']
    ]),
    uses: ['PVC pipe extrusion', 'Fittings', 'Compounds']
  },
  {
    slug: 'upvc-profile-scrap',
    group: 'plastic',
    name: 'UPVC Profile Scrap',
    h1: 'UPVC Profile Scrap — Window & Door Profiles',
    card: 'White UPVC window and door profile offcuts and rejects.',
    seoTitle: 'UPVC Profile Scrap in Oman | Window Profiles — Arabian Polyplast',
    seoDesc: 'UPVC profile scrap in Oman: window and door profile offcuts, rejects and demolition frames. Metal reinforcement removed, ground and packed.',
    intro:
      'UPVC profile scrap from window and door fabricators and demolition projects. White profile offcuts and complete frames are collected, steel reinforcement and gaskets removed, then ground and packed for profile extruders and compounders in Oman and the GCC.',
    specs: STD_SPECS([
      ['Source', 'Window/door fabricators, demolition'],
      ['Form', 'Profile offcuts, complete frames, regrind'],
      ['Preparation', 'Steel reinforcement and gaskets removed']
    ]),
    uses: ['UPVC profile extrusion', 'Compounds', 'Export to GCC']
  },

  // ---------------------------------------------------------------- PP / film
  {
    slug: 'pp-scrap',
    group: 'plastic',
    name: 'PP Scrap',
    h1: 'PP Scrap in Oman — Raffia, Woven Bags & Injection',
    card: 'PP raffia, woven bags, caps and injection moulding scrap.',
    seoTitle: 'PP Scrap in Oman | Raffia & Woven Bags — Arabian Polyplast',
    seoDesc: 'Polypropylene scrap in Oman: raffia, woven bags, caps and injection moulding. Baled, ground or washed, loaded at Sohar or Muscat.',
    intro:
      'Polypropylene scrap from woven bags, raffia, caps and injection moulding. Baled, ground or washed to your requirement, supplied to reprocessors and manufacturers in Oman and the GCC.',
    specs: STD_SPECS([
      ['Grades', 'Raffia / woven bag, injection, mixed PP'],
      ['Form', 'Bales, regrind, washed flakes'],
      ['Colours', 'Natural, white, coloured, mixed']
    ]),
    uses: ['Woven sacks and FIBC', 'Injection moulding', 'Fibre and non-woven']
  },
  {
    slug: 'ldpe-film',
    group: 'plastic',
    name: 'LDPE Film Scrap',
    h1: 'LDPE Film Scrap in Oman — Stretch & Packaging Film',
    card: 'Post-industrial stretch, packaging and agricultural film, baled.',
    seoTitle: 'LDPE Film Scrap in Oman | Stretch Film Bales — Arabian Polyplast',
    seoDesc: 'LDPE film scrap in Oman: stretch film, packaging film and agricultural film, baled or washed. Export from Sohar or Muscat to the GCC.',
    intro:
      'LDPE film scrap from packaging lines, warehouses and farms — stretch wrap, packaging film and agricultural film. Post-industrial material with low contamination, baled for export or washed and dried on request.',
    specs: STD_SPECS([
      ['Types', 'Stretch film, packaging film, agricultural film'],
      ['Form', 'Bales, washed flakes'],
      ['Colours', 'Clear, mixed, coloured']
    ]),
    uses: ['Film extrusion', 'Carrier bags', 'Compounds and masterbatch']
  },

  // ---------------------------------------------------------------- PC
  {
    slug: 'pc-bottle-scrap',
    group: 'plastic',
    name: 'PC Bottle Scrap',
    h1: 'PC Bottle Scrap — Polycarbonate Water Bottles',
    card: 'Polycarbonate water bottles and gallons, clear and clean.',
    seoTitle: 'PC Bottle Scrap in Oman | Polycarbonate Bottles — Arabian Polyplast',
    seoDesc: 'PC bottle scrap in Oman: polycarbonate water bottles and gallons. Sorted, cleaned and supplied to PC processors in Oman and the GCC.',
    intro:
      'PC bottle scrap from polycarbonate water bottles, gallons and dispensers. Collected from offices, water companies and collectors in Oman, sorted and cleaned for polycarbonate processors and compounders in the GCC.',
    specs: STD_SPECS([
      ['Source', 'Water coolers, gallons, dispensers'],
      ['Form', 'Whole bottles, ground regrind'],
      ['Colours', 'Clear, blue tint']
    ]),
    uses: ['PC regrind and pellets', 'Injection moulding', 'Export to GCC processors']
  },

  // ---------------------------------------------------------------- metals
  {
    slug: 'aluminium-scrap',
    group: 'metal',
    name: 'Aluminium Scrap',
    h1: 'Aluminium Scrap in Oman — Profiles, Sheets & Castings',
    card: 'Aluminium profiles, sheets, castings and mixed loads.',
    seoTitle: 'Aluminium Scrap in Oman | Profiles & Sheets — Arabian Polyplast',
    seoDesc: 'Aluminium scrap in Oman: extrusion profiles, sheets, castings and mixed loads. Weighed, sorted and prepared for export from Sohar or Muscat.',
    intro:
      'Aluminium scrap from fabrication workshops, construction and industry — extrusion profiles, sheets, castings and mixed loads. Weighed and sorted at our Barka yard and prepared for local processors and GCC export.',
    specs: STD_SPECS([
      ['Types', 'Profiles, sheets, castings, mixed'],
      ['Form', 'Loose, bundled'],
      ['Preparation', 'Iron attachments removed where possible']
    ]),
    uses: ['Remelting', 'Extrusion', 'Export to GCC smelters']
  },
  {
    slug: 'iron-scrap',
    group: 'metal',
    name: 'Iron & Steel Scrap',
    h1: 'Iron Scrap in Oman — HMS, Structural & Machinery',
    card: 'HMS, structural steel, pipes and machinery scrap.',
    seoTitle: 'Iron Scrap in Oman | HMS & Structural Steel — Arabian Polyplast',
    seoDesc: 'Iron and steel scrap in Oman: HMS, structural steel, pipes and machinery. Weighed and prepared for local mills and GCC export.',
    intro:
      'Iron and steel scrap from demolition, industry and machinery — HMS, structural sections, pipes, plates and obsolete equipment. Weighing and preparation are handled at the yard, with loading at Sohar or Muscat.',
    specs: STD_SPECS([
      ['Types', 'HMS, structural, pipes, machinery'],
      ['Form', 'Loose, cut to size on request'],
      ['Preparation', 'Cutting and sorting at the yard']
    ]),
    uses: ['Steel mills', 'Foundries', 'Export to GCC']
  }
];

export const SERVICES = [
  {
    title: 'Scrap buying — Oman & worldwide',
    text: 'We buy plastic and metal scrap from factories, recyclers, contractors, collectors and municipalities across Oman, and source from international suppliers when a specification cannot be met locally.'
  },
  {
    title: 'Processing & upgrading',
    text: 'Sorting, washing, grinding and drying in Barka. Material is prepared to an agreed specification, sampled before loading and packed for sea freight.'
  },
  {
    title: 'Export & import documentation',
    text: 'Container booking, inspection support, packing lists and shipping documents handled in-house — FOB, CFR or CIF from Sohar or Muscat to any destination worldwide.'
  },
  {
    title: 'Loading & logistics',
    text: 'We load at the yard and at the port, photograph every container and share the loading report so the buyer anywhere in the world knows exactly what left Oman.'
  }
];

export const PROCESS = [
  { n: '01', title: 'Enquiry', text: 'Tell us the material, quantity, destination and target specification.' },
  { n: '02', title: 'Sample & quote', text: 'We share photos, a sample and a firm price for the lot.' },
  { n: '03', title: 'Contract', text: 'Specification, packing, Incoterm and payment terms are agreed in writing.' },
  { n: '04', title: 'Prepare & inspect', text: 'Material is processed, sampled and photographed before loading.' },
  { n: '05', title: 'Load & ship', text: 'Container loaded, sealed and documented for Sohar or Muscat.' }
];

export const QUALITY = [
  ['Incoming inspection', 'Every load is weighed and inspected before it enters the yard.'],
  ['Manual sorting', 'Metals, rubber, stones and the wrong polymer are removed by hand.'],
  ['Washing & drying', 'Controlled wash lines and drying so moisture stays within spec.'],
  ['Sampling', 'A sample is taken from each prepared lot and photographed.'],
  ['Packing', 'Bales or big bags labelled with grade, weight and lot number.'],
  ['Loading report', 'Photos and weights at loading, shared with the buyer.']
];

export const FAQS = [
  {
    q: 'Do you buy PET bottle scrap in Oman?',
    a: 'Yes. We buy baled PET bottles across Oman — clear, blue and green — from collectors, municipalities and factories, and we also supply hot-washed PET flakes for export.'
  },
  {
    q: 'Do you buy HDPE, PVC and UPVC scrap?',
    a: 'Yes. We buy HDPE bottles, drums and pipes, HDPE 100 pipe scrap, rigid PVC pipes and fittings, and UPVC window and door profiles, including demolition material.'
  },
  {
    q: 'Do you buy aluminium and iron scrap?',
    a: 'Yes. Aluminium profiles, sheets and castings, and iron and steel scrap such as HMS, structural sections, pipes and machinery are weighed and prepared at our Barka yard.'
  },
  {
    q: 'Do you supply buyers outside Oman?',
    a: 'Yes. We export from Sohar and Muscat to the GCC and worldwide — FOB, CFR or CIF — and we also import selected polymers and metals for Omani manufacturers.'
  },
  {
    q: 'Do you buy scrap from international suppliers?',
    a: 'Yes. We buy from local factories and collectors in Oman and from international suppliers when a grade is not available locally, subject to import rules and inspection.'
  },
  {
    q: 'What is the minimum order?',
    a: 'One 40ft container for most grades. Smaller lots and LCL shipments can be arranged for regular buyers.'
  },
  {
    q: 'Are prices published on the website?',
    a: 'No. Scrap prices move with the market, so every lot is quoted individually after we confirm the specification, quantity and destination.'
  },
  {
    q: 'Can I inspect the material before shipment?',
    a: 'Yes. We share photos and samples, and third-party pre-shipment inspection can be arranged at the yard or at the port.'
  },
  {
    q: 'Where is the yard?',
    a: 'As-Saqsuq, Barka, in the Al Batinah South Governorate of Oman — about an hour from Muscat and within reach of Sohar port.'
  }
];

// Extra SEO page targeting location + broad "all kinds of scrap" searches.
export const OMAN_PAGE = {
  title: 'Scrap Buyers in Oman, the GCC & Worldwide — All Kinds of Scrap',
  seoTitle: 'Scrap Buyers in Oman, GCC & Worldwide | All Kinds of Scrap — Arabian Polyplast',
  seoDesc:
    'Scrap buyers, suppliers and exporters in Oman and worldwide: PET bottle scrap, PC bottle scrap, HDPE, PVC, UPVC profiles, aluminium and iron scrap. Import and export through Barka — Sohar and Muscat loading, FOB/CFR/CIF.',
  h1: 'Scrap buyers, suppliers and exporters — Oman, the GCC and worldwide',
  intro:
    'Arabian Polyplast Trading LLC is a local and international scrap company. From our yard in As-Saqsuq, Barka we buy from Omani factories, contractors and collectors, supply processors in Oman, import selected polymers and metals, and export containers from Sohar and Muscat to the GCC and worldwide.',
  sections: [
    {
      h: 'Plastic scrap we buy and sell',
      p: 'PET bottle scrap, PET bottle flakes, PET preform and sheet scrap, HDPE bottles, drums and crates, HDPE 100 pipe scrap, HDPE pipes, rigid PVC and PVC pipes, UPVC window and door profiles, PP raffia and woven bags, LDPE stretch and agricultural film, and PC bottle scrap.'
    },
    {
      h: 'Metal scrap',
      p: 'Aluminium profiles, sheets and castings, and iron and steel scrap including HMS, structural sections, pipes and machinery — weighed and prepared at the yard before loading.'
    },
    {
      h: 'Import & supply for Omani manufacturers',
      p: 'When a factory needs a grade that is not available locally, we import it from approved international suppliers and deliver in Oman — with specification, quantity and documentation agreed in writing.'
    },
    {
      h: 'Export worldwide',
      p: 'We load at Sohar and Muscat and ship on FOB, CFR or CIF terms to the GCC, Asia, Africa and Europe. Export documentation, inspection support and container photos are handled in-house.'
    },
    {
      h: 'Why buyers and sellers work with us',
      p: 'Weighed loads, written specifications, photos and samples before shipment, one partner from the yard to the port, and a single point of contact for local and international deals.'
    },
    {
      h: 'Coverage',
      p: 'Local: Muscat, Barka, Al Batinah, Sohar and Salalah. Regional: UAE, Saudi Arabia, Qatar, Kuwait and Bahrain. International: Asia, Africa, Europe and the Americas on request.'
    }
  ]
};

export const AR = {
  dir: 'rtl',
  home: {
    title: 'Arabian Polyplast — شراء وتصدير خردة البلاستيك والمعادن في عُمان',
    h1: 'شراء خردة البلاستيك والمعادن في عُمان ودول الخليج',
    intro:
      'شركة Arabian Polyplast Trading LLC تشتري وتعالج وتستورد وتصدّر خردة PET وPC وHDPE وPVC وUPVC والألمنيوم والحديد من بركاء، سلطنة عُمان — إلى دول الخليج وجميع أنحاء العالم، مع تحميل الحاويات من صحار أو مسقط.',
    materials: 'المواد التي نشتريها',
    services: 'خدماتنا',
    cta: 'اطلب عرض سعر',
    sell: 'بِع لنا الخردة'
  }
};
