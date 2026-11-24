// Deep material content — polyolefins: HDPE, PE100, HDPE pipe, PP, LDPE film.

export const OLEFIN_DEEP = {
  'hdpe-scrap': {
    polymer: 'High-density polyethylene (HDPE) — resin code 2',
    related: ['hdpe100-scrap', 'hdpe-pipes-scrap', 'pp-scrap'],
    sections: [
      {
        h: 'From crude oil to HDPE',
        ps: [
          'Naphtha from the distillation column, or ethane straight out of a gas field, is cracked to <b>ethylene</b>. The ethylene is then polymerised at moderate pressure with a catalyst — Ziegler–Natta, Phillips chromium or a metallocene — and the catalyst decides how the chains pack. HDPE chains carry almost no side branches, so they line up tightly and the resin crystallises to 60–80 %. That crystallinity is why HDPE is stiff, opaque and resistant to chemicals, and why it is denser than water.',
          'The same reactor can make pipes, milk bottles and crates by changing the catalyst, the comonomer and the chain length. That is the whole reason a buyer asks for the article type before the tonnage.'
        ]
      },
      {
        h: 'Melt flow index: the number on the label',
        ps: [
          'MFI is the weight of polymer that flows through a standard die in ten minutes at 190 °C under a 2.16 kg load, in g/10 min. High MFI means short chains: the melt is runny and easy to fill a complex mould with. Low MFI means long chains: the melt is stiff, tough and hard to push — what you want for a blow-moulded drum or a pressure pipe.',
          'Typical bands: 0.2–0.5 for blow moulding, 2–5 for film and pipe, 5–12 for injection moulding, 15–25 for caps and thin-wall parts. Recycled HDPE usually lands 0.1–0.3 points above its virgin equivalent because the chain has been shortened, which the buyer compensates for by blending.'
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Density', '0.94–0.96 g/cm³'],
          ['Melting point', '130–137 °C'],
          ['Tensile strength', '20–30 MPa, with 300–800 % elongation'],
          ['Water absorption', '< 0.01 % — it does not take up water, which is why washing is mostly about the surface'],
          ['Chemical resistance', 'Excellent to acids, alkalis and most solvents; swells in some hydrocarbons'],
          ['UV stability', 'Poor without carbon black or a stabiliser package — 2–2.5 % black is standard for outdoor pipes'],
          ['Environmental stress cracking', 'The property that matters in bottles and drums; measured by ESCR and improved by longer chains']
        ]
      },
      {
        h: 'What HDPE is used to make',
        list: [
          'Milk, water, juice and detergent bottles; jerry cans and drums',
          'Crates, pallets, bins and industrial containers',
          'Pressure and non-pressure pipes, cable ducts and geomembranes',
          'Carrier bags and heavy-duty sacks made from blown film',
          'Caps and closures, toys, cutting boards and fuel tanks'
        ]
      },
      {
        h: 'How it becomes scrap',
        ps: [
          'Post-consumer bottles arrive from kerbside collection and sorting plants, usually mixed colour and often compacted. Industrial drums and jerry cans come from chemical, lubricant and food plants — they are high grade but may hold residue, so the seller has to declare what was in them.',
          'Crates, pallets and pipe offcuts come from logistics and construction. The best value is in single-colour, single-source material: one factory\'s natural drums are worth more than a municipal mixed-colour bale, because no one has to pay to sort them.'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Sort', 'Polymer sort by NIR, then colour split. Since HDPE floats, a sink-float tank is a cheap and effective second gate against PVC and PET.'],
          ['Grind and wash', 'Grinding, then hot washing with detergent for drums and bottles; the wash water is treated and recirculated.'],
          ['Dry', 'Mechanical and thermal drying — moisture in HDPE shows up as bubbles and voids in the finished part.'],
          ['Pelletise', 'Extrusion with filtration to remove residual specks, then pelletising. Colour sorting before extrusion decides whether the output is natural, coloured or black.'],
          ['Compound', 'For demanding applications the pellet is compounded with stabiliser, filler or impact modifier, exactly as a virgin grade would be.']
        ]
      },
      {
        h: 'What recycled HDPE becomes',
        list: [
          'Drainage pipe, cable duct and corrugated culvert',
          'Crates, bins, pallets and agricultural containers',
          'Plastic lumber for benches, decking, fencing and boardwalks',
          'Refuse sacks and carrier bags from film-grade recyclate',
          'Non-food bottles and closures'
        ]
      }
    ],
    faq: [
      ['What does MFI tell me about recycled HDPE?', 'Whether it will run on your machine. Ask for the value at 190 °C/2.16 kg and compare it with the grade you use today; if it is more than about 30 % higher, expect to blend it down with virgin.'],
      ['Can coloured HDPE be made clear again?', 'No. Colour is in the polymer, not on it. Mixed colour goes to black or dark end uses.'],
      ['Why do drums need to be declared?', 'A drum that held a solvent behaves differently from one that held shampoo, and some residues are a transport hazard. The declaration is what lets us accept the load legally and safely.']
    ]
  },

  'hdpe100-scrap': {
    polymer: 'PE100 — bimodal high-density polyethylene for pressure pipe (MRS 10 MPa)',
    related: ['hdpe-pipes-scrap', 'hdpe-scrap'],
    sections: [
      {
        h: 'Why PE100 is not just HDPE',
        ps: [
          'PE100 is a specification, not a brand. The "100" means a minimum required strength of 10 MPa after 50 years at 20 °C — the number the pipe is designed against. PE80 and PE63 sit below it. To reach 10 MPa you need a resin that resists slow crack growth for decades, and the industry gets there with <b>bimodal</b> polymerisation: a dual-reactor process makes a low-molecular-weight fraction that flows well and a high-molecular-weight fraction that carries the strength, then blends them in the same particle.',
          'Add a comonomer — butene, hexene or octene — and the short branches tie the crystals together, which is what stops a crack from creeping across a pipe wall under pressure. That single property is why PE100 replaced ductile iron and PVC in buried water mains.'
        ]
      },
      {
        h: 'The numbers that identify the grade',
        table: [
          ['MRS', '10.0 MPa — design stress is MRS divided by a safety factor of 1.25'],
          ['Density', '0.955–0.960 g/cm³'],
          ['MFI', '0.2–0.3 g/10 min at 190 °C/5 kg — deliberately low and narrow'],
          ['Carbon black', '2.0–2.5 % for UV resistance in buried and exposed pipe'],
          ['Standards', 'ISO 4427 (water), ISO 4437 (gas), EN 12201, ASTM D3350 and D3035'],
          ['Pressure classes', 'SDR11 ≈ PN16, SDR17 ≈ PN10, SDR26 ≈ PN6']
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Slow crack growth resistance', 'The defining property; tested by the notch test and the point-load test over thousands of hours'],
          ['Rapid crack propagation', 'Resists fast-running cracks at low temperature — tested on full-size pipe, not on coupons'],
          ['Chemical resistance', 'Excellent to water, brines, acids and alkalis; attacked by strong oxidisers and some hydrocarbons'],
          ['Temperature limit', 'Continuous service to 60 °C with a derating factor above 20 °C'],
          ['Flexibility', 'Tough enough to be coiled and to survive ground movement and trenchless installation']
        ]
      },
      {
        h: 'Where PE100 is used',
        list: [
          'Potable water mains and distribution networks',
          'Gas distribution — the dominant material in new networks',
          'Irrigation mains, sewage rising mains and industrial process lines',
          'Trenchless installation: directional drilling, pipe bursting and sliplining',
          'Floating covers, pontoon and aquaculture frames'
        ]
      },
      {
        h: 'How PE100 becomes scrap',
        ps: [
          'Almost all of it is post-industrial: offcuts from coil ends and spool tails, rejected joints where a fusion weld failed inspection, start-up scrap from the extruder, and pipe removed during a network upgrade. Because the resin is expensive and the application is safety-critical, much of this never leaves the factory as waste — it is reground and re-used in non-pressure products.',
          'Post-consumer PE100 comes from decommissioned mains and irrigation laterals. It is dirty, often full of sand and water, and must be identified correctly: a PE80 pipe looks identical to a PE100 pipe in a trench.'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Identify', 'Check the print line and the pipe markings. Mixing PE80 into a PE100 batch is a downgrade the buyer will test for.'],
          ['Cut and grind', 'Pipes are cut to length or fed whole, then granulated. Large diameters need a shredder before the granulator.'],
          ['Wash', 'Buried pipe carries sand, soil and water; washing is essential before extrusion or the filter blinds in minutes.'],
          ['Dry and pelletise', 'Dried and pelletised with filtration. The carbon black limits colour, so PE100 recyclate is usually black or dark.'],
          ['Re-use', 'Non-pressure drainage, cable duct, road barriers and construction boards. Re-use back into pressure pipe requires full re-certification of the compound.']
        ]
      },
      {
        h: 'What PE100 recyclate becomes',
        list: [
          'Non-pressure drainage and sewer pipe',
          'Cable ducts and conduits',
          'Road barriers, bollards and construction boards',
          'Sheet piling and marine fenders',
          'Rotomoulded tanks and bins, where the black colour is an advantage'
        ]
      }
    ],
    faq: [
      ['How do I tell PE100 from PE80 scrap?', 'By the print line on the pipe, the SDR marking and the resin designation. If the marking is gone, treat it as mixed PE and expect a lower price.'],
      ['Can recycled PE100 go back into water mains?', 'Not without the compound being re-certified for pressure service. In practice recyclate goes into non-pressure products, which is where the volume is anyway.'],
      ['Why is PE100 pipe always black?', 'Carbon black is the cheapest and most effective UV stabiliser, and buried pipe still sees light during storage. Natural PE100 exists for some industrial uses but is rare.']
    ]
  },

  'hdpe-pipes-scrap': {
    polymer: 'Mixed HDPE pipe — irrigation, pressure, conduit and offcuts',
    related: ['hdpe100-scrap', 'hdpe-scrap', 'pvc-pipe-scrap'],
    sections: [
      {
        h: 'One name, many pipes',
        ps: [
          'HDPE pipe scrap covers everything from 16 mm irrigation laterals to 1200 mm outfall lines. They share a polymer family but not a grade: PE63, PE80 and PE100, black or natural, some with a coloured stripe for identification, some co-extruded with a white food-grade liner. The first job with any load is to work out what it actually is.',
          'The chemistry is the same ethylene polymer described on the HDPE page. What changes in a pipe is the comonomer and the molecular weight distribution, chosen so that the pipe can hold pressure for fifty years without cracking.'
        ]
      },
      {
        h: 'Why pipe scrap is graded, not priced by weight alone',
        table: [
          ['Grade', 'Clean factory offcut — highest value, known resin, no soil'],
          ['Grade', 'Fusion-weld rejects — good resin, but the bead is a different heat history'],
          ['Grade', 'Decommissioned main — dirty, wet, mixed PE100/PE80, needs washing'],
          ['Grade', 'Irrigation lateral — thin wall, often UV-degraded and brittle'],
          ['Grade', 'Pipe with fittings — brass, steel or PP inserts must be removed first']
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Density', '0.93–0.96 g/cm³ depending on grade'],
          ['Melting point', '125–137 °C'],
          ['Water absorption', 'Under 0.01 % — the material does not absorb water, but a wet pipe carries it'],
          ['Chemical resistance', 'Excellent to soil, water, acids and alkalis; poor to strong oxidisers and some hydrocarbons'],
          ['UV behaviour', 'Unstabilised pipe chalks and embrittles in the Gulf sun within a season or two']
        ]
      },
      {
        h: 'How pipe scrap arises',
        list: [
          'Installation offcuts from contractors — usually clean and same-day',
          'Extrusion start-up and coil ends from pipe factories',
          'Rejected fusion joints from pressure testing',
          'Decommissioned mains and irrigation networks being replaced',
          'Damaged stock: crushed coils, sun-degraded pipe from outdoor storage'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Sort by marking', 'Separate PE100, PE80 and unknown. Remove fittings, rubber seals and steel inserts.'],
          ['Shred', 'Large diameter pipe is shredded first; thin irrigation tube can go straight to a granulator.'],
          ['Wash', 'Soil and sand from buried pipe are the main contaminant; washing also removes the chalked surface layer.'],
          ['Dry and pelletise', 'Dried and pelletised with filtration. Mixed-grade pipe produces a general-purpose black pellet rather than a pressure grade.'],
          ['Compound or mill', 'Some recyclate is milled to powder for rotomoulding instead of pelletised.']
        ]
      },
      {
        h: 'What pipe recyclate becomes',
        list: [
          'Corrugated drainage and culvert pipe',
          'Cable duct and conduit',
          'Bollards, barriers and construction boards',
          'Rotomoulded water tanks and bins',
          'Plastic lumber for agricultural and marine use'
        ]
      }
    ],
    faq: [
      ['Do you buy irrigation pipe with sand in it?', 'Yes, but the sand is deducted or the price reflects the washing cost. A dry, shaken-out load always prices better.'],
      ['Is sun-damaged pipe worth anything?', 'Less. UV degradation is a surface effect, so the core is still sound, but brittle pipe produces more fines and needs more care in the granulator.'],
      ['What about the brass fittings?', 'Remove them before delivery if you can — otherwise they are removed here and the metal value is credited against the load.']
    ]
  },

  'pp-scrap': {
    polymer: 'Polypropylene (PP) — resin code 5, homopolymer and copolymer',
    related: ['ldpe-film', 'hdpe-scrap'],
    sections: [
      {
        h: 'From crude oil to PP',
        ps: [
          'Propylene comes out of a steam cracker or a refinery fluid catalytic cracker, and is polymerised with a Ziegler–Natta or metallocene catalyst. Homopolymer PP is a simple chain and is stiff and heat-resistant. Random copolymer with a few percent ethylene makes it clearer and softer; impact copolymer, made in a second reactor, disperses rubber domains in the matrix so the part does not shatter in the cold.',
          'PP is the lightest commodity plastic at 0.90–0.91 g/cm³ — lighter than water, which is the single most useful fact in PP recycling: it floats, and everything heavier sinks away from it.'
        ]
      },
      {
        h: 'Melt flow index for PP',
        ps: [
          'PP is measured at 230 °C under 2.16 kg, not the 190 °C used for polyethylene, because its melting point is higher. Woven raffia runs at 2–4 g/10 min, injection moulding at 8–25, and high-speed thin-wall injection at 30+. A recycled raffia stream that has been re-extruded twice will read higher than the original because the chain has been cut.',
          'The practical consequence: a bag maker who buys recycled PP pellets needs the MFI to sit inside a narrow window, or the film will sag on the line or break at the loom.'
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Density', '0.90–0.91 g/cm³ — floats on water'],
          ['Melting point', '160–165 °C homopolymer; 145–155 °C copolymer'],
          ['Tensile strength', '25–40 MPa; impact copolymer trades strength for toughness'],
          ['Chemical resistance', 'Excellent to acids, alkalis and most solvents; swells in chlorinated solvents'],
          ['Fatigue resistance', 'Outstanding — the living hinge on a flip-top cap is PP for exactly this reason'],
          ['Low-temperature behaviour', 'Homopolymer is brittle below 0 °C; impact copolymer is used where that matters']
        ]
      },
      {
        h: 'What PP is used to make',
        list: [
          'Woven raffia bags, cement sacks and FIBC bulk bags',
          'Caps and closures, containers, crates and pallets',
          'Automotive interior parts, battery cases and under-bonnet components',
          'Fibres for rope, geotextile and non-woven hygiene products',
          'Medical syringes, laboratory ware and food containers'
        ]
      },
      {
        h: 'How it becomes scrap',
        ps: [
          'The biggest single stream is raffia: bag plants trim and reject woven fabric continuously, and used cement and fertiliser bags come back from construction sites. Those bags are dirty — cement powder, sand and moisture — and cleaning them is the whole cost of the recycling step.',
          'Injection scrap comes from moulders as runners, start-up shots and rejects. It is usually the cleanest PP available and is often reground in-house rather than sold.'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Sort', 'PP is separated from PE by density in a float tank (both float) and then by NIR or by hand; the give-away is stiffness and sound.'],
          ['Shred and grind', 'Woven bags are baled tight and need a shredder before grinding; injection scrap goes straight to a granulator.'],
          ['Wash', 'The critical step for raffia. Cement and mineral dust must be removed or the pellet is abrasive and grey.'],
          ['Dry and pelletise', 'Dried and pelletised with filtration; degassing is used where the feedstock has odour.'],
          ['Compound', 'Stabiliser is added back — recycled PP has spent its antioxidant package in its first life.']
        ]
      },
      {
        h: 'What recycled PP becomes',
        list: [
          'New woven bags and FIBCs, usually as a blend with virgin',
          'Crates, bins, pallets and garden furniture',
          'Automotive compounds and battery housings',
          'Fibre for rope, twine and geotextile',
          'Non-food containers and construction consumables'
        ]
      }
    ],
    faq: [
      ['Why does recycled PP smell?', 'Odour molecules sit in the polymer and in the mineral filler. Raffia from fertiliser or food bags carries the strongest smell; degassing and hot washing reduce it, and food-grade use needs a validated process.'],
      ['Can PP be recycled many times?', 'Better than most: the chain is relatively stable, but the antioxidant package is consumed each pass, so recycled PP needs re-stabilising to survive another life outdoors.'],
      ['How do you separate PP from HDPE?', 'Both float, so density alone will not do it. NIR sorting is the industrial answer; by hand, PP is stiffer, rings when tapped and has a higher melting point.']
    ]
  },

  'ldpe-film': {
    polymer: 'Low-density polyethylene (LDPE) and linear low-density polyethylene (LLDPE) film',
    related: ['hdpe-scrap', 'pp-scrap'],
    sections: [
      {
        h: 'Why LDPE is made at 2,000 bar',
        ps: [
          'LDPE is made by free-radical polymerisation of ethylene at 1,500–3,000 bar and 200–300 °C. The violent conditions produce a branched chain, and the branches keep the crystals apart, so the resin is soft, transparent and melts at only 105–115 °C. <b>LLDPE</b> is made at low pressure with a catalyst and a comonomer; its chains are linear with short branches, which makes it tougher and allows a thinner film. Most modern stretch film is LLDPE or a blend of the two.',
          'Both are the same family as HDPE; the difference is how much the chains branch. That is why a film bag and a milk bottle can be chemically similar and still behave completely differently on a machine.'
        ]
      },
      {
        h: 'The numbers that matter in film',
        table: [
          ['Density', '0.915–0.925 g/cm³ for LDPE; 0.91–0.94 for LLDPE'],
          ['Melting point', '105–115 °C — the lowest of the commodity polyolefins'],
          ['MFI', '0.3–3 g/10 min at 190 °C/2.16 kg for film grades'],
          ['Dart impact and tear', 'The properties that decide whether a film survives a pallet of bricks'],
          ['Gel count', 'The recycled-film problem: unmelted specks from cross-contamination show up as gels and holes']
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Clarity', 'Good for LDPE; LLDPE is hazier unless metallocene-catalysed'],
          ['Flexibility', 'High — the reason it dominates packaging film'],
          ['Water vapour transmission', 'Low, but not a barrier to oxygen or aroma'],
          ['Chemical resistance', 'Excellent to water, acids and alkalis; swells in hydrocarbons'],
          ['UV stability', 'Poor unless stabilised; agricultural film is usually made with a UV package that has a defined life']
        ]
      },
      {
        h: 'What film is used to make',
        list: [
          'Stretch wrap for pallets, shrink film for multipacks',
          'Carrier bags, bin liners and heavy-duty sacks',
          'Agricultural silage wrap, greenhouse film and mulch film',
          'Construction damp-proof membrane and temporary sheeting',
          'Lamination layers and food packaging film'
        ]
      },
      {
        h: 'How film becomes scrap',
        ps: [
          'Post-commercial stretch film is the best stream: a warehouse or a distribution centre generates a steady, clean, single-polymer supply that is often already baled. It is the closest thing to a closed loop in the plastics trade.',
          'Agricultural film is the hardest. Silage wrap comes back wet, covered in soil and silage, at low bulk density, and it is often mixed with netting and twine. A tonne of it occupies far more space than a tonne of anything else, so transport is a real cost before recycling even starts. Carrier bags from municipal collection sit in between: dirty, mixed with other film, but available in volume.'
        ]
      },
      {
        h: 'How film is recycled',
        steps: [
          ['Sort', 'Film is separated from rigid plastic and from other polymers — PET film, PP film and PVC cling film all behave differently in the melt.'],
          ['Shred and densify', 'Loose film is 30–50 kg/m³, so it is shredded and then densified or agglomerated into a crumb that can be fed to an extruder.'],
          ['Wash', 'Pre-washing removes sand and organic matter; friction washing and a float tank remove the rest. Agricultural film needs the most work.'],
          ['Dry', 'Mechanical dewatering and thermal drying; residual moisture in film causes voids and steam pockets.'],
          ['Pelletise', 'Extrusion with fine filtration — the filter is what removes gels and unmelted specks — then strand or underwater pelletising.']
        ]
      },
      {
        h: 'What recycled film becomes',
        list: [
          'Refuse sacks, bin liners and carrier bags',
          'Agricultural film, often specified with a minimum recycled content',
          'Damp-proof membrane and construction sheeting',
          'Bubble wrap and protective packaging',
          'Moulded products from mixed-film recyclate where colour does not matter'
        ]
      }
    ],
    faq: [
      ['Why is stretch film worth more than silage wrap?', 'Cleanliness and density. Stretch film is dry, single-polymer and already baled; silage wrap is wet, soiled and bulky, so the washing and transport cost is much higher.'],
      ['Can film be recycled back into film?', 'Yes, but the recyclate usually goes into a thicker, less demanding film. Thin high-clarity film needs virgin resin because gels and colour specks show immediately.'],
      ['What causes gels in recycled film pellets?', 'Unmelted particles — usually a few percent of a higher-melting polymer, paper fibres or cross-linked material. Better filtration and better sorting are the only fixes.']
    ]
  }
};
