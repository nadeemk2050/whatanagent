// Deep material content — PVC family, polycarbonate, and the two metals.

export const OTHER_DEEP = {
  'pvc-scrap': {
    polymer: 'Polyvinyl chloride (PVC) — resin code 3, rigid and plasticised',
    related: ['pvc-pipe-scrap', 'upvc-profile-scrap', 'hdpe-scrap'],
    sections: [
      {
        h: 'Half of PVC is not oil at all',
        ps: [
          'Ethylene comes from naphtha, as it does for polyethylene. The other half of PVC comes from <b>salt</b>: brine is electrolysed in a chlor-alkali plant to chlorine, the chlorine is reacted with ethylene to make ethylene dichloride, and that is cracked into vinyl chloride monomer (VCM). VCM is polymerised in water — suspension polymerisation accounts for about four fifths of world production — and the result is a white powder, S-PVC.',
          'Because chlorine is 57 % of the molecule by weight, PVC carries its own fire retardant. It does not need a flame-retardant additive to stop burning; it self-extinguishes once the flame is removed. That one property, plus the price of salt versus oil, is why PVC won the pipe and window markets.'
        ]
      },
      {
        h: 'Why PVC is bought on K-value, not MFI',
        ps: [
          'PVC does not melt cleanly — it degrades, releasing hydrogen chloride, at temperatures only slightly above where it softens. So it is never bought on melt flow. Buyers use the <b>K-value</b> (or the equivalent inherent viscosity), which describes molecular weight: K67 is the pipe standard, K70 is used for profiles that need more strength, K57 for injection moulding and rigid sheet.',
          'Higher K-value means longer chains, tougher product and a harder melt to process. Recycled PVC keeps its K-value, but it loses stabiliser and lubricant in service and in processing, so recyclate is always re-compounded with a fresh additive package.'
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Density', '1.35–1.45 g/cm³ rigid; 1.16–1.35 plasticised'],
          ['Softening', '≈ 80 °C; processed at 160–200 °C under stabilisation'],
          ['Tensile strength', '40–55 MPa rigid'],
          ['Flammability', 'Self-extinguishing; oxygen index around 45 %'],
          ['Chemical resistance', 'Excellent to acids, alkalis, salt solutions and aliphatic hydrocarbons; attacked by ketones, esters and chlorinated solvents'],
          ['Weakness', 'Brittle at low temperature and sensitive to UV unless TiO₂ and stabilisers are added']
        ]
      },
      {
        h: 'What PVC is used to make',
        list: [
          'Pipes, fittings, gutters and drainage systems — the largest single use',
          'Window and door profiles, siding and cladding',
          'Cable insulation and conduit',
          'Flooring, wall covering and roofing membrane',
          'Medical tubing, blood bags and gloves in the plasticised grades'
        ]
      },
      {
        h: 'How PVC becomes scrap',
        ps: [
          'Post-industrial scrap dominates: pipe offcuts from installers, window fabrication waste, cable trimming, and rejects from the extruder. It is clean, single-grade and usually white or grey, which makes it the easiest PVC to recycle.',
          'Post-consumer PVC comes from demolition, refurbishment and municipal collection. The problem there is mixing: rigid PVC, plasticised PVC, and the PVC that is glued to other materials. Plasticised PVC in a rigid batch softens the whole lot and ruins the stiffness the next product needs.'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Separate rigid from flexible', 'The most important split. Plasticiser migrates, so a small amount of flexible PVC turns a rigid batch rubbery.'],
          ['Remove metal and rubber', 'Fittings, brass inserts, rubber seals and steel reinforcement come out before grinding.'],
          ['Grind', 'Ground to a powder or a fine regrind. PVC recycling is often done as a dry blend, exactly like virgin compounding.'],
          ['Re-compound', 'Fresh stabiliser (Ca/Zn in modern waste), lubricant and impact modifier are added back; the old package was consumed in the first life.'],
          ['Extrude', 'Extruded into pipe, conduit or profile. PVC tolerates several mechanical cycles because the additive package can be topped up each time.']
        ]
      },
      {
        h: 'What recycled PVC becomes',
        list: [
          'Conduit, drainage pipe and cable trunking',
          'Window profile cores, with a virgin skin co-extruded over the recyclate',
          'Flooring, tiles and sound barriers',
          'Shoe soles and industrial hoses in the flexible grades',
          'Traffic cones, garden edging and construction accessories'
        ]
      }
    ],
    faq: [
      ['Is PVC recyclable if it contains chlorine?', 'Yes. The chlorine is what makes it flame-retardant, not what makes it unrecyclable. Mechanical recycling of rigid PVC is routine; the limits are additive age and mixing with plasticised grades.'],
      ['Why is old PVC sometimes refused?', 'Legacy lead stabilisers. PVC made before the industry phase-out can carry lead, and a buyer who is supplying a regulated market has to test for it.'],
      ['Can PVC and PET be mixed?', 'No — and even a tiny amount of PVC in a PET batch is a defect. That is why both sides of the trade test for it.']
    ]
  },

  'pvc-pipe-scrap': {
    polymer: 'Rigid PVC pipe scrap — offcuts, rejects and demolition pipe',
    related: ['pvc-scrap', 'upvc-profile-scrap', 'hdpe-pipes-scrap'],
    sections: [
      {
        h: 'The pipe that built the plumbing trade',
        ps: [
          'PVC pipe is extruded from S-PVC powder blended with stabiliser, lubricant, filler and pigment. It competes with HDPE on cost and stiffness and loses on flexibility and low-temperature impact, which is why you see PVC above ground and in drains, and PE in buried pressure mains.',
          'The polymer background is on the PVC page: ethylene plus chlorine from salt, suspension polymerised, K67 for pipe. What matters here is the shape — a pipe has a very high surface-to-volume ratio, so it collects soil, and a very consistent wall thickness, which makes it easy to granulate.'
        ]
      },
      {
        h: 'Grades and what they are worth',
        table: [
          ['Factory offcut', 'Clean, single colour, known K-value — the best grade'],
          ['Installation offcut', 'Clean but mixed diameters and colours; may carry solvent-weld residue'],
          ['Demolition pipe', 'Dirty, may contain water, rubble and fittings; needs washing'],
          ['Sewer pipe', 'Heaviest contamination; usually goes to drainage products rather than profiles'],
          ['Chlorinated PVC (CPVC)', 'Hot-water pipe — a different polymer, must be kept separate']
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Density', '1.38–1.45 g/cm³'],
          ['Pressure service', 'Rated by SDR and pressure class; PVC-U is common to PN16 in drainage and water'],
          ['Thermal expansion', 'About 5 × 10⁻⁵ /K — noticeably more than metal, which is why pipe runs need expansion gaps'],
          ['Chemical resistance', 'Excellent for sewage, acids and salt water; not for ketones or chlorinated solvents'],
          ['Impact', 'Brittle in cold weather; pipe is rated for installation temperature, not just pressure']
        ]
      },
      {
        h: 'How pipe becomes scrap',
        list: [
          'Offcuts from new installations — the largest clean stream',
          'Rejected pipe from hydrostatic testing and ovality checks',
          'Start-up scrap while the extruder stabilises',
          'Demolition and refurbishment pipe from buildings and networks',
          'Damaged stock from site handling and UV exposure in storage'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Sort by type', 'PVC-U, CPVC and plasticised hose are separated. CPVC looks identical and melts differently.'],
          ['Strip the fittings', 'Solvent-welded fittings, rubber rings and brass inserts are removed; a granulator will happily shred brass into the product otherwise.'],
          ['Shred and granulate', 'Large pipe is shredded; the granulate is sized for the next extruder.'],
          ['Wash and dry', 'Demolition pipe needs washing for soil and rubble; the material is then dried before compounding.'],
          ['Re-compound and extrude', 'Stabiliser and lubricant are refreshed, then the recyclate is extruded into conduit, drainage pipe or a core layer under a virgin skin.']
        ]
      },
      {
        h: 'What pipe recyclate becomes',
        list: [
          'Electrical conduit and cable duct',
          'Non-pressure drainage pipe and fittings',
          'Window profile cores and fencing',
          'Cable protection tiles and ducting accessories',
          'Drainage components where the colour is hidden or painted'
        ]
      }
    ],
    faq: [
      ['Can PVC pipe be recycled into new pressure pipe?', 'Technically possible with a validated compound, but in practice recyclate goes into non-pressure products, where certification is simpler and the market is larger.'],
      ['Why does pipe scrap need washing?', 'A buried pipe carries soil, sand and sometimes sewage. Those contaminants destroy the surface finish of the next product and wear the extruder.'],
      ['Is CPVC accepted with PVC?', 'No. Chlorinated PVC is a different polymer with a higher service temperature and different processing; mixing it ruins both streams.']
    ]
  },

  'upvc-profile-scrap': {
    polymer: 'Unplasticised PVC window and door profiles',
    related: ['pvc-scrap', 'pvc-pipe-scrap'],
    sections: [
      {
        h: 'Why a window profile is more than plastic',
        ps: [
          'A modern uPVC window is a system: a multi-chambered profile extruded from rigid PVC, a galvanised steel reinforcement inside the main chambers, EPDM or TPE gaskets, and metal hardware. By weight roughly 60–70 % of the finished window is PVC, and the chambers are there to trap air and carry the steel, not to save material for its own sake.',
          'The polymer itself is the same suspension PVC described on the PVC page, but the compound is different: a profile grade runs at a higher K-value (around K70) with a bigger impact-modifier package, because a window has to survive being hit, thermally cycled and screwed into at the corners.'
        ]
      },
      {
        h: 'What the buyer checks',
        table: [
          ['Colour', 'White dominates; laminated and foiled profiles are downgraded because the film cannot be separated'],
          ['Steel content', 'Reinforcement must be removed — a magnet is the first tool on the line'],
          ['Gaskets', 'EPDM and TPE are a different polymer; they are pulled out before grinding'],
          ['Glass', 'Any glazed unit has to be deglazed first; glass destroys a granulator'],
          ['Age and stabiliser', 'Older profiles may carry lead stabilisers, which some markets will not accept']
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Density', '1.40–1.50 g/cm³ for the compounded profile'],
          ['Thermal insulation', 'The multi-chamber geometry, not the polymer, delivers the U-value'],
          ['Weathering', 'TiO₂ and stabilisers hold colour and impact strength against Gulf sun'],
          ['Colour fastness', 'Unstabilised PVC chalks and yellows within a few seasons'],
          ['Recyclability', 'Good mechanically; the limits are the steel, the gaskets and the foil']
        ]
      },
      {
        h: 'How profile scrap arises',
        list: [
          'Fabrication offcuts — typically 5–15 % of every profile a window factory buys',
          'Rejected frames from dimensional or weld checks',
          'Post-consumer windows from demolition and refurbishment',
          'Obsolete stock when a systems house changes its range'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Deglaze and desteel', 'Glass, steel reinforcement, gaskets and hardware come out. This is the labour-intensive part and the reason post-consumer windows cost more to process.'],
          ['Grind', 'Ground to a fine regrind; white profile regrind is the most valuable colour.'],
          ['Re-compound', 'Stabiliser, lubricant and impact modifier are added back — a 20-year-old window has used up its additive package.'],
          ['Co-extrude', 'The usual route is a core of recyclate with a thin virgin skin, which restores the surface finish and the UV resistance.'],
          ['Alternative uses', 'Recyclate that cannot go back into a window becomes pipe, conduit, fencing or decking.']
        ]
      },
      {
        h: 'What profile recyclate becomes',
        list: [
          'New window profiles as the core layer',
          'Fencing, decking and cladding boards',
          'Pipe and conduit',
          'Shuttering and construction profiles',
          'Noise barriers and partition systems'
        ]
      }
    ],
    faq: [
      ['Can white window scrap become white again?', 'Yes, if it is clean white profile with no foil or print. Mixed or weathered profile goes into grey or dark products, usually behind a virgin skin.'],
      ['Why is laminated profile worth less?', 'The foil or film is a different polymer and cannot be removed economically, so it shows as specks and limits the recyclate to dark applications.'],
      ['What happens to the steel inside?', 'It is separated magnetically and sold as light steel scrap. A tonne of windows typically yields a meaningful fraction of reinforcement steel.']
    ]
  },

  'pc-bottle-scrap': {
    polymer: 'Polycarbonate (PC) — the returnable water-cooler carboy',
    related: ['pet-bottle-scrap', 'hdpe-scrap'],
    sections: [
      {
        h: 'From benzene to polycarbonate',
        ps: [
          'Benzene is converted to phenol and acetone, which are condensed into <b>bisphenol A</b> (BPA). BPA is then reacted with phosgene — or, in the newer melt process, with diphenyl carbonate — to form a carbonate linkage between BPA units. The result is an amorphous, glass-clear polymer with a very high glass transition temperature of about 147 °C.',
          'That high Tg and a notched impact strength several times that of PET are why polycarbonate is the material of the 19-litre water-cooler carboy: it is dropped, refilled and steam-cleaned dozens of times, and it survives.'
        ]
      },
      {
        h: 'Melt flow index for PC',
        ps: [
          'PC is measured at 300 °C with a light load. Water-bottle grades run at 3–8 g/10 min — a stiff melt, because a carboy needs a long chain to resist stress cracking under repeated washing. Injection grades for electrical housings sit higher, 10–20.',
          'Recycled PC is sensitive to moisture and heat: it hydrolyses in the melt, which shows up immediately as a drop in impact strength. Drying at 120 °C for several hours is not optional.'
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Density', '1.20–1.22 g/cm³'],
          ['Glass transition', '≈ 147 °C — no crystalline melting point'],
          ['Notched impact strength', '600–900 J/m, among the highest of any transparent plastic'],
          ['Clarity', 'Optical-quality transparency, slightly warmer in tone than glass'],
          ['Chemical resistance', 'Attacked by strong alkalis and some solvents; stress-cracks under sustained load in the wrong cleaning agent'],
          ['UV', 'Yellows without a UV stabiliser; outdoor grades carry a coating or an additive']
        ]
      },
      {
        h: 'What PC is used to make',
        list: [
          'Returnable 19-litre water-cooler carboys and large water bottles',
          'Safety glasses, face shields and machine guards',
          'Electrical housings, switchgear and meter covers',
          'Sheet for signage, machine guards and roofing',
          'Medical devices and reusable laboratory ware'
        ]
      },
      {
        h: 'The BPA question, honestly',
        ps: [
          'Bisphenol A can migrate from polycarbonate in small quantities, and the regulatory position has tightened sharply: the EU banned BPA in food-contact materials including infant products, and the tolerable daily intake was revised downwards by several orders of magnitude in 2023. Polycarbonate carboys are still widely used across the Gulf because the reusable-bottle model depends on their toughness, but the direction of regulation is clear.',
          'For recycling this means one practical rule: polycarbonate recyclate from bottles is steered into non-food applications — electrical parts, profiles, sheet, housings — where the food-contact question does not arise.'
        ]
      },
      {
        h: 'How carboy scrap arises',
        list: [
          'End-of-life carboys from water companies — scratched, crazed or failed leak tests',
          'Factory rejects from the blow-moulding line',
          'Damaged stock, cracked necks and failed threads',
          'Sheet and sign offcuts from fabrication shops'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Remove fittings', 'Caps, taps and any inserts come off; a carboy with a brass tap contaminates the whole batch.'],
          ['Grind', 'Ground to flake; blades need to be sharp because PC is tough and heats quickly.'],
          ['Wash and dry', 'Water residue and algae from long service need removing, then the flake is dried thoroughly.'],
          ['Pelletise', 'Extruded with filtration and pelletised. Heat history is kept short — every extra pass costs impact strength.'],
          ['Apply', 'Sold into non-food products: electrical housings, profiles, sheet, and compounded blends loaded with glass fibre.']
        ]
      },
      {
        h: 'What recycled PC becomes',
        list: [
          'Electrical and electronic housings',
          'Profiles, sheet and light fittings',
          'Automotive interior trim and under-bonnet parts in blends',
          'Construction fixings and machine guards',
          'Glass-fibre reinforced compounds for structural parts'
        ]
      }
    ],
    faq: [
      ['Is polycarbonate still used for drinking water?', 'The returnable carboy is still common in the Gulf and much of Asia, while the EU has moved away from BPA-based food contact. Regulation is moving, and recycled PC is directed to non-food uses either way.'],
      ['Why is PC harder to recycle than PET?', 'It is a much smaller and more fragmented stream, it hydrolyses if dried badly, and its main outlet — reusable bottles — is a closed loop that the water companies already run themselves.'],
      ['How do you tell PC from PET bottles?', 'PC is heavier, warmer to the touch, has a duller ring when tapped, and sinks in water, whereas PET also sinks but has a different feel and a visible injection point. A burn test shows PC\'s aromatic, sooty flame; NIR sorting settles it industrially.']
    ]
  },

  'aluminium-scrap': {
    polymer: 'Aluminium and its alloys — not a polymer, a metal recovered by melting',
    related: ['iron-scrap', 'hdpe-scrap'],
    sections: [
      {
        h: 'From bauxite to metal, and why scrap matters so much',
        ps: [
          'Aluminium does not come from oil. Bauxite is refined with caustic soda into alumina (the Bayer process), and the alumina is dissolved in a cryolite bath and reduced by electrolysis (the Hall–Héroult process) at roughly 950 °C. That reduction takes 13–15 kWh of electricity per kilogram — aluminium is, in effect, stored electricity.',
          'Melting scrap aluminium takes about 5 % of that energy, and this is the whole economics of the trade. A tonne of aluminium scrap is a tonne of electricity already paid for, which is why the metal is bought, sorted and shipped across borders far more readily than any plastic.'
        ]
      },
      {
        h: 'The grades and what decides the price',
        table: [
          ['Taint / tabor', 'Clean painted or coated sheet, 0.2–0.8 mm — the benchmark grade'],
          ['UBC', 'Used beverage cans, baled, usually with a moisture and steel allowance'],
          ['Extrusion (6xxx)', 'Window and door profile, ladder and railing offcuts — high value, low iron'],
          ['Casting', 'Gearbox and engine castings, often with steel inserts and oil'],
          ['Irony aluminium', 'Aluminium attached to steel or iron — needs separation, priced accordingly'],
          ['Radiators and turnings', 'Mixed alloy, fine particles, higher melt loss']
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Density', '2.70 g/cm³ — about a third of steel'],
          ['Melting point', '660 °C for pure aluminium; alloys melt lower'],
          ['Corrosion resistance', 'Excellent; a self-healing oxide layer forms within seconds of exposure'],
          ['Electrical conductivity', 'About 60 % of copper by volume, which is why it is used in overhead lines'],
          ['Non-magnetic', 'The basis of the cheapest separation step in any yard'],
          ['Recyclability', 'Effectively unlimited — the alloy changes with each melt, but the metal is never consumed']
        ]
      },
      {
        h: 'What aluminium is used for',
        list: [
          'Window, door and façade profiles in construction',
          'Beverage cans, foil and food packaging',
          'Automotive castings, heat exchangers and body panels',
          'Electrical cable, busbar and overhead conductors',
          'Aircraft structures, in the high-strength alloys'
        ]
      },
      {
        h: 'How aluminium becomes scrap',
        ps: [
          'Fabricators produce clean, predictable scrap every day: extrusion offcuts, punching skeletons, turning and milling chips. Construction and demolition supply windows and curtain walling, often with glass and rubber still attached. Municipal collection supplies cans, foil and small domestic items.',
          'The value of a load is set by three things: alloy mix, attachment (steel bolts, glass, rubber, paint) and moisture. A clean 6063 extrusion is a fundamentally different product from a mixed irony load, even though both are "aluminium scrap".'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Sort', 'Magnetic separation removes steel; eddy-current separators eject aluminium from mixed material; X-ray and LIBS sorters separate alloy families.'],
          ['Prepare', 'Shredding and baling; painted or coated material may be delacquered thermally so the coating does not burn in the furnace.'],
          ['Melt', 'Rotary or reverberatory furnace with a salt flux to protect the metal from oxidation. Melt loss is the key cost — thin, dirty scrap loses more metal than thick, clean scrap.'],
          ['Refine', 'Degassing removes hydrogen, filtration removes oxides, and alloying adjusts the chemistry to the target specification.'],
          ['Cast', 'Poured into ingots, billets or sow for extrusion, rolling or casting. Recovery from clean scrap is typically 90–95 %.']
        ]
      },
      {
        h: 'What recycled aluminium becomes',
        list: [
          'New extrusion profiles for construction and transport',
          'Automotive castings and engine components',
          'Beverage cans, where the alloy loop is well established',
          'Sheet and foil for packaging',
          'Deoxidation aluminium for the steel industry'
        ]
      }
    ],
    faq: [
      ['Why is aluminium scrap priced so differently from plastic?', 'Because it is a metal with a global exchange price, and because melting it costs a fraction of making it from ore. Plastic recyclate competes with cheap virgin resin; aluminium recyclate competes with very expensive primary metal.'],
      ['What is irony aluminium?', 'Aluminium with steel or iron attached — a window with a steel core, a casting with a bearing race. It needs separation before melting, so it is priced lower than clean material.'],
      ['Does painted aluminium lose value?', 'A little. The coating burns off and is either recovered in the baghouse or lost; delacquering before melting reduces the loss and the emissions.']
    ]
  },

  'iron-scrap': {
    polymer: 'Iron and steel scrap — the most recycled material on earth',
    related: ['aluminium-scrap', 'hdpe-scrap'],
    sections: [
      {
        h: 'Two routes to steel, one of them is scrap',
        ps: [
          'Primary steel starts with iron ore, coke and limestone in a blast furnace, producing pig iron that is refined in a basic oxygen furnace. The second route melts <b>scrap</b> in an electric arc furnace and casts it directly. The electric route is shorter, cheaper to build and the reason scrap steel has a firm international price.',
          'Steel is the most recycled material in the world by tonnage — several hundred million tonnes a year — because it is magnetic, easy to melt and loses nothing in the process. A steel beam can become a steel beam again indefinitely; only the alloying elements need adjusting.'
        ]
      },
      {
        h: 'Grades: the language of the trade',
        table: [
          ['HMS 1', 'Heavy melting scrap, at least 6 mm thick — structural steel, plate, thick sections'],
          ['HMS 1&2', 'Usually 80 % HMS 1 and 20 % HMS 2 (thinner, down to 4 mm) — the standard export grade'],
          ['Shredded', 'Car and light scrap shredded and magnetically separated; dense and uniform'],
          ['Plate and structural', 'Thick plate, beams and columns, minimum thickness specified'],
          ['Busheling', 'Clean factory punchings and trimmings, no coating'],
          ['Rebar / re-rolling', 'Deformed bar lengths, often sold for re-rolling rather than melting'],
          ['Cast iron', 'Engine blocks, pipes and machine bases — different carbon content, sold separately']
        ]
      },
      {
        h: 'Physical and chemical properties',
        table: [
          ['Density', '7.85 g/cm³'],
          ['Melting point', '1,538 °C for pure iron; most steels melt at 1,450–1,520 °C'],
          ['Magnetism', 'Ferromagnetic — the basis of every separation step in a yard'],
          ['Alloying', 'Carbon above ~2 % makes cast iron; below it, steel. Chromium, nickel and copper change the grade and the price'],
          ['Corrosion', 'Rusts readily unless coated or alloyed, which is why yard stock is turned quickly']
        ]
      },
      {
        h: 'What steel is used for',
        list: [
          'Reinforcement bar and mesh for concrete',
          'Structural sections, plate and beams',
          'Sheet, coil and tinplate for packaging and vehicles',
          'Wire rod, fasteners and fencing',
          'Rail, pipe and machinery castings'
        ]
      },
      {
        h: 'How iron and steel become scrap',
        ps: [
          'Fabrication and machining generate offcuts, punchings and turnings continuously. Construction and demolition return rebar, beams, sheet and pipe. End-of-life vehicles, plant and white goods supply shredded material with a copper and plastic fraction to be separated out.',
          'The three things that reduce the price of a load are attachments, mixed grades and contamination. A beam with concrete still on it, a machine with an electric motor inside, or a mixed pile of cast iron and mild steel all cost the buyer time, and the deduction is real.'
        ]
      },
      {
        h: 'How it is recycled',
        steps: [
          ['Weigh and inspect', 'Radiation screening and visual grading on arrival; a load is priced against a named grade, not a guess.'],
          ['Sort', 'Magnets lift ferrous from everything else; hand sorting separates cast iron, stainless and alloys that would contaminate the heat.'],
          ['Shear or shred', 'Oversize material is sheared to furnace size; light scrap is shredded and the fluff, plastics and non-ferrous are separated downstream.'],
          ['Melt', 'Electric arc furnace with a controlled charge, plus lime and alloy additions to hit the specification.'],
          ['Cast', 'Continuous casting into billets, blooms or slabs, then rolling into bar, section or coil.']
        ]
      },
      {
        h: 'What recycled steel becomes',
        list: [
          'Reinforcement bar, mesh and wire rod',
          'Structural sections and plate',
          'Sheet and coil for automotive and packaging',
          'Rail, forging stock and grinding media',
          'New castings from foundry-grade scrap'
        ]
      }
    ],
    faq: [
      ['What is the difference between HMS 1 and HMS 2?', 'Thickness. HMS 1 is 6 mm and above; HMS 2 is thinner, down to 4 mm. Most export cargoes are a blend, quoted as HMS 1&2 80/20.'],
      ['Why does a motor or a sealed unit get deducted?', 'It is a closed assembly with copper, aluminium and oil inside. The buyer has to dismantle it, and the copper value is not the seller\'s to claim once it is inside the steel price.'],
      ['Does rusty steel lose value?', 'Only at the margin. Surface rust is normal and melts with the charge; heavy lamination and scale mean less iron per tonne, which is reflected in the price.']
    ]
  }
};
