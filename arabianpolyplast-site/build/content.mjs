// ============================================================================
// ARABIAN POLYPLAST — site content (single source of truth)
// ============================================================================
// Everything a page needs lives here. Placeholders are marked TODO and are the
// ONLY things that must be replaced before the site goes live (phone, CR,
// hours, photos). Nothing is invented: prices are deliberately absent because
// they are quoted per market day.
// ============================================================================

export const SITE = {
  name: 'Arabian Polyplast Trading LLC',
  shortName: 'Arabian Polyplast',
  domain: 'https://arabianpolyplast.com',
  tagline: 'Plastic scrap trading, recycling and recycled polymers from Oman',
  description:
    'Arabian Polyplast Trading LLC buys, processes and exports industrial plastic scrap and recycled polymers from Barka, Oman — PET flakes, HDPE, PP, LDPE film and PVC for factories and manufacturers.',
  // TODO: replace with the real numbers before launch
  phone: '+968 0000 0000',
  whatsapp: '+96800000',
  email: 'info@arabianpolyplast.com',
  cr: 'CR 0000000', // TODO
  founded: '2020',
  hours: 'Sun–Thu 08:00–18:00 · Sat 09:00–14:00', // TODO confirm
  address: {
    line1: 'As-Saqsuq',
    city: 'Barka',
    region: 'Al Batinah South Governorate',
    country: 'Oman',
    postal: ''
  },
  geo: { lat: 23.6848, lng: 57.8861 },
  ports: ['Sohar', 'Muscat (Sultan Qaboos)'],
  mapUrl: 'https://maps.google.com/?q=Arabian+Polyplast+Trading+LLC+Barka+Oman',
  languages: ['en', 'ar']
};

export const NAV = [
  { href: '/', label: 'Home' },
  { href: '/products/', label: 'Materials' },
  { href: '/services.html', label: 'Services' },
  { href: '/quality.html', label: 'Quality' },
  { href: '/sell-scrap.html', label: 'Sell Scrap' },
  { href: '/about.html', label: 'About' },
  { href: '/contact.html', label: 'Contact' }
];

export const TRUST = [
  'Established 2020 in Barka, Oman',
  'Buying, processing and exporting',
  'Container loading at Sohar & Muscat',
  'Export documentation handled in-house'
];

export const PRODUCTS = [
  {
    slug: 'pet-flakes',
    name: 'PET Flakes',
    card: 'Hot-washed clear, blue and green flakes for fibre and sheet producers.',
    intro:
      'Hot-washed PET flakes produced from post-consumer bottles collected across Oman and the Gulf. Sorted by colour, washed, de-labelled and dried, then packed for export.',
    specs: [
      ['Colours', 'Clear (natural), light blue, green'],
      ['Form', 'Flakes, hot washed, dried'],
      ['Typical moisture', 'Below 1% after drying'],
      ['Packing', 'Big bags (approx. 1,000–1,250 kg) or as agreed'],
      ['MOQ', 'One 40ft container'],
      ['Loading port', 'Sohar / Muscat']
    ],
    uses: ['Polyester fibre and yarn', 'Sheet and strapping', 'Re-pelletising for approved applications']
  },
  {
    slug: 'hdpe',
    name: 'HDPE',
    card: 'Bottle-grade and drum-grade HDPE — regrind, flakes or washed.',
    intro:
      'HDPE from jerry cans, drums, crates and bottles. Washed and ground to your specification, with colour sorting for natural and mixed streams.',
    specs: [
      ['Grades', 'Bottle grade, drum grade, crate regrind'],
      ['Form', 'Washed flakes, regrind, or bales'],
      ['Colours', 'Natural, mixed, black, coloured'],
      ['Packing', 'Big bags or bales'],
      ['MOQ', 'One 40ft container'],
      ['Loading port', 'Sohar / Muscat']
    ],
    uses: ['Pipe and conduit', 'Injection moulding', 'Blow moulding for non-food applications']
  },
  {
    slug: 'pp',
    name: 'Polypropylene (PP)',
    card: 'PP raffia, woven bags, injection scrap and granules.',
    intro:
      'Polypropylene scrap from woven bags, raffia, caps and injection moulding. Available as baled, ground or washed material, with pelletising on request.',
    specs: [
      ['Grades', 'Raffia / woven bag, injection, mixed PP'],
      ['Form', 'Bales, regrind, washed flakes, granules'],
      ['Colours', 'Natural, white, coloured, mixed'],
      ['Packing', 'Big bags or bales'],
      ['MOQ', 'One 40ft container'],
      ['Loading port', 'Sohar / Muscat']
    ],
    uses: ['Woven sacks and FIBC', 'Injection moulding', 'Fibre and non-woven']
  },
  {
    slug: 'ldpe-film',
    name: 'LDPE Film',
    card: 'Post-industrial stretch and film scrap, baled or washed.',
    intro:
      'LDPE film from packaging, stretch wrap and agricultural film. Post-industrial material with low contamination, baled for export or washed and dried on request.',
    specs: [
      ['Types', 'Stretch film, packaging film, agricultural film'],
      ['Form', 'Bales, washed flakes'],
      ['Colours', 'Clear, mixed, coloured'],
      ['Packing', 'Bales or big bags'],
      ['MOQ', 'One 40ft container'],
      ['Loading port', 'Sohar / Muscat']
    ],
    uses: ['Film extrusion', 'Carrier bags', 'Compounds and masterbatch']
  },
  {
    slug: 'pvc',
    name: 'PVC',
    card: 'Rigid PVC from pipes, profiles and window frames.',
    intro:
      'Rigid PVC scrap from pipes, window profiles and fittings. Ground and packed for pipe and profile producers, with metal and rubber contamination removed.',
    specs: [
      ['Types', 'Pipe, profile, window frame, fittings'],
      ['Form', 'Regrind, granules'],
      ['Colours', 'White, grey, mixed'],
      ['Packing', 'Big bags'],
      ['MOQ', 'One 40ft container'],
      ['Loading port', 'Sohar / Muscat']
    ],
    uses: ['Pipe extrusion', 'Profile extrusion', 'Compounds']
  },
  {
    slug: 'mixed-plastics',
    name: 'Mixed & Other Polymers',
    card: 'ABS, PC, PS and mixed industrial streams, sorted to your spec.',
    intro:
      'Industrial plastic scrap outside the main five streams — ABS, PC, PS, acrylic and mixed loads. We inspect, sort and prepare the load against your specification before shipment.',
    specs: [
      ['Types', 'ABS, PC, PS, acrylic, mixed industrial'],
      ['Form', 'Regrind, baled, or as inspected'],
      ['Sorting', 'Manual sorting and metal removal'],
      ['Packing', 'Big bags or bales'],
      ['MOQ', 'One 40ft container or LCL by arrangement'],
      ['Loading port', 'Sohar / Muscat']
    ],
    uses: ['Electronics housings', 'Automotive parts', 'Compounding']
  }
];

export const SERVICES = [
  {
    title: 'Scrap buying',
    text: 'We buy plastic scrap from factories, recyclers, collectors and municipalities across Oman. One-off lots and recurring monthly volumes are both welcome, with fair weighing and fast payment terms.'
  },
  {
    title: 'Processing & upgrading',
    text: 'Sorting, washing, grinding and drying in Barka. Material is prepared to an agreed specification, sampled before loading, and packed to survive the sea freight.'
  },
  {
    title: 'Export & documentation',
    text: 'Container booking, pre-shipment inspection support, packing lists, certificates and export paperwork handled in-house — FOB Sohar or Muscat, or delivered terms on request.'
  },
  {
    title: 'Loading & logistics',
    text: 'We load at the yard and at the port, photograph every container, and share the loading report so the buyer knows exactly what left Oman.'
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
  ['Packing', 'Big bags or bales labelled with grade, weight and lot number.'],
  ['Loading report', 'Photos and weights at loading, shared with the buyer.']
];

export const FAQS = [
  {
    q: 'Do you buy plastic scrap from factories in Oman?',
    a: 'Yes. We buy single lots and recurring monthly volumes directly from factories, recyclers and collectors across Oman, with fair weighing and clear payment terms.'
  },
  {
    q: 'What materials do you trade?',
    a: 'PET flakes, HDPE, PP, LDPE film, rigid PVC, and other industrial polymers such as ABS, PC and PS, depending on specification and availability.'
  },
  {
    q: 'Do you export outside Oman?',
    a: 'Yes. We load containers at Sohar and Muscat and handle export documentation in-house. FOB and delivered terms are available on request.'
  },
  {
    q: 'What is the minimum order?',
    a: 'One 40ft container for most grades. Smaller lots and LCL shipments can be arranged for regular buyers.'
  },
  {
    q: 'Are prices published on the website?',
    a: 'No. Plastic prices move with the market, so every lot is quoted individually after we confirm the specification, quantity and destination.'
  },
  {
    q: 'Can I inspect the material before shipment?',
    a: 'Yes. We share photos and samples, and third-party pre-shipment inspection can be arranged at the yard or at the port.'
  },
  {
    q: 'How is the material packed?',
    a: 'Big bags (about 1,000–1,250 kg) or bales, labelled with grade, weight and lot number. Packing can follow the buyer requirement.'
  },
  {
    q: 'Where are you located?',
    a: 'Our yard is in As-Saqsuq, Barka, in the Al Batinah South Governorate of Oman — about an hour from Muscat and close to Sohar port.'
  }
];

export const AR = {
  dir: 'rtl',
  nav: [
    { href: '/ar/', label: 'الرئيسية' },
    { href: '/ar/#materials', label: 'المواد' },
    { href: '/ar/#services', label: 'خدماتنا' },
    { href: '/ar/contact.html', label: 'اتصل بنا' }
  ],
  home: {
    title: 'Arabian Polyplast — تجارة وتدوير البلاستيك في عُمان',
    h1: 'خردة البلاستيك والبوليمرات المعاد تدويرها من عُمان',
    intro:
      'شركة Arabian Polyplast Trading LLC تشتري وتعالج وتصدّر خردة البلاستيك الصناعي والبوليمرات المعاد تدويرها من بركاء، سلطنة عُمان — رقائق PET، HDPE، PP، أفلام LDPE و PVC للمصانع والمصنّعين.',
    materials: 'المواد',
    services: 'خدماتنا',
    cta: 'اطلب عرض سعر',
    sell: 'بِع لنا الخردة'
  }
};
