// Deep material content — PET family.
// Every page carries the same spine: polymer origin, the number that actually
// decides the price, properties, what it makes, how it becomes scrap, how it is
// recycled, and what the recyclate becomes. Numbers are typical industry values,
// not guarantees for a specific lot.

export const PET_DEEP = {
  'pet-bottle-scrap': {
    polymer: 'Polyethylene terephthalate (PET), a thermoplastic polyester — resin code 1',
    related: ['pet-flakes', 'pet-preform-scrap', 'pc-bottle-scrap'],
    sections: [
      {
        h: 'From crude oil to a PET bottle',
        ps: [
          'Crude oil is distilled and the naphtha cut is cracked and reformed. Reforming turns naphtha into <b>paraxylene</b>, which is oxidised to purified terephthalic acid (PTA); cracking the same naphtha gives <b>ethylene</b>, which is converted to monoethylene glycol (MEG). PTA and MEG are cooked together at around 280 °C under vacuum in a polycondensation reactor, and the water that splits out is removed. The result is PET — a long chain of repeating ester units, which is why the family is called polyester.',
          'The polymer leaves the reactor as an amorphous chip with a low intrinsic viscosity. Bottle resin is then heated in a vacuum tumble drier (solid-state polycondensation) to build the chain length back up, because a bottle needs a long chain to resist pressure and to survive being blown into shape.'
        ]
      },
      {
        h: 'The number that decides the price: intrinsic viscosity',
        ps: [
          'Polyolefins are bought on <b>melt flow index</b> (MFI). PET is bought on <b>intrinsic viscosity</b> (IV), measured in dl/g. Bottle grade sits at 0.76–0.84 dl/g; fibre grade at 0.60–0.65; sheet grade around 0.70–0.78. Every heat history and every mechanical cycle shortens the chain a little, so recycled flake typically lands 0.02–0.05 dl/g below the input.',
          'That is the single most useful thing a scrap seller can tell a buyer: where the material came from and how it was processed. Clear bottle flake from a deposit-return scheme with a low heat history is worth more than flake from a hot-washed mixed kerbside stream, even when both look identical in a bag.'
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Density', '1.33–1.38 g/cm³ amorphous · 1.45 g/cm³ crystalline'],
          ['Melting point', '245–255 °C'],
          ['Glass transition', '≈ 78 °C — above this the bottle softens and shrinks'],
          ['Tensile strength', '50–70 MPa, with 50–300 % elongation at break'],
          ['Water absorption', '< 0.5 % in 24 h — but flake must still be dried before extrusion'],
          ['Chemical resistance', 'Good to alcohols, dilute acids and oils; attacked by strong alkalis and some solvents'],
          ['Barrier', 'Moderate CO₂ barrier and good oxygen barrier — the reason it took the soft-drink market']
        ]
      },
      {
        h: 'What PET is used to make',
        list: [
          'Carbonated soft-drink and water bottles, the largest single packaging use',
          'Food trays, jars, clamshells and thermoformed A-PET packaging',
          'Polyester fibre for clothing, carpets and non-woven textiles — roughly two thirds of world PET',
          'Strapping for bricks and bales, and A-PET sheet for printing and folding',
          'Industrial monofilament, geotextiles and, increasingly, recycled filament for 3D printing'
        ]
      },
      {
        h: 'How a bottle becomes scrap',
        ps: [
          'A PET bottle has a working life measured in minutes to a few weeks. It is collected through kerbside schemes, reverse-vending machines, deposit-return systems, municipal sorting centres, hotels, schools and informal collectors. In Oman and the wider GCC most PET arrives through collectors and small yards, which is why bale quality varies so much from load to load.',
          'The contamination that costs money is predictable: PVC and PC bottles mixed in (they carbonise at PET processing temperatures and leave black specks), full bottles that were never emptied, caps and rings in the wrong polymer, glued labels, sand, and moisture. A bale that is 2 % PVC is worth far less than one that is clean, because the buyer has to slow the line down to remove it.'
        ]
      },
      {
        h: 'How we recycle it',
        steps: [
          ['Sort', 'Bales are opened and the bottles are separated by polymer and colour. NIR optical sorters read the polymer; near-infra-red plus colour cameras split clear, light blue, green and mixed. PVC, PC and metal are removed by hand and by sorter.'],
          ['Decontaminate', 'Caps, rings and labels are removed. Bottles that held oil, detergent or chemicals are pulled out — a single oily bottle can spoil a whole wash batch.'],
          ['Grind', 'Bottles are shredded and ground to 10–14 mm flake. Blade condition matters: blunt blades make dust and fines, which the buyer pays for and cannot use.'],
          ['Hot wash', 'Flake is washed at 80–90 °C in a caustic solution with surfactant, then rinsed and friction-washed. Glue and label residue come off here; the caustic also neutralises acidic residues.'],
          ['Dry and classify', 'Mechanical dewatering, then thermal drying to under 1 % moisture. Air classification removes label film and fines, and a metal detector is the last gate before bagging.'],
          ['Pelletise (optional)', 'For bottle-to-bottle or fibre customers the flake is extruded, filtered and pelletised, with solid-state polycondensation to rebuild IV. Food-grade output additionally needs a validated decontamination process and a positive safety opinion.']
        ]
      },
      {
        h: 'What recycled bottles become',
        list: [
          'rPET fibre for clothing, carpet and insulation — the biggest single outlet',
          'New bottles, including bottle-to-bottle where the decontamination process is approved',
          'Thermoformed food trays and blister packaging',
          'Strapping, sheet, and filament for 3D printing',
          'Automotive and construction non-wovens'
        ]
      }
    ],
    faq: [
      ['How many times can PET actually be recycled?', 'Mechanically, the chain shortens on every pass and most PET survives five to seven cycles before the IV is too low for a bottle; fibre and sheet tolerate more. Chemical recycling breaks the chain back to monomers, which in principle allows unlimited cycles, but it is still a small share of capacity.'],
      ['Why is blue PET cheaper than clear?', 'Clear flake can go into food-grade and white-fibre applications, so it has the widest buyer list. Light blue and green are restricted to darker end uses unless the customer pays for decolourising.'],
      ['What moisture level do you require in flake?', 'Under 1 % for sale, and the buyer will still dry it before extrusion. Moisture above that hydrolyses the melt and drops IV faster than any mechanical step.']
    ]
  },

  'pet-flakes': {
    polymer: 'Washed PET flake — the first saleable product after grinding a bottle',
    related: ['pet-bottle-scrap', 'pet-preform-scrap', 'pet-sheet-scrap'],
    sections: [
      {
        h: 'From bottles to flake',
        ps: [
          'Flake is what a bottle becomes after grinding and washing. Nothing about the polymer changes: it is the same polyester chain, cut into 10–14 mm pieces, with the labels, glue, caps and dirt removed. What changes is the economics — flake is dense, dry, testable and shippable, so it trades at a transparent premium to baled bottles and can travel further.',
          'The chemistry is worth knowing because it explains the failure modes. PET is a polyester: water at temperature hydrolyses the ester bond. That is why flake is dried before extrusion and why a hot wash is followed immediately by dewatering and thermal drying rather than a long soak.'
        ]
      },
      {
        h: 'The four numbers a flake buyer checks first',
        table: [
          ['Moisture', 'Target under 1 % — the drier the flake, the less IV is lost in the buyer\'s extruder'],
          ['IV', '0.70–0.80 dl/g typical for washed bottle flake; bottle-to-bottle needs the top of that range'],
          ['PVC content', 'Under 50 ppm. PVC degrades at PET melt temperature and produces black specks and acetaldehyde'],
          ['Colour and fines', 'Clear, light blue, green or mixed; fines and dust are a direct yield loss']
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Bulk density', '250–400 kg/m³ loose, depending on flake size and shape'],
          ['Melting point', '245–255 °C — well above the wash temperature, so washing does not melt the flake'],
          ['Water absorption', 'Low, but surface moisture clings to flake and must be driven off'],
          ['Resistance', 'Good to most oils and dilute acids; avoid strong alkali, which etches the surface'],
          ['Odour', 'The hidden grade: flake from detergent or flavoured-drink bottles carries smell into fibre and sheet']
        ]
      },
      {
        h: 'Grades and what they are used for',
        list: [
          'Fibre grade — the workhorse; clothing, carpet, stuffing, non-woven',
          'Sheet and strapping grade — needs consistent colour and low fines',
          'Food-grade flake — only from a validated decontamination line with a positive safety opinion',
          'Black and dark flake — used in automotive non-wovens and geotextiles',
          'Blow-moulding pellet feed — flake that will be re-polycondensed to rebuild IV'
        ]
      },
      {
        h: 'How flake quality is lost',
        ps: [
          'Three things devalue flake faster than anything else: polymer cross-contamination, moisture, and fines. A single PVC bottle cap in a tonne is 1,000 ppm of a material that will scorch; the buyer cannot remove it after the fact, so the whole lot is downgraded.',
          'The second is heat. Flake that sat in a hot yard in a black bag has already lost IV and picked up odour, and no amount of re-washing brings it back. The third is blade wear: dull blades make dust, and dust is material the customer pays for and cannot process.'
        ]
      },
      {
        h: 'How we produce and handle flake',
        steps: [
          ['Sort by polymer and colour', 'NIR plus colour sorting, with hand-picking for PVC, PC, PETG and metal.'],
          ['Grind', 'Wet grinding keeps the blade cool and suppresses dust. Flake size is held in a tight band so the customer\'s extruder feeds evenly.'],
          ['Wash and rinse', 'Caustic hot wash removes glue and soil; the rinse stage removes the caustic so it does not attack the polymer.'],
          ['Dewater and dry', 'Mechanical dewatering then thermal drying to under 1 % moisture, checked on a moisture analyser before bagging.'],
          ['Classify and metal-detect', 'Air classification strips label film and fines; a metal detector and, where specified, an X-ray gate close the line.']
        ]
      },
      {
        h: 'What flake becomes',
        list: [
          'Polyester staple fibre and filament yarn',
          'Recycled sheet for trays, boxes and displays',
          'Strapping and monofilament',
          'New preforms and bottles after pelletising and IV rebuild',
          'Non-woven fabric for automotive trim and insulation'
        ]
      }
    ],
    faq: [
      ['Is flake better value than baled bottles?', 'Usually yes if you do not own a wash line: you pay for polymer instead of paying to transport water, labels and dirt. If you do own a wash line, baled bottles can be the cheaper feedstock.'],
      ['Why does my flake turn yellow in the extruder?', 'Three common causes: too much moisture, an over-hot barrel, or PVC contamination. All three degrade the polymer at the moment of melting, and none can be reversed.'],
      ['Can washed flake go straight into a bottle?', 'Not directly. Bottle production needs pellets with a higher and more consistent IV, produced on a line with a validated decontamination step.']
    ]
  },

  'pet-preform-scrap': {
    polymer: 'PET preforms — injection-moulded bottle blanks, usually factory rejects',
    related: ['pet-bottle-scrap', 'pet-flakes'],
    sections: [
      {
        h: 'What a preform is',
        ps: [
          'A preform is a test-tube-shaped PET moulding, 15–60 g, with the finished neck and thread already formed. A bottle plant injects preforms, then reheats and blows them into the final shape. Everything about the bottle — the neck dimensions, the barrier, the pressure resistance — is set in the preform, so a plant that produces a bad preform throws it away rather than blowing it.',
          'That makes preform scrap the cleanest PET stream in the market. It has never held a liquid, never been in the sun, never seen a label or a cap, and its IV is the IV the moulder paid for. It is also the most consistent: one colour, one grade, one chain length.'
        ]
      },
      {
        h: 'From oil to preform',
        ps: [
          'The polymer route is the same as any PET: naphtha to paraxylene and ethylene, then PTA plus MEG into a polycondensation reactor. What differs is the next step. Bottle resin is dried and injection moulded at 270–290 °C into a multi-cavity tool, then cooled fast enough to stay amorphous. Amorphous means clear and easy to blow later; if the preform crystallises it turns milky and will not blow cleanly.'
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Weight range', '15–60 g, set by the bottle\'s volume and the pressure it must hold'],
          ['IV', '0.76–0.84 dl/g — the same as bottle resin, undamaged'],
          ['Moisture', 'Low, but preforms absorb water in humid storage and must be dried before re-processing'],
          ['Colour', 'Clear is standard; light blue, green, amber and white are common'],
          ['Contamination', 'Caps, labels and dust only — no product residue, which is what makes it premium']
        ]
      },
      {
        h: 'Why plants generate it',
        list: [
          'Start-up and shut-down shots while the tool reaches temperature',
          'Colour and resin changes between product runs',
          'Short shots, flash and dimensional rejects caught by the camera',
          'Damaged necks from handling, and obsolete preforms for a bottle that is no longer sold',
          'Purge lumps from the injection unit'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Separate', 'Keep colours apart and remove purge lumps, which carry a different heat history and often contain degraded resin.'],
          ['Grind', 'Ground to regrind or flake. Preform regrind is dense and clean, so it blends back into bottle production more easily than post-consumer flake.'],
          ['Dry', 'Dried before extrusion or re-injection; moisture is the main cause of IV loss here.'],
          ['Re-use', 'Many plants feed a controlled percentage of their own regrind back into preforms; the rest is sold as high-IV flake or pelletised.']
        ]
      },
      {
        h: 'What it becomes',
        list: [
          'New preforms, where the moulder allows regrind in the recipe',
          'High-IV flake for strapping, sheet and monofilament',
          'Fibre, when the colour rules out packaging',
          'Blended into bottle-to-bottle pellet feed, where the IV is high enough to lift a weaker stream'
        ]
      }
    ],
    faq: [
      ['Why is preform scrap worth more than bottle scrap?', 'No product residue, no labels or caps, one grade, known IV and a short heat history. The buyer skips an entire decontamination step.'],
      ['Can coloured preforms be used for clear bottles?', 'No. Colour cannot be removed mechanically. Coloured preform regrind goes to fibre, strapping or dark applications.'],
      ['What is a purge lump and why does it matter?', 'A lump of melted resin from start-up or colour change. It has been hot for a long time, so its IV is low and it can carry degraded specks — keep it out of the good regrind.']
    ]
  },

  'pet-sheet-scrap': {
    polymer: 'PET sheet — A-PET, CPET and PETG offcuts from thermoforming',
    related: ['pet-flakes', 'pet-bottle-scrap', 'pp-scrap'],
    sections: [
      {
        h: 'From pellets to sheet',
        ps: [
          'PET sheet is made by extruding dried pellets through a flat die onto chilled rollers. Cooled fast, the sheet stays <b>amorphous</b> (A-PET): clear, stiff and easy to thermoform into trays, lids and blister packs. Cooled slowly, or with a nucleating agent, it becomes <b>crystalline</b> (CPET), which is opaque and survives an oven. Add glycol during polymerisation and you get PETG, a tougher, easier-to-form variant used for displays and medical packaging.',
          'The distinction matters when the sheet comes back as scrap: A-PET, CPET and PETG are three different products with three different melting behaviours, and mixing them ruins the batch.'
        ]
      },
      {
        h: 'What the buyer measures',
        table: [
          ['Type', 'A-PET, CPET or PETG — never mixed'],
          ['Thickness', '0.2–1.5 mm typical; thin sheet produces more fines when ground'],
          ['IV', 'Sheet grade is usually 0.70–0.78 dl/g, lower than bottle grade'],
          ['Print and lamination', 'Printed or laminated sheet is downgraded; the ink and film do not disappear in the wash'],
          ['Moisture', 'Sheet absorbs water; it must be dried before re-extrusion']
        ]
      },
      {
        h: 'Physical properties',
        table: [
          ['Clarity', 'A-PET is glass-clear; CPET is opaque white; PETG is clear and slightly softer'],
          ['Heat resistance', 'A-PET distorts near 70 °C; CPET holds shape to about 180 °C for oven use'],
          ['Stiffness', 'High — the reason a 0.4 mm tray can carry a meal without a frame'],
          ['Sealability', 'Needs a coated or laminated surface; the coating is a contaminant in recycling'],
          ['Recyclability', 'A-PET and CPET are recyclable with PET; PETG should be kept separate because it lowers the melting point of the batch']
        ]
      },
      {
        h: 'What sheet makes',
        list: [
          'Thermoformed food trays, punnets, cups and lids',
          'Blister packs and clamshells for retail and medical devices',
          'Printed display and signage sheet',
          'Foldable packaging and window cartons',
          'Industrial separators, spacers and gaskets'
        ]
      },
      {
        h: 'How it becomes scrap',
        ps: [
          'Most sheet scrap is post-industrial: the skeleton left after a tray is punched out of a sheet, trim from the edges, start-up sheet while the die stabilises, and roll ends. It is clean, dry and single-grade, which makes it one of the better feedstocks in the PET world.',
          'Post-consumer sheet arrives as used trays from food packers and retailers. It carries food residue, printed lids and lamination, and needs a real wash rather than a rinse. Mixed loads of tray, lid and film are the usual problem — the film is often a different polymer entirely.'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Keep the types apart', 'A-PET, CPET and PETG are separated before grinding. Mixing is the most common reason a sheet load is rejected.'],
          ['Grind', 'Ground to flake or agglomerate, with dust extraction because thin sheet makes a lot of fines.'],
          ['Wash if post-consumer', 'Hot wash with surfactant for food residue, then rinse and dry to under 1 % moisture.'],
          ['Pelletise or re-extrude', 'Clean post-industrial regrind is often re-used directly in the same plant; post-consumer flake is pelletised before it travels.']
        ]
      },
      {
        h: 'What it becomes',
        list: [
          'New A-PET sheet for trays and packaging',
          'Strapping and monofilament',
          'Fibre, when print or lamination rules out packaging',
          'Blended into bottle-grade pellet feed at a controlled ratio'
        ]
      }
    ],
    faq: [
      ['Can printed tray scrap be recycled?', 'Yes, but it is downgraded. Ink and coating survive the wash and show up as specks in light-coloured output, so printed sheet goes to dark or fibre applications.'],
      ['Why must PETG be kept separate?', 'PETG melts lower and behaves differently in the extruder. A small percentage in a PET batch softens the whole lot and can make it unusable for sheet or bottle.'],
      ['Is sheet scrap better than bottle scrap?', 'For a converter, yes: it is dry, single-grade and already the right IV. For volume, bottles win — there is far more of them.']
    ]
  }
};
