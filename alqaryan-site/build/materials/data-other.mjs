// Material pages — group 3: cable scrap, polypropylene and trading grades.
import { CTA } from './constants.mjs';

export const OTHER_SCRAP = [
  {
    id: 1050,
    slug: 'pvc-cable-scrap',
    title: 'PVC Cable Scrap',
    focus: 'PVC cable scrap',
    focusShort: 'PVC cable scrap',
    schemaMaterial: 'Plasticised polyvinyl chloride (PVC)',
    kicker: 'Materials we deal · PVC scrap',
    h1: 'PVC cable scrap',
    lede: `PVC cable scrap is the insulation and sheathing stripped from wire and cable — flexible PVC loaded with plasticiser so that it stays supple on a cable drum and in a conduit. It is one of the highest-volume plastic waste streams in any industrial economy, and one of the most valuable, because a cable is mostly copper by value and mostly PVC by weight. Al Qaryan Industries buys PVC cable scrap, separates it from the copper and the cross-linked polyethylene that often travels with it, and turns the PVC into compound for our own extrusion lines and for customers across Pakistan.`,
    chips: ['Plasticised PVC', 'Insulation and sheathing', 'Copper and XLPE removed', 'Compound feedstock'],
    sections: [
      {
        h2: 'What PVC cable scrap is',
        paras: [
          `Cable PVC is not the rigid material used for pipes and profiles. It is compounded with plasticiser — typically a phthalate or a non-phthalate alternative — at levels that can reach thirty to forty percent by weight, plus stabiliser, filler and flame retardant. That is what makes a cable flexible, and it is also what makes PVC cable scrap a fundamentally different material from rigid PVC. The plasticiser lowers the softening point, raises flexibility and changes how the material regrinds and re-compounds.`,
          `The scrap arrives in three broad forms. Factory scrap is clean, single-colour, never-installed insulation from cable manufacturers. Installation offcuts are clean but mixed colour and mixed size. Post-consumer cable is stripped from decommissioned networks and carries the full contamination profile: soil, moisture, copper fines, steel armour and whatever else was in the duct.`
        ]
      },
      {
        h2: 'Grades of PVC cable scrap we handle',
        paras: [
          `Cable scrap is graded on colour, plasticiser content and how much non-PVC material is mixed in. Colour matters because black, grey and coloured compounds have different markets, and mixing them confines the output to dark products.`
        ],
        table: [
          ['Cable factory scrap', 'Clean, uninstalled, single colour. The best grade available.'],
          ['Black sheathing PVC', 'The most common post-consumer grade; good for dark compounds.'],
          ['Grey and white insulation PVC', 'Higher value where colour can be preserved.'],
          ['Coloured insulation mix', 'Red, blue, green, yellow; blended into dark or black compound.'],
          ['Copper-loaded granulate', 'Cable granulate not yet fully separated; bought on copper content.'],
          ['Sheathed armoured cable waste', 'Steel wire armour present; requires magnetic separation.'],
          ['Mixed cable with XLPE', 'Cross-linked polyethylene insulation mixed in; must be separated as it cannot be remelted.']
        ]
      },
      {
        h2: 'Where our PVC cable scrap comes from',
        paras: [
          `Cable manufacturers are the cleanest source: their scrap is generated before the cable ever leaves the factory and is well identified. Electricity distribution companies and telecom operators supply decommissioned cable in quantity during network upgrades — a single substation refurbishment can release several tonnes. Demolition contractors bring cable out of buildings being stripped, and the copper recovery industry supplies PVC granulate as a by-product of separating the metal.`,
          `We also buy imported cable granulate from the Gulf and Southeast Asia, where cable stripping is a large and well-established industry. Imported granulate is usually already separated from copper and sorted by colour, which makes it a predictable feed for compounding.`
        ]
      },
      {
        h2: 'Specification we work to',
        paras: [
          `Flexible PVC is specified by plasticiser content, density and hardness rather than by melt flow. Plasticiser content drives everything: it decides flexibility, it limits how the material can be re-compounded, and it is the number a compounder wants first.`
        ],
        table: [
          ['Polymer', 'Plasticised polyvinyl chloride (PVC)'],
          ['Typical density', 'Around 1.30 to 1.50 g/cm3 depending on plasticiser and filler content'],
          ['Plasticiser content', 'Commonly 25 to 40 percent by weight; assessed per lot and reported'],
          ['Hardness', 'Measured as Shore A on request for compound buyers'],
          ['Form supplied', 'Granulate, regrind or compounded pellet'],
          ['Colour', 'Black, grey, white, coloured, mixed'],
          ['Contamination', 'Copper, steel armour, XLPE, rubber and soil removed; metal detection at outlet'],
          ['Packing', '25 kg bags, jumbo bags or bulk'],
          ['Documents', 'Batch report; third-party inspection on request']
        ],
        note: 'Rigid and flexible PVC are never blended. A small amount of plasticised material in a rigid compound destroys its dimensional stability, and a small amount of rigid material in a flexible compound makes it stiff and difficult to process.'
      },
      {
        h2: 'The four contaminants in cable scrap',
        paras: [
          `Copper is the first, and it is both a contaminant and the reason the cable exists. Fine copper dust and swarf from stripping stay with the PVC and show up as specks and conductivity problems. We granulate, then separate by air classification and density, and finish with a metal detector on the outlet.`,
          `Cross-linked polyethylene is the second and the most damaging. Modern medium and high voltage cables are insulated with XLPE rather than PVC, and XLPE cannot be melted because its molecular network is permanently cross-linked. A little XLPE in a PVC compound appears as hard gels that clog filters and mark the finished surface. It has to be sorted out before granulation, and there is no downstream fix.`,
          `Steel armour is the third. Wire armour and tape armour are removed magnetically after granulation; larger sections are cut away before. Rubber and elastomer insulation from older cable is the fourth, and it is removed by hand because it does not separate by density or by magnet.`,
          `There is also a dirt problem specific to cable that has been in the ground: soil packed into the interstices of a multi-core cable, and moisture that has been inside the sheath for years. Washing and drying handle both, but the load has to be priced for it.`
        ]
      },
      {
        h2: 'How we collect and buy PVC cable scrap',
        paras: [
          `For utilities and manufacturers we buy on weight after inspection, with the grade and rate agreed in writing before the material moves. For large decommissioned cable lots we will inspect on site, because the mix of PVC and XLPE insulation decides the value more than the total tonnage does.`,
          `Copper recovery operations are a natural partner: they strip the metal and we take the plastic. If you run a stripping or granulating line, we will buy your PVC granulate on a repeat basis and provide a consistent outlet so you are not holding stock waiting for a buyer.`
        ]
      },
      {
        h2: 'How we recycle PVC cable scrap',
        paras: [
          `Cable scrap is granulated, then separated: air classification lifts the light fluff and paper, density separation and shaking tables concentrate the copper, and a magnet removes steel. The PVC granulate is washed, dried to a low moisture level and either sold as granulate or compounded in our own operation with stabiliser and lubricant to a specification.`,
          `Our two PVC extrusion lines in Karachi give us a guaranteed internal outlet for a proportion of the compound, which means we can keep buying cable scrap even when the external compound market is quiet. That internal demand is a real advantage to a supplier who needs a disposal route they can rely on.`
        ]
      },
      {
        h2: 'What is made from recycled PVC cable scrap',
        paras: [
          `Recycled flexible PVC goes into products where flexibility and durability matter and electrical certification is not required.`
        ],
        list: [
          'Cable sheathing and insulation for low-voltage non-critical cable',
          'Flexible conduit and corrugated cable protection',
          'Hose and tube for industrial and garden use',
          'Flooring underlay, matting and gym tiles',
          'Shoe soles and general moulded rubber-substitute parts',
          'Garden hose, irrigation fittings and flexible connectors',
          'Moulded industrial parts where a soft PVC compound is specified'
        ]
      }
    ],
    buying: [
      `Al Qaryan Industries buys PVC cable scrap, cable granulate and mixed cable waste, and supplies recycled flexible PVC granulate and compound from our Karachi facility. Cable PVC is one of the streams we process most consistently because our own extrusion operation consumes it.`,
      `Selling to us: tell us the type of cable, whether the copper is already separated, the colour mix and the tonnage. For decommissioned network cable we will inspect on site. WhatsApp +92 333 201 0506 reaches our purchasing team directly.`,
      `Buying from us: specify the application, the hardness or flexibility you need, and whether colour matters. We will confirm plasticiser content and send a trial quantity before you commit to a regular supply.`
    ],
    faqs: [
      ['Can you separate PVC from XLPE insulation?', 'Yes, by sorting before granulation, because XLPE cannot be melted and cannot be filtered out of a PVC compound afterwards. Mixed cable is priced lower for exactly this reason.'],
      ['Is recycled cable PVC as flexible as new compound?', 'Close to it, and the difference is managed by re-compounding. The plasticiser already in the scrap does much of the work, and we adjust the formulation to reach the hardness a customer needs.'],
      ['Do you buy cable with the copper still inside?', 'We buy cable scrap and granulate. Where copper is present we assess it on both metal and plastic content, since both have value and both have to be separated.'],
      ['What about lead in older cable?', 'Older PVC compounds may contain lead-based stabilisers. Where documentation allows we keep those lots separate, and we will tell you which stabiliser system a lot carries if your application is sensitive to it.']
    ],
    related: [
      ['PVC pipe scrap', 'Rigid uPVC drainage, sewer and conduit pipe for regrind and compound.', 'pvc-pipe-scrap'],
      ['UPVC profile scrap', 'Window and door profile scrap with glass and steel removed.', 'upvc-profile-scrap'],
      ['HDPE cable cover scrap', 'Cable protection covers and split duct recovered from utility work.', 'hdpe-cable-cover-scrap']
    ],
    cta: CTA
  },

  {
    id: 1051,
    slug: 'pp-scrap',
    title: 'PP Scrap',
    focus: 'PP scrap',
    focusShort: 'PP scrap',
    schemaMaterial: 'Polypropylene (PP)',
    kicker: 'Materials we deal · Polypropylene scrap',
    h1: 'PP scrap',
    lede: `PP scrap is polypropylene waste in all its forms: woven cement and fertiliser sacks, FIBC jumbo bags, crates, caps and closures, containers, battery cases, furniture and automotive parts. Polypropylene is the second most common plastic in the world after polyethylene and the lightest of the commodity polymers, which makes transport per kilo expensive and recycling economics tight — so the material that gets recycled is the material that is already concentrated. Al Qaryan Industries buys PP scrap across Pakistan and recycles it into regrind and granules for injection moulders, raffia producers and compounders.`,
    chips: ['Density around 0.90', 'Sacks, crates, caps', 'Lightest commodity polymer', 'Regrind and granules'],
    sections: [
      {
        h2: 'What PP scrap is',
        paras: [
          `Polypropylene is a semi-crystalline commodity polymer with a density around 0.90 to 0.91 g/cm3, the lowest of the high-volume plastics. That lightness is an advantage in the finished product and a problem in recycling, because a truckload of PP scrap weighs roughly a tenth less than the same volume of PVC, and freight is charged by the truck. It is also why PP scrap is normally baled or granulated close to where it is collected rather than shipped loose.`,
          `PP is versatile in a way polyethylene is not: it can be made stiff enough for a crate, soft enough for a woven sack tape, tough enough for a battery case, and heat resistant enough for a food container. Each of those products uses a different grade, and mixing them produces a regrind that satisfies none of the applications. Grading PP scrap properly is the whole skill.`
        ]
      },
      {
        h2: 'The PP scrap grades we buy',
        paras: [
          `We group PP scrap by the product it came from, because the product tells us the melt flow, the filler content and the likely contamination.`
        ],
        table: [
          ['Woven sack scrap', 'Cement, fertiliser, rice and flour sacks. Raffia grade, usually high melt flow.'],
          ['FIBC and jumbo bag scrap', 'Heavy woven bags with lifting loops; strong, clean and high value.'],
          ['Injection crates and boxes', 'Copolymer grade with good impact strength; excellent regrind.'],
          ['Caps and closures', 'Clean, single-grade, high melt flow. One of the best PP streams available.'],
          ['Battery cases and automotive parts', 'Talc-filled or glass-filled; filler content must be identified.'],
          ['Container and houseware scrap', 'Food containers, buckets and bowls; often printed and mixed colour.'],
          ['Mixed PP with PE', 'Common in post-consumer collection; separated by density where possible.']
        ]
      },
      {
        h2: 'Where our PP scrap comes from',
        paras: [
          `Cement plants and fertiliser packers are the largest single source. A cement plant consumes woven PP sacks by the million and generates torn and rejected bags continuously, so the stream is steady, well identified and already concentrated at one site. Rice and flour mills add similar material on a seasonal cycle.`,
          `Injection moulders supply plant scrap, runners and rejects, which is the cleanest PP scrap available because it has never left the factory. Retail and industrial collection supplies crates, containers and caps, and the automotive sector supplies battery cases and interior parts. We import baled PP from the Gulf and Southeast Asia to fill the seasonal gaps when local collection slows.`
        ]
      },
      {
        h2: 'Specification we work to',
        paras: [
          `PP is specified by melt flow rate, by whether it is homopolymer or copolymer, and by filler content. Those three numbers decide what a moulder can make from it, and they vary more between PP products than density varies between polyethylenes.`
        ],
        table: [
          ['Polymer', 'Polypropylene, homopolymer or copolymer'],
          ['Typical density', '0.90 to 0.91 g/cm3 unfilled; higher where talc or glass filler is present'],
          ['Melt flow rate', 'Wide range by source; measured per lot and reported'],
          ['Filler content', 'Identified per lot where the source is known'],
          ['Colour', 'Natural, white, black, coloured, mixed'],
          ['Form supplied', 'Regrind, granules or baled'],
          ['Contamination', 'PE, labels, print, soil and metal removed'],
          ['Packing', '25 kg bags, jumbo bags or bales'],
          ['Documents', 'Batch report; third-party inspection on request']
        ]
      },
      {
        h2: 'Contamination, print and the PE problem',
        paras: [
          `Polyethylene is the constant companion of PP scrap. Bottle caps with HDPE liners, sack lamination, and mixed post-consumer collection all introduce PE into a PP stream. The two polymers are close enough in density that a simple float-sink tank cannot always separate them, and the result is a regrind with inconsistent stiffness. Where the mix is significant we send the load to a separate PE/PP blend stream and declare it.`,
          `Print and lamination are the second issue. Woven sacks carry heavy printed ink, and some are laminated with a thin film layer. Ink disperses into the melt and darkens the regrind, which confines it to dark products. Washing removes some of it; nothing removes all of it.`,
          `Filler is the third and the least visible. Talc-filled automotive grades and glass-filled engineering grades contain mineral load that raises density and changes melt behaviour. A moulder expecting unfilled PP will find the part heavier and stiffer than predicted, so we measure and report filler content where the source is known.`
        ]
      },
      {
        h2: 'How we buy PP scrap',
        paras: [
          `We buy by weight after inspection, with bales assessed on bulk density as well as on weight because a loose bale of sacks contains a lot of air. For industrial generators we set up scheduled collection so the material never accumulates. For traders, photographs of the bales plus an approximate tonnage and location are enough to start.`,
          `Clean, single-source PP commands the best rate. A cement plant's rejected sacks are worth more than an equivalent weight of mixed household PP, and the difference is not arbitrary — one goes straight into production and the other goes through a sorting line.`
        ]
      },
      {
        h2: 'How we recycle PP scrap',
        paras: [
          `Baled sacks are de-baled, inspected for PE lamination and foreign material, then granulated. The granulate is washed, dried and density-separated, and where the material is destined for a light-coloured product it goes through an additional washing stage to lift the ink. Drying matters more for PP than for HDPE because raffia grades are thin and hold surface moisture.`,
          `The output is bagged as regrind or pelletised with filtration for buyers who need a uniform feed. We keep raffia grade, injection grade and filled grades separate wherever the volumes allow, because a moulder who buys the wrong one will get a part that fails either on impact or on stiffness.`
        ]
      },
      {
        h2: 'What is made from recycled PP scrap',
        paras: [
          `Recycled PP is a strong, chemically resistant, heat-tolerant material and it goes into a wide range of industrial and consumer products.`
        ],
        list: [
          'Woven sacks, FIBC and raffia tape for packaging',
          'Injection-moulded crates, boxes, trays and pallets',
          'Automotive battery cases and under-bonnet components',
          'Caps, closures and industrial fittings',
          'Garden furniture, planters and landscaping products',
          'Housewares, buckets and storage containers',
          'Fibre and non-woven for industrial textiles',
          'Compound feedstock for filled and reinforced PP grades'
        ]
      }
    ],
    buying: [
      `Al Qaryan Industries buys PP scrap from cement plants, fertiliser and rice packers, injection moulders, retailers and traders throughout Pakistan, and supplies recycled PP regrind and granules to moulders, raffia producers and compounders. Around 500 tons of plastic moves through our Karachi facility each month.`,
      `Selling to us: tell us the product the scrap came from, since that tells us the grade. Send photographs, the tonnage and the location on WhatsApp at +92 333 201 0506. For industrial generators we will set up a collection schedule.`,
      `Buying from us: specify homopolymer or copolymer, the melt flow your machine needs, whether filler is acceptable and your monthly tonnage. We will confirm what we can hold on a repeat basis and supply a trial load first.`
    ],
    faqs: [
      ['What is the difference between PP raffia grade and injection grade?', 'Raffia grade is a high melt flow material used to make tape for weaving; injection grade is tougher and flows differently. They are not interchangeable, so we keep them separate and will tell you which one a lot carries.'],
      ['Can you remove print from woven sacks?', 'We can reduce it with washing, but not eliminate it. Heavily printed material produces darker regrind and is best used in black or dark products.'],
      ['Do you buy mixed PP and PE?', 'Yes, as a declared blend stream. Separating the two polymers completely is not economic at small scale, so we sell blends honestly rather than pretending they are pure PP.'],
      ['Why is PP scrap priced per truckload rather than per ton?', 'Because PP is very light, a full truck often carries far less weight than the same truck of PVC. Freight is a large share of the cost, which is why baling and granulating near the source matters.']
    ],
    related: [
      ['HDPE jerry can scrap', 'Blow-moulded HDPE containers from oil, chemical and food use.', 'hdpe-jerry-can-scrap'],
      ['Prime materials', 'Virgin and prime-grade polymers with a full producer specification.', 'prime-materials'],
      ['Off-grade materials', 'Alternative resin grades in bulk for cost-sensitive applications.', 'off-grade-materials']
    ],
    cta: CTA
  },

  {
    id: 1052,
    slug: 'prime-materials',
    title: 'Prime Materials',
    focus: 'prime plastic materials',
    focusShort: 'prime materials',
    schemaMaterial: 'Virgin and prime-grade polymers',
    kicker: 'Materials we deal · Trading grades',
    h1: 'Prime materials',
    lede: `Prime materials are virgin and first-quality polymers — the pellets and powders that come straight from a petrochemical producer with a full certificate of analysis and a guaranteed specification. Al Qaryan Industries imports prime polyethylene, polypropylene and PVC from producers and traders in Japan, the USA, Canada, Malaysia, the UAE, Saudi Arabia and Indonesia, and supplies them to manufacturers in Pakistan alongside our recycled grades. When a product needs a certified pressure rating, a food-contact declaration or a repeatable melt flow, prime is the only material that will do.`,
    chips: ['Virgin polymer', 'Full COA', 'Imported and local', 'Container and truckload'],
    sections: [
      {
        h2: 'What makes a material prime',
        paras: [
          `Prime means the material meets the producer's published specification in every respect and is sold with documentation that says so: the grade designation, the melt flow index, the density, the additive package, and usually a certificate of analysis for the production lot. Prime material has not been reprocessed, has not been blended with anything else, and carries the producer's warranty for the application it was designed for.`,
          `The distinction that matters commercially is between prime, off-grade and reprocessed. Prime carries a specification you can design to. Off-grade is the same polymer outside its published window and is priced accordingly. Reprocessed is material that has already been through a melt history. All three have a place in manufacturing, but they are not interchangeable, and a supplier who blurs the line is a supplier who will eventually cost you a production run.`
        ]
      },
      {
        h2: 'The prime grades we trade',
        paras: [
          `We handle the commodity polymers that Pakistani manufacturers consume in volume, in the forms and packaging that suit their processes.`
        ],
        table: [
          ['HDPE', 'Film, blow moulding, injection and pipe grades; pellets'],
          ['LDPE', 'Film, coating and moulding grades; pellets'],
          ['LLDPE', 'Film and rotomoulding grades, including metallocene grades; pellets'],
          ['PP homopolymer', 'Injection, raffia, fibre and film grades; pellets'],
          ['PP copolymer', 'Impact copolymer for crates, automotive and appliances; pellets'],
          ['PVC resin', 'Suspension and emulsion grades; powder'],
          ['PET resin', 'Bottle and fibre grades; pellets'],
          ['Engineering polymers', 'PC, ABS, PMMA and PA grades on enquiry']
        ]
      },
      {
        h2: 'Where our prime material comes from',
        paras: [
          `Our prime supply is import-led. Japan, the USA and Canada supply high-specification polyolefins and engineering grades where consistency matters. Malaysia, Indonesia, Saudi Arabia and the UAE supply commodity polyolefins at container economics that work for the Pakistani market. We buy both from producers directly, where volumes allow, and from established international traders where a specific grade is only available in smaller lots.`,
          `Local production covers a share of the commodity market and we buy locally where the price and availability are better than an import. For a manufacturer, the practical question is not where the pellet was made but whether the certificate, the lot consistency and the delivery date can be relied upon — and that is what we underwrite.`
        ]
      },
      {
        h2: 'Specifications and documentation',
        paras: [
          `Prime material is bought and sold against a specification, so the paperwork is the product. The table below shows what we provide and what a buyer should insist on seeing for a certified application.`
        ],
        table: [
          ['Grade designation', 'Producer grade code, stated on the bag and on the certificate'],
          ['Melt flow index', 'Published value with test method and condition'],
          ['Density', 'Published value with test method'],
          ['Certificate of analysis', 'Lot-specific results where available from the producer'],
          ['Additive package', 'Antioxidant, UV and slip content as published by the producer'],
          ['Food contact', 'Producer declaration where the grade carries one'],
          ['Packaging', '25 kg bags on pallets, jumbo bags, or bulk'],
          ['Origin', 'Country of manufacture and producer name'],
          ['Minimum order', 'One truckload locally; full container for imports']
        ]
      },
      {
        h2: 'Prime, off-grade and recycled: choosing correctly',
        paras: [
          `The most expensive mistake in plastic purchasing is not paying too much per kilo, it is buying the wrong grade and finding out in production. A pipe that must be certified to a pressure class needs prime resin with a documented MRS classification. A food container needs a grade with a food-contact declaration. A drainage pipe, a cable cover or a crate usually does not, and there a recycled or off-grade material will do the job at a lower cost.`,
          `Our position is straightforward: we sell all three and we will tell you which one your application actually requires. If recycled material will meet your specification, buying prime is a waste of money. If your product must be certified, recycled material will fail the test and no amount of processing will fix it.`
        ]
      },
      {
        h2: 'How we handle import and delivery',
        paras: [
          `Prime imports move in containers, cleared through Karachi, and delivered to the customer's factory by road. Lead time depends on the shipping line and on whether the grade is in stock; for regularly consumed grades we hold buffer stock so a customer is not exposed to a shipping delay.`,
          `We handle the documentation, the customs process and the inland transport, which means a manufacturer places one order and receives one delivery rather than coordinating a foreign producer, a shipping line and a clearing agent. For a factory running continuous production, that simplification is worth as much as the price.`
        ]
      },
      {
        h2: 'What prime materials are used for',
        paras: [
          `Every application where the specification has to be guaranteed.`
        ],
        list: [
          'Pressure pipe certified to a classification such as PE100',
          'Food-contact packaging, containers and closures',
          'Medical and pharmaceutical mouldings',
          'Blown film for packaging where strength and clarity are specified',
          'Automotive components with published performance requirements',
          'Electrical components requiring a certified insulation grade',
          'Rotomoulded tanks requiring a potable-water declaration',
          'Any product where a customer audit requires traceable material'
        ]
      }
    ],
    buying: [
      `Al Qaryan Industries imports and supplies prime HDPE, LDPE, LLDPE, PP, PVC resin and PET to manufacturers across Pakistan, and has been trading polymers since 2007. Prime material sits alongside our recycled grades so a customer can buy both from one supplier against one delivery schedule.`,
      `Buying prime from us: send the grade designation if you know it, or the application and the properties you need if you do not. Include your monthly tonnage and delivery city. WhatsApp +92 333 201 0506 reaches our trading desk and we will confirm stock, origin and lead time.`,
      `If you are a producer or an international trader looking for a buyer in Pakistan, we are interested in consistent container volumes of commodity polyolefins and will discuss both spot and programme business.`
    ],
    faqs: [
      ['What is the difference between prime and off-grade?', 'Prime meets the producer published specification in full and comes with documentation. Off-grade is the same polymer outside that window — different melt flow, colour or pellet quality — and is priced lower with a narrower set of applications.'],
      ['Can you supply a certificate of analysis?', 'Yes, lot-specific where the producer issues one. For locally held stock we provide the producer documentation that came with the lot.'],
      ['Do you hold stock or import to order?', 'Both. Regularly consumed commodity grades are held as buffer stock; specific or unusual grades are imported against an order, with the lead time confirmed at quotation.'],
      ['Why buy prime from a trader rather than directly from the producer?', 'Because a container is a large commitment and a trader can break it into truckloads, hold stock, handle customs and deliver when you need it. For a factory that consumes less than a container a month, that is usually the only practical route.']
    ],
    related: [
      ['Off-grade materials', 'Alternative resin grades in bulk for cost-sensitive applications.', 'off-grade-materials'],
      ['PET bottle scrap', 'Recycled PET in bales and washed flake for fibre and sheet.', 'pet-bottle-scrap'],
      ['HDPE 100 pipe scrap', 'PE100 pipe scrap recycled for non-pressure applications.', 'hdpe-100-pipe-scrap']
    ],
    cta: CTA
  },

  {
    id: 1053,
    slug: 'off-grade-materials',
    title: 'Off-Grade Materials',
    focus: 'off-grade plastic materials',
    focusShort: 'off-grade materials',
    schemaMaterial: 'Off-grade and wide-specification polymers',
    seoDesc: 'Off-grade, wide-spec and plant-purge polymer in tested lots for cost-sensitive processing, supplied across Pakistan by Al Qaryan Industries, Karachi.',
    kicker: 'Materials we deal · Trading grades',
    h1: 'Off-grade materials',
    lede: `Off-grade materials are polymers that fall outside the producer's published specification but are still perfectly usable — wide-spec resin, transition material from a reactor changeover, plant purge, colour off-cuts, over-dried or under-dried pellets, and lots that failed a pellet-quality check. Off-grade is where a cost-sensitive processor finds the biggest savings, and where an inexperienced buyer finds the biggest problems. Al Qaryan Industries buys, tests and trades off-grade polyethylene, polypropylene and PVC, and we describe every lot for what it actually is.`,
    chips: ['Wide spec and off-spec', 'Tested per lot', 'Cost-sensitive applications', 'Honest description'],
    sections: [
      {
        h2: 'What off-grade material is',
        paras: [
          `A petrochemical plant produces to a specification, and not everything it makes lands inside that window. At the start and end of a production run, during a grade changeover, after a maintenance shutdown, or when a pelletiser drifts, the plant produces polymer that is chemically the same material but does not meet every published number. Rather than sell it as prime, the producer declares it off-grade and sells it at a discount.`,
          `That is a legitimate and long-established part of the plastic trade. The material is not waste; it is real polymer with a known deviation. The problem is that the deviation is rarely documented in detail, so the buyer has to test rather than trust. That testing is the service we provide.`
        ]
      },
      {
        h2: 'The off-grade categories we handle',
        paras: [
          `Off-grade is not one thing. Each category has a different cause and a different risk, and pricing follows the risk.`
        ],
        table: [
          ['Wide-spec material', 'One or two properties outside the published window, typically melt flow. Usually the safest off-grade category.'],
          ['Reactor transition material', 'Produced between two grades; properties sit between the two. Needs testing before use.'],
          ['Plant purge and lumps', 'Off-spec polymer from start-up and shutdown; may need regranulation.'],
          ['Colour off-grade', 'Meets the mechanical specification but not the colour requirement.'],
          ['Pellet quality off-grade', 'Fines, oversize or irregular pellets; processability affected rather than properties.'],
          ['Reprocessed or repro pellets', 'Material that has already been through a melt history; a separate category with its own limits.'],
          ['Baled off-grade scrap', 'Material recovered from a plant or converter and baled for recycling.']
        ]
      },
      {
        h2: 'Where off-grade material comes from',
        paras: [
          `Producers and converters generate it. A polyolefin plant sells its own off-spec lots; a film converter sells start-up scrap, edge trim and rejected rolls; an injection moulder sells runners and rejects. Internationally, off-grade moves through specialised traders who aggregate lots from many plants, and that is the route most of our imported off-grade takes.`,
          `We buy from producers and traders in the Gulf, Southeast Asia, Japan and North America, and from converters across Pakistan. Because we also recycle, we can take a lot that is too inconsistent to sell as off-grade and process it into a controlled regrind instead — which means a seller has one route for the whole consignment rather than having to split it.`
        ]
      },
      {
        h2: 'How we grade and test off-grade lots',
        paras: [
          `Every off-grade lot is tested before it is offered. The tests are the practical ones: melt flow index, density, ash and filler content, colour, and a visual check on pellet quality. Where the lot is large enough we run a trial on our own equipment rather than relying on a laboratory number alone.`
        ],
        table: [
          ['Melt flow index', 'Measured and reported with the test condition used'],
          ['Density', 'Measured and reported'],
          ['Filler and ash content', 'Measured where mineral load is suspected'],
          ['Colour', 'Assessed visually and described honestly, including whether it is streaky'],
          ['Pellet quality', 'Fines and oversize assessed; regranulation offered where needed'],
          ['Moisture', 'Checked for hygroscopic polymers'],
          ['Documentation', 'Batch report with the measured values; the deviation from prime is stated'],
          ['Trial', 'Trial quantity available before a full order']
        ]
      },
      {
        h2: 'The risks, stated plainly',
        paras: [
          `Off-grade material is cheaper because it carries risk, and the risk has to be managed rather than wished away. A wide-spec lot with a melt flow outside the window may process perfectly in one machine and poorly in another. A transition lot may run differently at the start of the bag than at the end. A purge lot may contain gels or contamination that only appears after a few hours of production.`,
          `The way to manage it is to test the actual lot, to buy a trial quantity first, and to use off-grade in products where a small variation does not matter. It is a poor fit for a certified pressure pipe or a food-contact container. It is an excellent fit for a drainage pipe, a cable cover, a crate or a bin where the specification has some room.`,
          `We state the deviation on the batch report. If a lot is streaky, we say it is streaky. If the melt flow is at the top of a wide window, we say so. A buyer who is told the truth can plan; a buyer who is told what they want to hear finds out in the extruder.`
        ]
      },
      {
        h2: 'How we buy and sell off-grade',
        paras: [
          `We buy off-grade lots, plant purge, transition material and converter scrap from producers, traders and manufacturers, priced on the tested properties rather than on the seller's description. Larger lots are inspected and sampled before we commit.`,
          `We sell off-grade to processors who understand their own window and can use the saving. Every lot is offered with its measured values, a trial quantity and a clear statement of what it is not suitable for. If you need a guaranteed specification, we will say so and quote prime instead.`
        ]
      },
      {
        h2: 'What off-grade material is used for',
        paras: [
          `Cost-sensitive products where the specification has room for movement.`
        ],
        list: [
          'Non-pressure drainage pipe and conduit',
          'Cable covers, spacers and duct',
          'Injection-moulded crates, bins and pallets',
          'Garden furniture and landscaping products',
          'Agricultural film where clarity is not required',
          'Rotomoulded non-potable tanks and containers',
          'Compound feedstock where the formulator can compensate for the deviation',
          'Industrial sheeting and general fabrication'
        ],
        note: 'Off-grade is not offered for certified pressure pipe, food-contact packaging, medical products or any application where a customer audit requires a full producer specification.'
      }
    ],
    buying: [
      `Al Qaryan Industries buys and sells off-grade polyethylene, polypropylene and PVC, plant purge and converter scrap, and has been trading polymers in Pakistan since 2007. Off-grade sits alongside our prime and recycled ranges so a customer can choose the risk and the price that suit the application.`,
      `Buying off-grade from us: tell us the application and the properties you can accept, and we will offer the lots that fit rather than the lots we want to move. Every offer comes with the measured values and a trial quantity. WhatsApp +92 333 201 0506 for the current list.`,
      `Selling off-grade to us: send the grade designation, the quantity, the reason it is off-grade and photographs of the pellets or bales. We will test a sample and quote against what it actually measures, which is usually a fairer number than a price based on description alone.`
    ],
    faqs: [
      ['Is off-grade the same as recycled?', 'No. Off-grade is usually virgin polymer outside its published window and has never been through a melt history beyond pelletising. Recycled material has been used, collected and reprocessed. They are different products with different limits.'],
      ['How much cheaper is off-grade?', 'It depends entirely on the deviation. A minor colour deviation might be a few percent below prime; a heavily wide-spec purge lot can be far cheaper. The price tracks the risk, so an unusually cheap lot is worth questioning.'],
      ['Can I get a trial before buying a full lot?', 'Yes, and we recommend it. Off-grade behaviour varies between machines, so a trial quantity is the only reliable way to know whether it suits your process.'],
      ['Do you provide a certificate of analysis with off-grade?', 'We provide a batch report with the values we measured, and we state how the lot deviates from prime. It is not a producer certificate, and we do not present it as one.']
    ],
    related: [
      ['Prime materials', 'Virgin polymer with a full producer specification and documentation.', 'prime-materials'],
      ['PP scrap', 'Recycled polypropylene from sacks, crates, caps and containers.', 'pp-scrap'],
      ['UPVC profile scrap', 'Rigid PVC profile scrap recycled into compound.', 'upvc-profile-scrap']
    ],
    cta: CTA
  }
];
