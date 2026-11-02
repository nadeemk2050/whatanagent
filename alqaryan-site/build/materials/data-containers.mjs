// Material pages — group 2: bottle, container and utility scrap.
import { CTA } from './constants.mjs';

export const CONTAINER_SCRAP = [
  {
    id: 1046,
    slug: 'pet-bottle-scrap',
    title: 'PET Bottle Scrap',
    focus: 'PET bottle scrap',
    focusShort: 'PET bottle scrap',
    schemaMaterial: 'Polyethylene terephthalate (PET)',
    kicker: 'Materials we deal · PET scrap',
    h1: 'PET bottle scrap',
    lede: `PET bottle scrap is the most collected and most recycled plastic in the world, and in Pakistan it is a genuine industry: thousands of collectors, balers and washing plants handle water, soft drink and oil bottles before the material reaches a flake producer. PET is also the least forgiving of the common plastics — one bottle of the wrong polymer in a tonne can ruin a whole batch. Al Qaryan Industries buys PET bottle scrap, sorts and washes it, and trades washed flake to fibre, sheet and strapping producers.`,
    chips: ['IV 0.76 to 0.84 for bottle grade', 'Clear, light blue, green', 'Baled or washed flake', 'Colour sorted'],
    sections: [
      {
        h2: 'What PET bottle scrap is',
        paras: [
          `Polyethylene terephthalate is a polyester, not a polyolefin like polyethylene or polypropylene, and that difference explains everything about how it is recycled. PET is processed by drying and melting at temperatures where any moisture present causes hydrolysis — the molecular chain is cut by water — so the material has to be dried to a very low moisture level before it can be re-melted. The length of that chain is measured as intrinsic viscosity, or IV, and bottle-grade virgin resin typically sits between 0.76 and 0.84 dl/g.`,
          `Every recycling step costs a little IV. Washing, drying, heating and re-extruding all reduce it, so the value of PET bottle scrap is really a question of how much IV has been preserved and how clean the flake is. That is why a bale of clear, cap-free, label-free bottles is worth several times what a mixed bale of crushed coloured bottles is worth.`
        ]
      },
      {
        h2: 'The PET bottle scrap grades we buy',
        paras: [
          `We grade PET bottle scrap on colour, on what is still attached to the bottle, and on the baled density. Each grade goes to a different end use, so the separation happens before anything is washed.`
        ],
        table: [
          ['Clear water bottle bales', 'The premium grade. Highest IV retention and the widest range of end uses.'],
          ['Light blue tinted bales', 'Very common in mineral water. Accepted widely for fibre and sheet.'],
          ['Green and mixed colour bales', 'Used for strapping, fibre and dark sheet where colour is acceptable.'],
          ['Soft drink bottle bales', 'Heavier wall and good IV, but often carry full-wrap labels and heavier glue.'],
          ['Edible oil bottle bales', 'Require intensive washing to remove oil residue before flaking.'],
          ['Hot-washed flake', 'Already washed, de-labelled and dried; sold on to fibre and sheet producers.'],
          ['Off-grade flake', 'Higher contamination or lower IV, used for lower-specification applications.']
        ]
      },
      {
        h2: 'Where our PET bottle scrap comes from',
        paras: [
          `Pakistan has one of the most organised bottle collection systems in the region. Scavengers and small dealers collect bottles from streets, restaurants, offices and households; intermediate dealers bale them; and washing plants turn the bales into flake. We buy at both ends of that chain — raw bales from aggregators, and flake from washing plants whose quality we have verified over time.`,
          `We also import PET bottle bales when the domestic price spikes, typically from the UAE, Saudi Arabia and Malaysia. Imported bales tend to be more consistent in colour because they come from single-stream kerbside collection, but they carry their own contamination profile: heavier label adhesive and more PET thermoform trays mixed in with the bottles.`
        ]
      },
      {
        h2: 'Specification we work to',
        paras: [
          `PET is specified differently from polyolefins. IV replaces melt flow index, and moisture content is a critical rather than a secondary property. The table below shows what we measure and report.`
        ],
        table: [
          ['Polymer', 'Polyethylene terephthalate (PET), bottle grade'],
          ['Intrinsic viscosity', '0.76 to 0.84 dl/g for virgin bottle resin; measured on flake and reported per lot'],
          ['Typical density', 'Around 1.33 to 1.40 g/cm3'],
          ['Moisture', 'Critical. Dried and measured; supplied with a moisture figure on request'],
          ['Colour', 'Clear, light blue, green, mixed'],
          ['Form supplied', 'Baled bottles or washed flake'],
          ['Contamination', 'Caps, rings, labels, adhesive and non-PET polymers removed by sorting, float-sink and air classification'],
          ['Packing', 'Bales of roughly 200 to 300 kg; flake in jumbo bags'],
          ['Documents', 'Batch report including IV and moisture on request']
        ]
      },
      {
        h2: 'The contaminants that ruin PET',
        paras: [
          `PVC is the worst. A single PVC bottle in a tonne of PET breaks down at PET processing temperatures and releases hydrogen chloride, which attacks the polymer and the machine. It shows up as black specks and a permanent haze, and there is no filter fine enough to remove the effect. We sort PVC out by hand and by near-infrared where volumes justify it.`,
          `PETG is the second trap. It looks identical to PET but melts at a different temperature, and it appears in thermoformed packaging and some clear bottles. Because it does not crystallise the same way, it softens pellets and produces sticky, unusable flake.`,
          `Caps, rings and labels are the routine removals. Caps and tamper-evident rings are HDPE or PP and are removed by float-sink separation, because polyolefins float while PET sinks. Labels are paper or film, removed by air classification and washing, and the adhesive that held them has to be broken down with hot caustic wash or it survives into the flake as tacky spots.`,
          `Oil and chemical residue is the last one. Edible oil bottles need intensive washing, and any bottle that carried a solvent or pesticide is rejected outright, because a residue that survives washing will contaminate the melt.`
        ]
      },
      {
        h2: 'How we collect and buy PET bottle scrap',
        paras: [
          `We buy baled bottles from dealers and aggregators and washed flake from washing plants. Every load is sampled and checked for colour mix, cap and label content, moisture from open-air storage, and any sign of PVC or PETG. Price follows the sample, not the description.`,
          `For aggregators we can set up a standing arrangement: an agreed grade, an agreed frequency and a price band reviewed monthly. That gives the collector a predictable outlet and gives us a predictable feed into our own processing.`
        ]
      },
      {
        h2: 'How we recycle PET bottle scrap',
        paras: [
          `Baled bottles are opened, de-baled, and sorted by colour and polymer. Caps and rings come off mechanically; labels are removed by air classification and hot wash. The bottles are then crushed, hot-washed with caustic and detergent, rinsed, and dried. Float-sink tanks separate polyolefins from PET by density, and the flake is dried to a moisture level suitable for extrusion.`,
          `From there the flake goes either to a customer who will re-pelletise it or through our own pelletising and filtration route, where a fine screen removes residual fines. Because IV falls with every heat history, we report the IV of each lot so a fibre producer can decide whether the flake suits their draw ratio.`
        ]
      },
      {
        h2: 'What is made from recycled PET bottle scrap',
        paras: [
          `Recycled PET is one of the few plastics with genuinely established large-scale end markets, which is why the price of bottle scrap tracks global demand.`
        ],
        list: [
          'Polyester staple fibre for garments, blankets and upholstery',
          'Filament yarn and non-woven fabric',
          'PET sheet for thermoformed trays and packaging',
          'Strapping for cartons and industrial bundling',
          'Bottle-to-bottle rPET, where the processor has the food-contact certification to run it',
          'Automotive and construction non-wovens',
          '3D printing filament from clean, single-colour flake'
        ],
        note: 'Food-contact recycled PET requires a certified decontamination process. We supply the flake; the certification sits with the processor who runs the super-clean line, and we do not claim it on their behalf.'
      }
    ],
    buying: [
      `Al Qaryan Industries buys PET bottle scrap in bales and washed PET flake, and trades both within Pakistan and for export. We have been in the plastic trade since 2007 and move around 500 tons a month across all polymers, which gives collectors and washing plants a reliable outlet.`,
      `Selling to us: tell us the colour mix, whether it is baled bottle or flake, the tonnage per month and the moisture situation. Send a photograph of the bale and a sample if you can. WhatsApp +92 333 201 0506 reaches us directly and we will respond with a grade and a rate.`,
      `Buying from us: specify the colour, the IV range you need, whether you can take flake or require pellets, and your monthly tonnage. We will confirm what is available from current stock and arrange a trial load before a long-term commitment.`
    ],
    faqs: [
      ['What IV can you supply?', 'It depends on the feedstock and how much heat history it has seen. We measure IV on the flake and report the figure for the lot rather than quoting an optimistic catalogue value.'],
      ['Do you accept bottles with caps and labels still on?', 'Yes, they are bought as baled bottle and the caps and labels are removed in our process. Heavily labelled or capped loads are priced lower because the yield of usable flake is lower.'],
      ['Why is PVC so damaging in PET?', 'PVC releases hydrogen chloride at PET processing temperatures, which attacks both the polymer and the machine. The result is black specks and permanent haze that no filter can remove, so a small amount of PVC can devalue an entire batch.'],
      ['Can you supply food-grade recycled PET?', 'We supply washed flake and pellets. Food-contact certification depends on the processor running a certified decontamination line, so we will connect you with the appropriate route rather than overstate what our material carries.']
    ],
    related: [
      ['PC bottle scrap', 'Polycarbonate water bottles recovered for non-food applications.', 'pc-bottle-scrap'],
      ['HDPE jerry can scrap', 'Blow-moulded HDPE containers from oil, chemical and food use.', 'hdpe-jerry-can-scrap'],
      ['Prime materials', 'Virgin and prime-grade polymers in bulk for demanding applications.', 'prime-materials']
    ],
    market: [
      `PET bottle scrap is the most transparently priced plastic in the market, because it is traded internationally at scale and tracked daily. Its price moves with polyester fibre demand in China and India, with the price of virgin PTA and MEG, with the rupee-dollar rate, and with the shipping cost of moving bales. When fibre mills are running hard, bottle bales get expensive within a week. When they are not, the same bales sit unsold.`,
      `Within that headline price, the spread between grades is enormous. Clear, cap-free, label-free material sits at the top; mixed colour with caps and labels attached sits far below, because the yield of usable flake per tonne of bale is much lower. Colour is the first thing a buyer asks about and the first thing that changes the number, which is why sorting at the collection point pays for itself.`
    ],
    enquiry: [
      'Colour mix: clear, light blue, green, or mixed',
      'Whether it is baled bottle or already washed flake',
      'Cap, ring and label status — still fitted, or removed before baling',
      'Moisture situation, since bales stored outdoors hold water and lose value',
      'Approximate monthly tonnage and whether you can hold a consistent grade',
      'Any PVC, PETG or oil-bottle contamination present — declaring it changes the price honestly rather than after the fact'
    ],
    cta: CTA
  },

  {
    id: 1047,
    slug: 'pc-bottle-scrap',
    title: 'PC Bottle Scrap',
    focus: 'PC bottle scrap',
    focusShort: 'PC bottle scrap',
    schemaMaterial: 'Polycarbonate (PC)',
    kicker: 'Materials we deal · Polycarbonate scrap',
    h1: 'PC bottle scrap',
    lede: `PC bottle scrap means polycarbonate water bottles — the large transparent refillable bottles used in offices, homes, water dispensers and coolers. Polycarbonate is an engineering plastic: transparent, extremely tough, dimensionally stable and heat resistant, which is why a five gallon bottle survives years of handling. When those bottles are retired, the material still has excellent mechanical properties, but it cannot go back into food contact, so PC bottle scrap is recycled into demanding industrial applications instead. Al Qaryan Industries buys and recycles PC bottle scrap and other polycarbonate waste.`,
    chips: ['Engineering plastic', 'Density around 1.20', 'Clear and tinted', 'Non-food applications'],
    sections: [
      {
        h2: 'What PC bottle scrap is',
        paras: [
          `Polycarbonate is an amorphous engineering thermoplastic with a density around 1.20 g/cm3, high impact strength, good clarity and a glass transition temperature high enough that boiling water does not distort it. Those properties made it the default material for refillable water bottles, and they are also why the scrap is worth collecting: the polymer does not lose its mechanical character the way a commodity film grade does after a few heat cycles.`,
          `PC bottle scrap arrives as 5 gallon dispenser bottles, 3 gallon and 2 gallon variants, and smaller refillable containers. Most are clear with a blue or green tint; some carry printed branding, a protective cap, a silicone or rubber seal, and a handle. Sorting centres that understand the material can produce a very clean regrind, which is what makes it a tradeable grade rather than general mixed plastic.`
        ]
      },
      {
        h2: 'Grades of PC bottle scrap we handle',
        paras: [
          `The main variables are colour, clarity and contamination from caps, seals and labels. Clear material keeps the widest options; heavily printed or tinted material is confined to dark or hidden products.`
        ],
        table: [
          ['Clear or light blue 5 gallon bottles', 'The best grade. Good clarity retention after regrinding.'],
          ['Tinted or coloured bottles', 'Green, blue and amber; confined to products where colour does not matter.'],
          ['Printed or branded bottles', 'Print has to be removed or the regrind is confined to dark applications.'],
          ['Bottles with caps and seals fitted', 'Caps and silicone seals removed before grinding; a lower grade as received.'],
          ['Crushed or baled PC bottles', 'Volume-reduced for transport; density checked because bottles trap a lot of air.'],
          ['PC sheet and profile offcuts', 'Same polymer family from signage and glazing; handled alongside bottles.']
        ]
      },
      {
        h2: 'Where our PC bottle scrap comes from',
        paras: [
          `Water dispenser companies are the primary source. They rotate bottles on a fixed cycle as they become scuffed or fail inspection, which produces a predictable, well-identified stream. Offices, schools and factories replacing their water equipment add smaller volumes, and municipal collection supplies the rest as crushed bottles from commercial waste.`,
          `We also buy polycarbonate from other sources with the same handling logic: sheet offcuts from signage and machine guards, and moulding waste from electronics and appliance manufacturing. Because PC is an engineering plastic, the quantities are smaller than for commodity polymers, but the value per kilo is higher.`
        ]
      },
      {
        h2: 'Specification we work to',
        paras: [
          `Polycarbonate is specified by melt flow rate and by impact performance rather than by the simple density-and-colour description used for polyolefins. Heat history matters: PC hydrolyses if it is processed wet, so drying is a genuine requirement, not a formality.`
        ],
        table: [
          ['Polymer', 'Polycarbonate (PC)'],
          ['Typical density', 'Around 1.20 g/cm3'],
          ['Melt flow rate', 'Varies with grade and heat history; measured per lot and reported'],
          ['Form supplied', 'Regrind, crushed, or pelletised'],
          ['Colour', 'Clear, light blue, tinted, mixed'],
          ['Moisture', 'Must be dried before processing; measured and reported'],
          ['Contamination', 'Caps, seals, labels and non-PC polymers removed; metal detected and rejected'],
          ['Packing', '25 kg bags, jumbo bags or bulk'],
          ['Documents', 'Batch report; third-party inspection on request']
        ]
      },
      {
        h2: 'Contamination and why PC scrap needs discipline',
        paras: [
          `Polycarbonate is hygroscopic and hydrolytically sensitive. Moisture absorbed from the air breaks the molecular chain during melting, and the result is a brittle part that fails in service — often weeks after it was moulded. That is the single most common reason recycled polycarbonate disappoints a moulder, and it is a drying problem rather than a material problem. We dry and report moisture so the buyer starts from a known state.`,
          `Mixed polymers are the second risk. PC is often confused with PMMA and with clear polystyrene in a sorting yard, and PC-ABS blends behave differently from pure PC. Seals, caps and handles are a different family entirely and must be removed. Metal inserts and valve components are extracted by magnet and by hand.`,
          `There is also a regulatory dimension worth stating plainly. Polycarbonate can contain residual bisphenol A, and products made from recycled PC are not sold into food contact or infant feeding applications. We keep PC out of any stream destined for food-contact products and describe the material for what it is.`
        ]
      },
      {
        h2: 'How we buy PC bottle scrap',
        paras: [
          `We buy by weight after inspection and sample. Bottles are checked for colour, print coverage, and whether caps and seals are still fitted, because each adds handling cost. Crushed material is checked for bulk density so we know how much polymer is actually in the truck.`,
          `For water companies rotating stock, we can set up a scheduled collection against an agreed grade, which turns a disposal cost into a credit. For traders, a photograph of the material and an approximate tonnage is enough for an indicative rate.`
        ]
      },
      {
        h2: 'How we recycle PC bottle scrap',
        paras: [
          `Bottles are de-capped, de-sealed and inspected, then crushed and granulated. Label and print removal is done mechanically where possible and by sorting where not. The regrind is washed, dried to a low moisture level and either sold as regrind or pelletised with filtration. Because PC holds its properties well, the regrind is a genuine engineering material rather than a filler substitute.`,
          `We keep PC separate from the commodity streams at every stage. Mixing engineering plastics into a polyethylene or polypropylene consignment is one of the fastest ways to lose a customer, and the discipline of keeping them apart is what makes our engineering-plastic grades sellable.`
        ]
      },
      {
        h2: 'What is made from recycled PC bottle scrap',
        paras: [
          `Non-food, non-medical applications where toughness and transparency or colour consistency are useful.`
        ],
        list: [
          'Industrial and electrical housings and enclosures',
          'Machine guards, safety screens and lenses where optical clarity is not critical',
          'Signage, light diffusers and display components',
          'Tool housings, handles and protective covers',
          'Automotive interior trims and non-structural components',
          'Reusable industrial crates and tote boxes',
          'Blends with ABS for moulded parts requiring impact strength'
        ],
        note: 'Recycled polycarbonate is not offered for food contact, drinking water containers or infant feeding products.'
      }
    ],
    buying: [
      `Al Qaryan Industries buys PC bottle scrap, polycarbonate sheet offcuts and moulding waste, and supplies PC regrind to industrial moulders and compounders in Pakistan. Engineering plastics are a smaller volume than our commodity trade but a more technical one, and we handle them with the moisture and separation discipline they need.`,
      `Selling to us: send photographs, the tonnage, whether caps and seals are still fitted, and the location. WhatsApp +92 333 201 0506 is fastest. If the lot is large we will inspect before quoting.`,
      `Buying from us: tell us the application, whether you can accept mixed colour, and the melt flow window your process needs. We will confirm the measured figure for the lot so you can set drying and temperature parameters before your first run.`
    ],
    faqs: [
      ['Why can recycled polycarbonate not be used for water bottles again?', 'Because food-contact reuse requires a certified decontamination process and a documented BPA position that recycled bottle regrind cannot support. Recycled PC goes into industrial applications instead, where it performs extremely well.'],
      ['Does the regrind need drying?', 'Yes, always. Polycarbonate absorbs moisture and hydrolyses when it is melted wet, which produces brittle parts. We dry and report moisture, but the buyer should still dry according to their own process.'],
      ['Can you separate clear from coloured PC?', 'Yes, when the volume justifies it. Clear and light blue material is kept separate because it retains more end-use options.'],
      ['How does PC compare with ABS for recycling?', 'PC is tougher and more transparent; ABS is easier to mould and more available. Both are engineering plastics and both are kept out of the commodity polyolefin streams.']
    ],
    related: [
      ['PET bottle scrap', 'The high-volume clear bottle stream, recycled into fibre, sheet and strapping.', 'pet-bottle-scrap'],
      ['Prime materials', 'Virgin and prime-grade engineering and commodity polymers.', 'prime-materials'],
      ['Off-grade materials', 'Alternative resin grades in bulk for cost-sensitive applications.', 'off-grade-materials']
    ],
    market: [
      `Polycarbonate scrap is a niche market with few buyers and few sellers, so price is set by negotiation rather than by any published index. The reference point is the virgin PC price, and the discount depends on colour, clarity and — above all — on how much moisture the material has absorbed in storage. Buyers who have been burned by brittle parts pay close attention to drying history, and a lot with a documented moisture figure will always beat a cheaper one without.`,
      `Supply is lumpy. Water companies rotate bottles on a fixed maintenance cycle, so a few large lots appear each year rather than a steady stream. That means the seller with storage capacity holds the stronger position, and the seller who needs the space clears at whatever the market offers that week. For a buyer, the practical lesson is to secure material when it is available rather than when it is needed.`
    ],
    enquiry: [
      'Bottle size and type — 5 gallon dispenser, 3 gallon, 2 gallon, or other',
      'Colour and clarity: clear, light blue, tinted, or printed',
      'Whether caps, silicone seals, handles and valves are still fitted',
      'Whether the material is whole, crushed or baled, and the approximate bulk density',
      'Approximate tonnage and how often you rotate stock',
      'How the material has been stored — covered or exposed, since moisture absorption affects the whole batch'
    ],
    cta: CTA
  },

  {
    id: 1048,
    slug: 'hdpe-jerry-can-scrap',
    title: 'HDPE Jerry Can Scrap',
    focus: 'HDPE jerry can scrap',
    focusShort: 'HDPE jerry can scrap',
    schemaMaterial: 'High-density polyethylene (blow moulding grade)',
    kicker: 'Materials we deal · HDPE scrap',
    h1: 'HDPE jerry can scrap',
    lede: `HDPE jerry can scrap is the waste stream from blow-moulded containers: 5, 10, 20 and 25 litre cans used for edible oil, lubricants, chemicals, detergents, pesticides and water. Blow-moulding grades are high molecular weight, tough and stress-crack resistant, so the scrap is a strong, clean feed for regrind — provided the contents are dealt with. Residue is the whole story with jerry cans, and how well it is removed decides whether the material becomes a food-adjacent product or a drain pipe. Al Qaryan Industries buys and recycles HDPE jerry can scrap at our Karachi facility.`,
    chips: ['Blow moulding grade', '5 L to 25 L containers', 'Washed and deodorised', 'Regrind or pellets'],
    sections: [
      {
        h2: 'What HDPE jerry can scrap is',
        paras: [
          `A jerry can is blow moulded from high-density polyethylene with a density around 0.945 to 0.955 g/cm3 and a relatively low melt flow, because the parison has to hold its shape while it is inflated and the finished container has to resist stress cracking when it is filled with oil or solvent. That combination produces a thick, tough wall and a polymer with excellent recycling characteristics.`,
          `The scrap appears in several forms: whole cans from industrial users, crushed cans from collection, moulding scrap and purging from the blow-moulding plant itself, and misprinted or rejected production. Plant scrap is the cleanest possible stream — it has never held a product — and it is priced accordingly. Post-consumer cans are the larger volume and the harder job.`
        ]
      },
      {
        h2: 'The HDPE jerry can scrap grades we buy',
        paras: [
          `Content history is the first question we ask, because it determines the whole processing route. Colour is the second.`
        ],
        table: [
          ['Blow-moulding plant scrap', 'Never filled, single colour, no residue. The top grade.'],
          ['Edible oil cans', 'Requires hot washing and deodorising; widely available and good quality after washing.'],
          ['Lubricant and hydraulic oil cans', 'Heavy hydrocarbon residue; needs solvent-free hot wash and extended drying.'],
          ['Detergent and household chemical cans', 'Surfactant residue; washes out well with hot caustic.'],
          ['Water and beverage cans', 'The cleanest post-consumer grade and the easiest to process.'],
          ['Pesticide and agricultural chemical cans', 'Handled only with documented triple-rinsing; excluded from any product that could contact food.'],
          ['Mixed colour cans', 'Black, white, blue, natural; kept separate where volumes allow.']
        ]
      },
      {
        h2: 'Where our HDPE jerry can scrap comes from',
        paras: [
          `Lubricant blenders, edible oil packers and detergent manufacturers are the main industrial sources. They generate consistent volumes of known-content cans, often in a single colour, and they need a compliant disposal route rather than a landfill. We collect on a schedule and provide documentation for their records.`,
          `Workshops, garages and industrial estates supply smaller quantities of oil cans, typically aggregated by local traders. Household chemical and detergent containers arrive through commercial waste collection. We also import crushed HDPE container bales from the Gulf when the price supports it, generally single-colour loads from kerbside schemes.`
        ]
      },
      {
        h2: 'Specification we work to',
        paras: [
          `Blow-moulding grade HDPE is a strong, low-flow material, and the recycled version keeps most of that character. What changes is odour and colour, not mechanical performance, provided the washing is done properly.`
        ],
        table: [
          ['Polymer', 'High-density polyethylene, blow-moulding grade'],
          ['Typical density', '0.945 to 0.955 g/cm3 for the virgin resin; measured on regrind per lot'],
          ['Melt flow index', 'Low, typical of blow-moulding grades; reported per lot'],
          ['Form supplied', 'Regrind, washed flake or pellets'],
          ['Colour', 'Natural, white, black, blue, mixed'],
          ['Residue', 'Hot washing and deodorising; residual odour assessed before dispatch'],
          ['Moisture', 'Checked and reported'],
          ['Packing', '25 kg bags, jumbo bags or bulk'],
          ['Documents', 'Batch report; third-party inspection on request']
        ]
      },
      {
        h2: 'Residue, odour and the limits of washing',
        paras: [
          `A jerry can that held motor oil does not become food-grade material by being washed. Hot caustic washing removes the bulk of the residue; extended drying and aeration remove the volatiles that cause odour. What remains is a material that is perfectly good for a drainage pipe or a cable cover and completely unsuitable for a container that will hold drinking water. Being clear about that boundary is what keeps a recycler honest.`,
          `Chemical containers are treated with more caution still. Cans that held pesticides or industrial solvents are only accepted with documented triple-rinsing, and the recycled output is confined to applications where residue cannot migrate into anything sensitive. Anything unidentified is rejected — a single unlabelled drum of the wrong chemistry can contaminate a wash line for days.`,
          `Caps, handles and labels are separated the same way as for other HDPE streams. Caps are usually PP or a different HDPE grade, handles can be PP, and labels are paper or film. Each is removed before granulation because each produces a defect in the finished part.`
        ]
      },
      {
        h2: 'How we collect and buy HDPE jerry can scrap',
        paras: [
          `For industrial generators we set up scheduled collection against an agreed grade and provide the paperwork their environmental reporting needs. For traders we buy by weight after inspection, with the content history and colour mix agreed before the load leaves.`,
          `Baled cans are inspected for bulk density and for anything that should not be in a bale — metal, glass, liquid, or a different polymer. Wet loads, meaning cans with liquid still inside, are rejected or heavily downgraded because liquid is transport weight we cannot use and a hazard in the yard.`
        ]
      },
      {
        h2: 'How we recycle HDPE jerry can scrap',
        paras: [
          `Cans are de-capped and de-labelled, crushed, then granulated. The flake goes through a hot caustic wash with detergent, a rinse stage, and mechanical drying, followed by a density separation to remove any polypropylene caps or labels that survived. Material destined for a higher-grade end use gets an additional aeration stage to reduce odour. Finally it is either bagged as flake or pelletised with filtration.`,
          `Our own two PVC extrusion lines do not consume HDPE, so the HDPE output is sold to pipe makers, moulders and rotomoulders across Pakistan. That independence is useful: we sell the material on its measured properties rather than pushing it into our own products regardless of fit.`
        ]
      },
      {
        h2: 'What is made from recycled HDPE jerry can scrap',
        paras: [
          `Washed HDPE from containers is a dependable feed for anything that needs toughness and chemical resistance.`
        ],
        list: [
          'Drainage pipe, corrugated pipe and conduit',
          'Cable protection covers and duct',
          'Injection-moulded crates, bins and pallets',
          'Rotomoulded tanks for non-potable water and industrial storage',
          'Blow-moulded containers for non-food industrial contents',
          'HDPE sheet and board for fabrication',
          'Garden furniture, planters and landscaping products'
        ]
      }
    ],
    buying: [
      `Al Qaryan Industries buys HDPE jerry can scrap from lubricant blenders, edible oil packers, detergent manufacturers, workshops and traders, and supplies washed HDPE regrind and pellets to processors across Pakistan. We handle roughly 500 tons of plastic a month and can absorb both scheduled industrial volumes and one-off clearances.`,
      `Selling to us: tell us what the cans held, the colour, whether they are baled or loose, and the tonnage per month. For industrial generators we will set up a collection schedule and provide the documentation your compliance records need. WhatsApp +92 333 201 0506 for a fast assessment.`,
      `Buying from us: specify the application and whether odour or colour matters. For drainage, duct and moulded industrial products, washed container regrind is an economical and reliable choice, and we will send a trial load so you can confirm it runs on your line.`
    ],
    faqs: [
      ['Can recycled oil cans be used for food packaging?', 'No. Hot washing removes the bulk of the residue but not enough to support a food-contact claim. Recycled oil-can material goes into drainage pipe, duct, crates and similar industrial products.'],
      ['How do you handle pesticide containers?', 'Only with documented triple-rinsing, and the output is confined to applications where residue cannot migrate. Unidentified containers are rejected outright.'],
      ['Do you buy loose cans as well as baled?', 'Yes. Baled loads are cheaper to transport, so the rate reflects the handling. Loose loads are accepted when the tonnage justifies a dedicated vehicle.'],
      ['Why does colour matter for jerry can scrap?', 'Because natural and white regrind can go into light-coloured products while black and mixed regrind is confined to dark ones. Sorting by colour at source increases the value of the load.']
    ],
    related: [
      ['HDPE 100 pipe scrap', 'PE100 pressure pipe scrap from water and gas networks.', 'hdpe-100-pipe-scrap'],
      ['HDPE cable cover scrap', 'Cable protection covers and duct recovered from utility works.', 'hdpe-cable-cover-scrap'],
      ['PP scrap', 'Polypropylene from woven sacks, crates and containers.', 'pp-scrap']
    ],
    market: [
      `HDPE jerry can scrap is priced off blow-moulding grade virgin HDPE, with two adjustments that matter more than the headline resin price: content history and washing cost. A load of edible-oil cans from a single packer is worth significantly more than a mixed load of oil, detergent and unknown chemical containers, because the first washes clean and the second needs a longer, hotter, more expensive process before the output is saleable.`,
      `Volume patterns follow industry rather than season. Lubricant blenders and edible oil packers generate steady monthly quantities, so a collection arrangement with them is the most reliable supply in this stream. Workshop and garage material arrives in small lots aggregated by traders, and its price reflects the aggregation work somebody else has already done.`
    ],
    enquiry: [
      'What the cans previously contained — edible oil, lubricant, detergent, water, or agricultural chemical',
      'Whether pesticide or solvent containers are included, and whether triple-rinsing is documented',
      'Colour mix: natural, white, black, blue or mixed',
      'Whether the cans are whole, crushed or baled, and the approximate bulk density',
      'Approximate monthly tonnage and whether collection can be scheduled',
      'Whether caps, handles, labels and any liquid remain in the containers'
    ],
    cta: CTA
  },

  {
    id: 1049,
    slug: 'hdpe-cable-cover-scrap',
    title: 'HDPE Cable Cover Scrap',
    focus: 'HDPE cable cover scrap',
    focusShort: 'HDPE cable cover scrap',
    schemaMaterial: 'High-density polyethylene (duct and cover grade)',
    kicker: 'Materials we deal · HDPE scrap',
    h1: 'HDPE cable cover scrap',
    lede: `HDPE cable cover scrap covers the protective hardware of underground cable networks: the cover tiles and protective slabs laid over buried cables, the split duct and conduit sections, spacers, drum cores and the offcuts generated by utility contractors. It is an unglamorous stream that most collectors overlook, and that is exactly why it is worth buying — the material is usually clean, single-polymer and available in quantity whenever a utility project finishes. Al Qaryan Industries buys HDPE cable cover scrap and recycles it into regrind for duct, pipe and moulded products.`,
    chips: ['Utility-grade HDPE', 'Covers, tiles, split duct', 'Clean single polymer', 'Contractor clearances'],
    sections: [
      {
        h2: 'What HDPE cable cover scrap is',
        paras: [
          `When a power or telecom cable is buried, it is protected in layers: the cable itself, sometimes a duct or conduit, and above it a cover tile or protective slab that warns anyone digging and takes the impact of a spade. Those covers are moulded or extruded from high-density polyethylene because it is tough, electrically insulating, chemically inert in soil and does not rot. Split duct and conduit perform the same duty around the cable itself.`,
          `HDPE cable cover scrap is what remains when those networks are extended, rerouted or excavated. Because covers are installed in long runs and replaced in long runs, a single project can release several tonnes at once, and because they were buried rather than exposed to sunlight, the polymer is usually in good condition.`
        ]
      },
      {
        h2: 'The grades we handle',
        paras: [
          `Utility scrap is graded on how much soil and how much non-HDPE material is attached, and on whether the parts are whole or already broken.`
        ],
        table: [
          ['Cover tiles and protective slabs', 'Flat moulded HDPE, often yellow or black. Easy to stack and transport.'],
          ['Split duct and conduit sections', 'Extruded HDPE, sometimes with a draw rope inside that must be pulled out.'],
          ['Cable spacers and saddles', 'Small moulded parts, frequently PP. Sorted separately.'],
          ['Drum cores and reels', 'HDPE or mixed polymer; checked before acceptance.'],
          ['Contractor offcuts', 'Clean new material from installation work. Usually the best grade available.'],
          ['Excavated covers with soil', 'Requires washing; priced lower as received.'],
          ['Mixed utility plastics', 'Covers, conduit, spacers and tape together. Bought as mixed and separated in-house.']
        ]
      },
      {
        h2: 'Where our HDPE cable cover scrap comes from',
        paras: [
          `Utility contractors are the main source. Every kilometre of new underground cable consumes covers and conduit, and every rerouting releases the old ones. Because these projects are scheduled, the supply is lumpy: nothing for weeks, then a full yard. We plan for that and hold the material rather than turning it away when a project lands.`,
          `Telecom operators and power distribution companies supply decommissioned material during network upgrades, and demolition contractors bring covers out of sites being redeveloped. Alongside those we buy mixed HDPE from traders, where cable covers are one component of a larger polyethylene load.`
        ]
      },
      {
        h2: 'Specification we work to',
        paras: [
          `Cable covers are moulded from a tough, usually medium-flow HDPE that is often pigmented yellow for visibility or black for UV resistance. The recycled regrind keeps that toughness, which makes it well suited to duct and drainage products.`
        ],
        table: [
          ['Polymer', 'High-density polyethylene, duct and cover grade'],
          ['Typical density', 'Around 0.940 to 0.955 g/cm3; measured per lot'],
          ['Melt flow index', 'Medium to low; reported per lot'],
          ['Colour', 'Yellow, black, orange, mixed'],
          ['Form supplied', 'Regrind, shredded or pellets'],
          ['Contamination', 'Soil washed out; draw rope, tape and metal fixings removed'],
          ['Moisture', 'Checked and reported before dispatch'],
          ['Packing', '25 kg bags, jumbo bags or bulk'],
          ['Documents', 'Batch report; third-party inspection on request']
        ]
      },
      {
        h2: 'Contamination and inspection',
        paras: [
          `Soil is the routine contaminant and the main cost. Covers come out of trenches coated in wet clay, and that clay has to be washed off before grinding or it turns into abrasive sludge in the granulator. We knock off the bulk, then wash.`,
          `Draw rope is the second. Conduit and split duct are often installed with a polypropylene or nylon pull cord inside, and if that cord reaches the granulator it wraps around the rotor and stops the machine. It is pulled out by hand at intake. Tape, warning mesh and cable markers are removed the same way.`,
          `The polymer risk is polypropylene. Cable spacers, saddles and some covers are PP rather than HDPE, and the two look similar once they are dirty. We check by density — PP floats in the same solutions HDPE floats in, so the check is by feel and by burn or melt test at intake rather than by a tank. Where the mix is significant we run a separate PP stream rather than blending.`
        ]
      },
      {
        h2: 'How we collect HDPE cable cover scrap',
        paras: [
          `For utility contractors we work on a project basis: we assess the material as it comes out, agree a rate on the assessed grade, and arrange collection so the site is cleared on the contractor's schedule rather than ours. Whole covers are stacked and strapped for transport, which keeps the load dense and the freight cost down.`,
          `Traders can deliver to the yard by weight after inspection. Because covers are flat and stackable, they load well and the transport economics are better than for bulky pipe.`
        ]
      },
      {
        h2: 'How we recycle it',
        paras: [
          `Covers and split duct are granulated directly — they are already thin-walled, so shredding is only needed for thick moulded parts. The flake is washed to remove soil, dried, and density-separated to lift out any polypropylene that arrived with the load. It is then bagged as regrind or pelletised with filtration for buyers who need a more uniform feed.`,
          `Because the input is often a single colour from a single project, we can sometimes offer a colour-consistent lot, which is worth more than a mixed one. If colour consistency matters to your product, ask what is currently in the yard rather than assuming mixed.`
        ]
      },
      {
        h2: 'What is made from recycled HDPE cable cover scrap',
        paras: [
          `The material is a natural fit for the same family of products it came from, plus the usual range of tough moulded goods.`
        ],
        list: [
          'Cable duct, conduit and split duct for new installations',
          'Cable protection covers and warning tiles',
          'Corrugated drainage pipe and land drainage',
          'Injection-moulded spacers, saddles and fixings',
          'Crates, bins and industrial containers',
          'HDPE sheet for lining and fabrication',
          'Rotomoulded products where a medium-flow HDPE is acceptable'
        ]
      }
    ],
    buying: [
      `Al Qaryan Industries buys HDPE cable cover scrap, split duct, conduit offcuts and utility HDPE from contractors, telecom and power companies, and traders across Pakistan. We have been recycling polyethylene since 2007 and process around 500 tons of plastic a month.`,
      `Contractors: send us the project location, the approximate tonnage and the type of material. We will inspect and quote on the assessed grade, then arrange collection so your site closes out on time. WhatsApp +92 333 201 0506 is the fastest way to reach our purchasing team.`,
      `Buyers: if you make duct, conduit, covers or drainage pipe, this is one of the most cost-effective HDPE feeds available, and it is usually cleaner than post-consumer container scrap. Tell us the colour and form you need and we will confirm what we can supply.`
    ],
    faqs: [
      ['Is cable cover scrap clean enough to use directly?', 'Usually yes after washing. It has been buried rather than exposed to sunlight or food residue, so the main contaminant is soil, which washes out easily.'],
      ['Are cable covers HDPE or PP?', 'Most are HDPE, but spacers and saddles are often PP. We separate by polymer at intake and do not blend the two silently.'],
      ['Can you collect from an active construction site?', 'Yes, we schedule collection around the contractor programme so we do not interrupt the works, and we handle loading.'],
      ['What is the difference between this and HDPE pipe scrap?', 'Pipe scrap is pressure pipe with a specified grade and a known classification. Cable covers and duct are utility mouldings and extrusions without a pressure rating, so they are graded on cleanliness and colour instead.']
    ],
    related: [
      ['HDPE jerry can scrap', 'Blow-moulded containers from oil, chemical and food use.', 'hdpe-jerry-can-scrap'],
      ['HDPE 80 scrap', 'PE80 pipe recovered from water and irrigation networks.', 'hdpe-80-scrap'],
      ['PVC cable scrap', 'Cable insulation and sheathing recovered for PVC compound.', 'pvc-cable-scrap']
    ],
    market: [
      `Cable cover scrap is an overlooked stream, and that is precisely why it prices well. Most collectors chase bottles and pipe, so covers and split duct sit in contractors' yards with no obvious buyer. The polymer is good, the colour is often consistent per project, and the contamination is soil rather than chemistry — which makes it cheap to clean. Buyers who know the material get a better input cost than they would for post-consumer container scrap.`,
      `The catch is lumpiness. Utility work is scheduled, so a project releases several tonnes at once and then nothing for months. A recycler without yard space has to turn it away; we hold it and process it steadily. Sellers should expect the price to reflect distance and access, because covers are stackable but heavy, and a site with no hard standing for a truck adds handling that has to be paid for.`
    ],
    enquiry: [
      'Material type: cover tiles, protective slabs, split duct, conduit offcuts, spacers or drum cores',
      'Colour and whether the load is single-project or accumulated from several sites',
      'Level of soil contamination and whether the material has been washed or knocked down',
      'Whether draw rope, warning tape or cable markers are still inside the duct',
      'Approximate tonnage, project location and access for a truck',
      'Whether polypropylene spacers and saddles are mixed in, since they are a different polymer'
    ],
    cta: CTA
  }
];
