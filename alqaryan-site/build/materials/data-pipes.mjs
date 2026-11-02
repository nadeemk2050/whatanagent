// Material pages — group 1: pipe and profile scrap.
// Technical values follow published classifications (ISO 12162 MRS values).
// Anything lot-specific is described as confirmed on the lot certificate, not invented.
import { CTA } from './constants.mjs';

export const PIPE_SCRAP = [
  {
    id: 1041,
    slug: 'hdpe-100-pipe-scrap',
    title: 'HDPE 100 Pipe Scrap',
    focus: 'HDPE 100 pipe scrap',
    focusShort: 'HDPE 100 pipe scrap',
    schemaMaterial: 'High-density polyethylene (PE100)',
    kicker: 'Materials we deal · HDPE pipe scrap',
    h1: 'HDPE 100 pipe scrap',
    lede: `HDPE 100 pipe scrap is the residue of PE100 pressure pipe — offcuts, rejected lengths, decommissioned mains and spool ends collected from water, gas and telecom projects. PE100 is the highest grade in the polyethylene pipe family, and its scrap is one of the most sought-after polyolefin streams in Pakistan because the base resin starts life clean, heavy and fully characterised. Al Qaryan Industries buys, sorts and recycles HDPE 100 pipe scrap at our Shershah Industrial Area facility in Karachi and supplies the recovered material to processors across the country.`,
    chips: ['PE100 · MRS 10 MPa', 'Blue, black, yellow, orange', 'Shredded, regrind or bales', 'Washed and dried'],
    sections: [
      {
        h2: 'What HDPE 100 pipe scrap actually is',
        paras: [
          `PE100 is a bimodal high-density polyethylene classified by its minimum required strength of 10 MPa at 20 degrees Celsius for fifty years, the definition set out in ISO 12162. That strength comes from the molecular architecture rather than from additives, which is why a PE100 pipe that has spent twenty years underground still contains a genuinely high-value polymer. When a municipal water line is replaced, when a gas distribution network is upgraded, or when a contractor finishes a project with unused metreage, the material that comes back is HDPE 100 pipe scrap.`,
          `The scrap arrives in very different shapes: whole coils of small diameter pipe, cut lengths of 90 mm to 630 mm mains, flanged spools from pump stations, fusion-joint offcuts, and the bulky 800 mm and 1000 mm sections recovered from irrigation and outfall schemes. Each shape needs different handling. Coiled material is easy to bale and cheap to transport; large diameter sections are mostly air and have to be cut or crushed on site before they are worth moving.`
        ]
      },
      {
        h2: 'The HDPE 100 pipe scrap grades we handle',
        paras: [
          `Pipe scrap is not one commodity. Colour tells you the application, and the application tells you what else is likely to be inside the load. We separate before we buy, because a mixed load of blue water pipe and orange duct is worth less to everybody than two clean loads.`
        ],
        table: [
          ['Blue PE100', 'Potable water mains. Usually the cleanest stream and the easiest to resell as regrind.'],
          ['Yellow or black-yellow PE100', 'Gas distribution pipe. Requires a documented source; we do not accept unknown-origin gas pipe.'],
          ['Orange PE100', 'Telecom and power duct. Often thin-walled, frequently mixed with draw rope and couplers.'],
          ['Black PE100 with co-extruded stripes', 'General pressure pipe. Stripe layers are the same polymer family and do not affect regrind.'],
          ['PE100-RC', 'Crack-resistant grade used under roads. Treated as PE100 in recycling terms.'],
          ['Large diameter sections', '300 mm and above, including 630 mm, 800 mm and 1000 mm outfall pipe. Needs cutting before transport.'],
          ['Fusion joint offcuts and spool ends', 'Short lengths and flanged pieces from fabrication yards.']
        ],
        note: 'PE100, PE80 and PE63 are not interchangeable on a pressure application, but once recycled none of them keeps a pressure rating — see the processing section below.'
      },
      {
        h2: 'Where our HDPE 100 pipe scrap comes from',
        paras: [
          `Most of our PE100 pipe scrap originates from infrastructure work: water supply schemes, gas distribution contractors, telecom ducting projects and irrigation lining programmes. We buy from contractors clearing a completed site, from utility depots disposing of surplus stock, and from scrap traders who aggregate smaller lots from many sites. Alongside that we import baled and shredded HDPE pipe from the UAE, Saudi Arabia, Malaysia and Indonesia, where large-diameter PE100 mains are replaced on a scheduled cycle and the material is already segregated at source.`,
          `Because pipe scrap is heavy and bulky at the same time, distance matters more than it does for film or bottles. That is why we concentrate on Karachi and the surrounding industrial belt for local purchases, and only import when the landed cost of clean, already-shredded material beats what we can collect ourselves.`
        ]
      },
      {
        h2: 'Specification we work to',
        paras: [
          `PE100 resin itself has a well-known envelope: density in the region of 0.945 to 0.960 g/cm3 and a very low melt flow index, because pipe resin is deliberately high in molecular weight. Recycled pipe scrap sits close to that envelope for density, while melt flow moves with the history of the material and with how much it has been reprocessed. We therefore confirm every figure on the lot rather than quote a catalogue number.`
        ],
        table: [
          ['Polymer', 'High-density polyethylene, PE100 classification'],
          ['Minimum required strength', 'MRS 10 MPa at 20 °C, 50 years (ISO 12162)'],
          ['Typical density', '0.945 to 0.960 g/cm3 for the virgin resin; measured per lot on regrind'],
          ['Melt flow index', 'Low, pipe-grade. Exact figure depends on lot history and is reported after testing'],
          ['Colour', 'Blue, black, yellow, orange, or mixed on request'],
          ['Form supplied', 'Shredded, regrind, agglomerate or pellets; baled on request'],
          ['Moisture', 'Checked before dispatch; dried where the buyer process requires it'],
          ['Contamination', 'Soil, concrete, metal and non-PE plastics removed by hand and by density separation'],
          ['Packing', '25 kg bags, jumbo bags, or loose in bulk'],
          ['Documents', 'Batch test report on request; third-party inspection such as SGS available']
        ]
      },
      {
        h2: 'Contamination that decides the value of a load',
        paras: [
          `The single biggest destroyer of PE100 pipe scrap value is not dirt, it is the wrong polymer hiding in the load. Cross-linked polyethylene — PEX pipe from plumbing — looks like PE, feels like PE and cannot be melted back into a usable product because its molecular network is permanent. A small percentage of PEX in a load shows up as gel particles and hard specks in the finished part, and no amount of washing removes it. We screen for PEX by source and by hand at intake.`,
          `After that come the mechanical contaminants. Sand and soil from trench work abrade the shredder and carry into the wash water. Concrete collars and mortar stuck to the pipe wall are removed by knocking and tumbling before shredding. Steel reinforcement, flange plates, bolts and couplers are picked up by magnet and by metal detector. Draw rope, tape and cable pulled through telecom duct has to be cut out by hand, and pipe ends with solvent-cement transitions or threaded brass inserts are trimmed off and rejected.`,
          `Water is the last one, and it is easy to underestimate. Pipe that has been stored outdoors holds water in the bore, and shredding it produces wet flake that will not feed a pelletiser properly. We dry to a measured moisture level and report it, because a buyer who receives damp regrind blames the material for what is really a drying problem.`
        ]
      },
      {
        h2: 'How we collect HDPE 100 pipe scrap',
        paras: [
          `For contractors we work on a site-clearance basis: we inspect the material where it lies, agree a rate on the assessed grade, and bring the cutting and loading equipment needed to reduce large diameter pipe to transportable lengths. For traders and depots we buy by weight after inspection at our yard, with a written record of the grade agreed so there is no argument later about what was in the truck.`,
          `Suppliers who bring us clean, single-colour, single-application HDPE 100 pipe scrap consistently get the best rate, because that material goes straight into our own production without a sorting stage. Mixed loads are still bought, but they are priced as mixed loads and processed as such.`
        ]
      },
      {
        h2: 'How we process and recycle PE100 pipe scrap',
        paras: [
          `The route is shredding, washing, drying, and then either agglomeration or pelletising depending on what the customer can feed. Large diameter pipe goes through a heavy-duty shredder first because it will not fit any granulator; smaller pipe and offcuts go straight to the granulator. Washing removes soil and residual water-borne deposits, and a density stage separates any polypropylene couplers or polyethylene of a different grade that slipped through. Drying brings moisture down to a level the pelletiser accepts, and the pelletiser with its filtration screen takes out the last fine contamination.`,
          `One point of honesty that matters commercially: recycled PE100 is not PE100. The pressure rating of a pipe is a property of the whole extrusion, not of the resin bag, and reprocessing shortens the molecular chains enough that the material cannot be certified back to MRS 10 MPa. What you get from recycled PE100 pipe scrap is a high-quality, high-density, low-flow polyethylene that is excellent for non-pressure products — and we say so plainly rather than let a buyer discover it in a burst test.`
        ]
      },
      {
        h2: 'What is made from recycled HDPE 100 pipe scrap',
        paras: [
          `The recovered material goes overwhelmingly into non-pressure applications where stiffness, chemical resistance and impact strength matter but hoop stress does not.`
        ],
        list: [
          'Non-pressure drainage and sewer pipe, including double-wall and corrugated structures',
          'Telecom duct and cable protection pipe, where orange or black colour is acceptable',
          'Cable spacers, duct couplers and underground cable covers',
          'Manhole covers, chambers and inspection boxes',
          'HDPE sheets and boards for lining, cutting boards and marine fendering',
          'Rotomoulded water tanks, bins and road barriers, where PE100 regrind blends well with rotomoulding grades',
          'Injection-moulded crates, pallets, and industrial containers',
          'Blow-moulded drums for non-critical contents'
        ],
        note: 'If your product needs a certified pressure rating, tell us at enquiry stage — we will say clearly whether recycled material can meet it or whether you need virgin resin.'
      }
    ],
    buying: [
      `Al Qaryan Industries has been buying and selling HDPE 100 pipe scrap since 2007 and handles around 500 tons of plastic a month across all grades. We buy from contractors, utilities, fabricators and traders, and we sell shredded and reground PE100 pipe scrap to pipe makers, duct manufacturers, moulders and compounders throughout Pakistan.`,
      `If you are buying HDPE 100 pipe scrap from us, send the application, the form you can handle, the colour you can accept, and the monthly tonnage. We will confirm what is in stock, what is in process, and what is coming in from imports, then send a price against your quantity. Trial lots are welcome and we would rather you run one than take a container on trust.`,
      `If you are selling HDPE 100 pipe scrap to us, send photographs of the material, the approximate tonnage, the diameter range and the location. For large diameter or site-clearance lots we will come and look. We are reachable on WhatsApp at +92 333 201 0506 for a quick assessment before anything moves.`
    ],
    faqs: [
      ['Can recycled PE100 still be used for pressure pipe?', 'No, and any supplier who tells you otherwise is guessing. Reprocessing changes the molecular weight distribution, so the material cannot be certified back to MRS 10 MPa. Recycled PE100 pipe scrap is used for non-pressure pipe, duct, sheet and moulded products where it performs very well.'],
      ['Do you buy pipe with concrete or soil still attached?', 'Yes, but it is priced accordingly because cleaning costs us handling time and wear. Knocking off loose concrete and cutting out metal fittings before you deliver moves the load into a better grade and a better rate.'],
      ['What is the difference between PE100, PE80 and PE63 scrap?', 'They are the same polymer family with different minimum required strengths: 10 MPa, 8 MPa and 6.3 MPa respectively. For recycling they behave similarly, but we keep them separate so a buyer who needs a specific density and stiffness gets a consistent feed.'],
      ['How is the material packed for delivery?', 'Shredded or reground material goes in 25 kg bags or jumbo bags; bulky pipe can be delivered loose by the truckload. Deliveries move by road anywhere in Pakistan.']
    ],
    related: [
      ['HDPE 80 scrap', 'The mid-strength grade from older water and irrigation networks.', 'hdpe-80-scrap'],
      ['HDPE 60 scrap', 'Legacy PE63 pipe recovered from decommissioned lines.', 'hdpe-60-scrap'],
      ['PVC pipe scrap', 'uPVC drainage and sewer pipe recovered for regrind and compound.', 'pvc-pipe-scrap']
    ],
    cta: CTA
  },

  {
    id: 1042,
    slug: 'hdpe-80-scrap',
    title: 'HDPE 80 Scrap',
    focus: 'HDPE 80 scrap',
    focusShort: 'HDPE 80 scrap',
    schemaMaterial: 'High-density polyethylene (PE80)',
    kicker: 'Materials we deal · HDPE pipe scrap',
    h1: 'HDPE 80 scrap',
    lede: `HDPE 80 scrap comes from PE80 pipe — the generation of polyethylene pressure pipe that supplied most water and irrigation networks before PE100 took over. Municipalities and contractors in Pakistan still replace PE80 mains in quantity, and every decommissioned line releases a heavy, clean, well-identified polyethylene stream. Al Qaryan Industries buys HDPE 80 scrap across the country and recycles it in Karachi into regrind, agglomerate and pellets for non-pressure applications.`,
    chips: ['PE80 · MRS 8 MPa', 'Black, blue, mixed', 'Shredded or baled', 'Nationwide collection'],
    sections: [
      {
        h2: 'What HDPE 80 scrap is',
        paras: [
          `PE80 is a high-density polyethylene with a minimum required strength of 8 MPa at 20 degrees Celsius over fifty years, the middle tier of the three pipe classifications defined in ISO 12162. It is typically a little less dense than PE100 and easier to process, which made it the standard choice for medium-pressure water distribution, irrigation mains and rural supply schemes from the 1980s through the 2000s. HDPE 80 scrap is what comes back when those networks are repaired, extended or replaced.`,
          `In recycling terms PE80 has one very useful property: because it is slightly lower in density and higher in melt flow than PE100, it blends more readily with other HDPE streams and processes on a wider range of machinery. That makes HDPE 80 scrap a practical feedstock for moulders who need a dependable, forgiving polyethylene rather than a tightly specified one.`
        ]
      },
      {
        h2: 'Where our HDPE 80 scrap comes from',
        paras: [
          `Our PE80 supply is dominated by decommissioned water mains. When a city replaces an old distribution line with PE100, the removed pipe is stacked on site, and the length of that stack decides whether it is worth transporting. We buy it where it is, cut it down to size and move it by the truckload. Irrigation departments and agricultural schemes are the second source: large-diameter PE80 mains from canal-fed systems that have been relined or abandoned.`,
          `Alongside the pipe stream we see PE80 in fabricated form — header manifolds, pump connections and tank outlets — and in mixed HDPE loads from traders where the grade is not documented. For those we test rather than assume, because a load sold as PE80 that is really PE100 still works for most non-pressure products but prices differently.`
        ]
      },
      {
        h2: 'HDPE 80 scrap grades and what each is worth',
        paras: [
          `Grade is assessed on three things: colour, wall thickness and cleanliness. Colour tells us the original application and therefore what contamination to expect. Wall thickness tells us the shredding time and the bulk density of the output. Cleanliness determines whether the material goes straight to the granulator or needs a full wash line.`
        ],
        table: [
          ['Black PE80 water main', 'Most common grade. Weathers well and keeps its properties after years in the ground.'],
          ['Blue PE80', 'Potable water pipe. Clean and easy to resell as regrind.'],
          ['Irrigation main, large diameter', 'Heavy wall sections, usually soiled, needs cutting and washing.'],
          ['PE80 fittings and manifolds', 'Thicker sections and moulded shapes; good melt quality.'],
          ['Mixed HDPE pipe', 'Undocumented blend of PE63, PE80 and PE100. Bought as mixed and processed as mixed.'],
          ['Slightly contaminated pipe', 'Pipe with soil, concrete or metal fittings still attached. Priced lower and cleaned in-house.']
        ]
      },
      {
        h2: 'Specification we work to',
        paras: [
          `PE80 resin typically sits in a density band below PE100 with a slightly higher melt flow, which is exactly the combination that makes it easy to reprocess. As with every recycled grade we sell, the numbers that matter are measured on the lot and reported, not carried over from a datasheet.`
        ],
        table: [
          ['Polymer', 'High-density polyethylene, PE80 classification'],
          ['Minimum required strength', 'MRS 8 MPa at 20 °C, 50 years (ISO 12162)'],
          ['Typical density', 'Around 0.930 to 0.945 g/cm3 for virgin resin; confirmed on regrind per lot'],
          ['Melt flow index', 'Higher than PE100 pipe resin; measured per lot for the buyer application'],
          ['Colour', 'Black, blue, or mixed'],
          ['Form supplied', 'Regrind, shredded, agglomerate or pellets'],
          ['Moisture', 'Measured and reported before dispatch'],
          ['Packing', '25 kg bags, jumbo bags or bulk by truckload'],
          ['Documents', 'Batch test report; inspection by a third party on request']
        ]
      },
      {
        h2: 'Contamination and inspection',
        paras: [
          `Pipe that has lived underground comes back with the ground attached. Soil inside the bore and packed into the corrugations is the main volume contaminant and the main cost, because it has to be removed with water and time. Concrete thrust blocks at joints are chipped off before shredding so they do not blunt the blades. Steel tie rods, repair clamps and tapping saddles are removed by magnet.`,
          `The subtle risks are the ones that cost a buyer a production run. Polypropylene fittings mixed into a PE load show up as hard islands in the melt. PEX insert fittings from plumbing work cannot be melted at all. And pipe that has carried agricultural chemicals needs to be identified by source; we do not blend unknown-service agricultural pipe into material destined for potable-water-adjacent products.`
        ]
      },
      {
        h2: 'How we buy HDPE 80 scrap',
        paras: [
          `We buy on weight after inspection, and we will look at a lot before it moves if it is large enough to justify the trip. For municipal and contractor clearances we quote against the assessed grade, arrange the transport, and handle the cutting on site. For traders, a photograph of the stack, an estimated tonnage and a location is enough to start.`,
          `Payment terms, loading arrangements and delivery scheduling are agreed up front in writing so there is no ambiguity on the day. Suppliers who deliver regularly get priority on scheduling, and clean single-grade loads always price better than mixed ones.`
        ]
      },
      {
        h2: 'How we recycle HDPE 80 scrap',
        paras: [
          `Small and medium diameter pipe is granulated directly. Large diameter sections are shredded first, then washed, then dried and pelletised with filtration. Because PE80 melts a little more easily than PE100, the pelletising stage runs at lower energy and produces a more uniform pellet, which is one reason buyers who need consistency ask for PE80-based regrind.`,
          `The output is inspected for colour consistency and screened for foreign particles before packing. We keep PE80 separate from PE100 wherever the volumes allow, and we tell buyers when a lot is a blend so the specification they set matches what they will receive.`
        ]
      },
      {
        h2: 'What is made from recycled HDPE 80 scrap',
        paras: [
          `Recycled PE80 is a workhorse material: strong, chemically resistant, weldable and easy to mould. It goes into products where those qualities pay and pressure certification does not apply.`
        ],
        list: [
          'Corrugated and double-wall drainage pipe for roads and housing schemes',
          'Cable duct and telecom conduit',
          'HDPE sheets for lining, pond covers and industrial partitions',
          'Injection-moulded crates, bins and pallets',
          'Rotomoulded water tanks and storage containers',
          'Blow-moulded jerry cans and non-critical drums',
          'Compound feedstock for pipe makers running non-pressure lines'
        ]
      }
    ],
    buying: [
      `We buy HDPE 80 scrap from municipalities, contractors, irrigation departments and scrap traders, and we sell the recovered regrind and pellets to pipe manufacturers, moulders and compounders across Pakistan. With 500 tons a month of processing capacity at our Karachi facility, we can absorb both steady monthly volumes and one-off clearances.`,
      `For buyers, tell us the product you are running, the form you need and your monthly tonnage, and we will match it against current stock. For sellers, send photographs, tonnage and location on WhatsApp at +92 333 201 0506 and we will come back with an assessed grade and a rate.`,
      `Because HDPE 80 scrap is a steady, predictable stream, we are able to hold buffer stock and keep supplying through the months when demolition work slows down. If you need a consistent monthly allocation rather than a one-time purchase, that is the arrangement we prefer to build.`
    ],
    faqs: [
      ['Is HDPE 80 better than PE100 for recycling?', 'It is easier to process because it melts more readily and tolerates a wider blending window. PE100 gives higher stiffness and density. Neither keeps a pressure rating after recycling, so the choice is really about the melt behaviour your machine needs.'],
      ['Do you accept pipe with water still inside?', 'Yes, but it is priced as wet material and dried in our process. Draining pipe before delivery reduces transport weight and improves the rate you receive.'],
      ['Can you supply HDPE 80 regrind in a fixed colour?', 'Black and blue are the colours we see most and can usually hold. For other colours we will confirm what is available rather than promise a match we cannot repeat.'],
      ['What quantity do you buy?', 'From a single truckload upward. One-off clearances are welcome; recurring monthly tonnage is even better because it lets us plan import volumes around it.']
    ],
    related: [
      ['HDPE 100 pipe scrap', 'The highest grade of PE pipe scrap, from pressure water and gas mains.', 'hdpe-100-pipe-scrap'],
      ['HDPE 60 scrap', 'Legacy PE63 pipe from the oldest decommissioned networks.', 'hdpe-60-scrap'],
      ['HDPE cable cover scrap', 'Cable protection covers and duct recovered from utility works.', 'hdpe-cable-cover-scrap']
    ],
    cta: CTA
  },

  {
    id: 1043,
    slug: 'hdpe-60-scrap',
    title: 'HDPE 60 Scrap',
    focus: 'HDPE 60 scrap',
    focusShort: 'HDPE 60 scrap',
    schemaMaterial: 'High-density polyethylene (PE63)',
    kicker: 'Materials we deal · HDPE pipe scrap',
    h1: 'HDPE 60 scrap',
    lede: `HDPE 60 scrap is the trade name for recovered PE63 pipe — the oldest of the three polyethylene pipe classifications, with a minimum required strength of 6.3 MPa. It is the material of the original rural water schemes, farm irrigation lines and low-pressure distribution networks, and large volumes of it are still being pulled out of the ground across Pakistan. Al Qaryan Industries buys HDPE 60 scrap, grades it honestly for what it is, and recycles it into material for products that do not need pressure performance.`,
    chips: ['PE63 · MRS 6.3 MPa', 'Legacy networks', 'Higher melt flow', 'Regrind and agglomerate'],
    sections: [
      {
        h2: 'What HDPE 60 scrap is',
        paras: [
          `PE63 sits at the bottom of the ISO 12162 pipe classification with a minimum required strength of 6.3 MPa at 20 degrees Celsius over fifty years. It was the standard polyethylene for low-pressure water lines from the 1970s onwards and is still found in agricultural supply networks, village water schemes and older industrial service lines. When those lines are replaced, the removed pipe is sold as HDPE 60 scrap.`,
          `The grade is often called HDPE 60 rather than PE63 in the Pakistani market, and the two names describe the same material. Its melt flow is higher than PE80 and considerably higher than PE100, which makes it the easiest of the three to process — and the least suited to anything that needs stiffness or pressure resistance.`
        ]
      },
      {
        h2: 'Why HDPE 60 scrap is still worth buying',
        paras: [
          `Buyers sometimes dismiss PE63 as old material and walk away. That is a mistake, because the polymer itself has not degraded in any fundamental way; what has changed is the classification the market applies to new pipe. Recycled HDPE 60 still delivers good impact strength, excellent chemical resistance and reliable weldability, which is exactly what a drainage pipe, a duct or an injection-moulded crate needs.`,
          `What it does not deliver is stiffness. PE63 pipe walls were made thicker to compensate for lower strength, so the scrap is heavy per metre and the regrind has a lower modulus than PE100 regrind. Products designed around PE100 regrind may need a wall-thickness adjustment if they switch to a PE63 feed, and we flag that at enquiry stage rather than after delivery.`
        ]
      },
      {
        h2: 'Where our HDPE 60 scrap comes from',
        paras: [
          `The main source is agricultural replacement work. Irrigation distributors replacing fifty-year-old supply lines generate long runs of PE63 in a single clearance, often in remote locations where transport is the dominant cost. We assess those lots on site and arrange cutting and loading so the material moves in the densest form possible.`,
          `The second source is municipal and village water schemes, where old distribution pipe is removed during rehabilitation. The third is mixed HDPE arriving from traders, in which PE63 is present but undocumented; we test those loads and classify them by measured melt flow rather than by what the seller claims.`
        ]
      },
      {
        h2: 'Specification we work to',
        paras: [
          `Because PE63 varies more between producers than modern PE100 does, we specify on measured properties for each lot. The table below shows what we report and what we agree with the buyer before dispatch.`
        ],
        table: [
          ['Polymer', 'High-density polyethylene, PE63 classification'],
          ['Minimum required strength', 'MRS 6.3 MPa at 20 °C, 50 years (ISO 12162)'],
          ['Typical density', 'Around 0.920 to 0.940 g/cm3 for virgin resin; measured on regrind per lot'],
          ['Melt flow index', 'Higher than PE80; the defining property of the grade and always reported'],
          ['Colour', 'Black, blue, natural, or mixed'],
          ['Form supplied', 'Regrind, shredded, agglomerate or pellets'],
          ['Moisture', 'Checked and reported before dispatch'],
          ['Packing', '25 kg bags, jumbo bags or bulk'],
          ['Documents', 'Batch test report; third-party inspection available on request']
        ]
      },
      {
        h2: 'Contamination and inspection',
        paras: [
          `Old agricultural pipe is the dirtiest pipe stream we handle. It comes out of soil, it has been exposed to sun for decades, and it frequently has mud packed into the bore. Washing is not optional; it is the whole process. We screen for UV-degraded material by hand, because pipe that has been lying above ground in the sun for years develops a chalky surface layer that produces dust and odour in the melt.`,
          `Metal is the other routine contaminant: repair clamps, wire ties and galvanised fittings from junctions. Agricultural pipe can also carry pesticide and fertiliser residue, so we keep it out of any stream destined for products that touch drinking water.`
        ]
      },
      {
        h2: 'How we buy HDPE 60 scrap',
        paras: [
          `We buy by weight after inspection, with the grade and price agreed in writing before the truck is loaded. For remote agricultural clearances we will travel to inspect when the tonnage justifies it, and we handle cutting and loading so the material arrives in a form we can process immediately.`,
          `Because the market for HDPE 60 scrap is thinner than for PE100, sellers often struggle to find a buyer at all. That is where we add value: we take the grade the market avoids, process it properly and find it a home in products that suit it.`
        ]
      },
      {
        h2: 'How we process and recycle it',
        paras: [
          `PE63 shreds easily, which keeps our cost down and lets us accept material that other recyclers reject as too bulky. The line is shredding, washing, drying and pelletising with filtration; agglomerate is available for buyers whose machines prefer it to pellets. Because melt flow is naturally higher, pelletising runs cool and fast, and the resulting pellet is uniform.`,
          `We do not blend PE63 silently into a PE100 consignment. If a lot is a blend, the buyer is told and the specification reflects it. That discipline is what keeps repeat customers coming back.`
        ]
      },
      {
        h2: 'What is made from recycled HDPE 60 scrap',
        paras: [
          `The output suits products where toughness and chemical resistance matter more than rigidity.`
        ],
        list: [
          'Agricultural drainage pipe and land drainage coils',
          'Low-pressure irrigation fittings and connectors',
          'Corrugated conduit for cables in housing and industrial estates',
          'Injection-moulded crates, nursery trays and bins',
          'Rotomoulded tanks for non-potable water and agricultural use',
          'HDPE sheet for general fabrication and lining',
          'Blow-moulded containers where pressure resistance is not required'
        ]
      }
    ],
    buying: [
      `Al Qaryan Industries buys HDPE 60 scrap from agricultural contractors, irrigation departments, village water schemes and scrap traders, and sells the recycled output to pipe makers, moulders and rotomoulders across Pakistan. We handle the grade honestly: it is described as PE63 with the measured melt flow, not dressed up as something it is not.`,
      `If you are selling, send photographs, the tonnage and the location on WhatsApp at +92 333 201 0506. If the lot is large and remote, we will come and assess it. If you are buying, tell us the product and the melt flow window your machine needs and we will confirm what we can hold on a repeat basis.`,
      `We have been trading and recycling polyethylene since 2007 and have the yard space and processing capacity to take whole clearances rather than cherry-pick the easy loads. That is often the difference between a clearance that happens and one that stalls for months.`
    ],
    faqs: [
      ['Is HDPE 60 the same as PE63?', 'Yes. HDPE 60 is the common market name in Pakistan for pipe made from PE63 resin, which has a minimum required strength of 6.3 MPa under ISO 12162.'],
      ['Can HDPE 60 regrind be mixed with PE100 regrind?', 'It can be blended, and many processors do blend to adjust melt flow. The important thing is that the blend is declared so the buyer can set a specification that matches reality.'],
      ['Do you buy sun-damaged agricultural pipe?', 'Yes, in most cases. Heavily UV-degraded material is priced lower and screened during processing, but it is a legitimate feed for dark-coloured drainage and conduit products.'],
      ['What is the minimum quantity?', 'One truckload. Smaller lots can be aggregated by traders and delivered as a combined load.']
    ],
    related: [
      ['HDPE 80 scrap', 'Mid-strength PE80 pipe recovered from water and irrigation mains.', 'hdpe-80-scrap'],
      ['HDPE 100 pipe scrap', 'High-strength PE100 pipe from water, gas and telecom projects.', 'hdpe-100-pipe-scrap'],
      ['PP scrap', 'Polypropylene from woven sacks, crates and containers.', 'pp-scrap']
    ],
    cta: CTA
  },

  {
    id: 1044,
    slug: 'pvc-pipe-scrap',
    title: 'PVC Pipe Scrap',
    focus: 'PVC pipe scrap',
    focusShort: 'PVC pipe scrap',
    schemaMaterial: 'Unplasticised polyvinyl chloride (uPVC)',
    kicker: 'Materials we deal · PVC scrap',
    h1: 'PVC pipe scrap',
    lede: `PVC pipe scrap is the largest rigid PVC stream in Pakistan: drainage pipe, sewer pipe, casing, conduit and irrigation pipe removed from construction sites, replaced networks and fabrication yards. Unplasticised PVC is dense, dimensionally stable, chemically resistant and — crucially — easy to regrind and re-compound. Al Qaryan Industries buys PVC pipe scrap and runs it through our own extrusion and compounding operation in Karachi, which means we are both a buyer of the scrap and a supplier of recycled PVC compound.`,
    chips: ['Rigid uPVC', 'Density around 1.4', 'Regrind and compound', 'Feeds our own lines'],
    sections: [
      {
        h2: 'What PVC pipe scrap is',
        paras: [
          `Rigid PVC pipe is made from polyvinyl chloride resin compounded with stabilisers, lubricants and fillers, with no plasticiser — which is why it is called uPVC, unplasticised. That formulation gives it a density of roughly 1.4 g/cm3, about forty percent heavier than polyethylene, and it is that density that shapes the whole recycling economics: a truckload of PVC pipe scrap weighs much more than a truckload of HDPE pipe, so transport cost per ton is lower and collection radius can be wider.`,
          `PVC pipe scrap covers everything from short offcuts produced when a plumber cuts a 4 inch drain line, to whole stacks of rejected 12 inch sewer pipe from a failed hydrostatic test, to kilometres of conduit stripped out of a demolished building. The source decides the quality, and the quality decides what the regrind can become.`
        ]
      },
      {
        h2: 'PVC pipe scrap grades we buy',
        paras: [
          `We separate PVC pipe scrap by colour, wall thickness and service history, because each combination behaves differently in the extruder. Clear and white material can go back into visible products; grey and black material goes into buried or hidden applications where colour does not matter.`
        ],
        table: [
          ['White or grey drainage pipe', 'Soil and waste systems, usually clean and easy to regrind.'],
          ['Sewer pipe, large diameter', '110 mm to 400 mm and above; heavy wall, needs shredding before grinding.'],
          ['Electrical conduit', 'Thin wall, light and bulky; often mixed with fittings and boxes.'],
          ['Irrigation and agricultural pipe', 'Soiled and UV-exposed; requires washing and screening.'],
          ['Blue or green pressure pipe offcuts', 'Clean fabrication waste with good colour consistency.'],
          ['Casing pipe and borehole liner', 'Thick wall, excellent regrind quality.'],
          ['Mixed PVC pipe with fittings', 'Contains solvent-cement joints and rubber rings which must be separated.']
        ]
      },
      {
        h2: 'Where our PVC pipe scrap comes from',
        paras: [
          `Construction sites are the biggest single source. Every building project generates PVC pipe offcuts, and every demolition releases whole drainage stacks. We buy from contractors, from plumbing merchants clearing damaged stock, and from the dealers who collect construction waste. Fabricators who bend, cut and weld PVC pipe produce a steady stream of clean, single-colour offcuts that is the best quality PVC pipe scrap available anywhere.`,
          `Municipal replacement work supplies large diameter sewer and water pipe, and utility contractors supply conduit. We also import baled and shredded rigid PVC from the Gulf and Southeast Asia when the landed price supports it, generally for clean white material that our compound customers prefer.`
        ]
      },
      {
        h2: 'Specification we work to',
        paras: [
          `Rigid PVC is specified by K-value or viscosity number rather than melt flow index, because it does not flow on its own — it is processed with additives. For recycled pipe scrap we report the properties a compounder actually needs to set their formulation.`
        ],
        table: [
          ['Polymer', 'Unplasticised polyvinyl chloride (uPVC)'],
          ['Typical density', 'Around 1.38 to 1.45 g/cm3 depending on filler and stabiliser system'],
          ['K-value', 'Pipe grades are commonly in the K65 to K68 range; regrind values shift with additive history and are reported per lot'],
          ['Form supplied', 'Regrind, shredded, or compounded pellet'],
          ['Colour', 'White, grey, black, blue, mixed'],
          ['Stabiliser note', 'Lead-stabilised material is kept separate from calcium-zinc material where documentation allows'],
          ['Contamination', 'Rubber rings, solvent cement joints, metal inserts and soil removed before processing'],
          ['Packing', '25 kg bags, jumbo bags or bulk'],
          ['Documents', 'Batch report; third-party inspection available']
        ],
        note: 'If you are buying recycled PVC for a product that will contact drinking water or be sold into the EU, tell us — the stabiliser system has to be documented, and we will only offer material where it can be.'
      },
      {
        h2: 'Contamination that matters in PVC pipe scrap',
        paras: [
          `PVC has three contaminants that do real damage. The first is plasticised PVC. Flexible PVC from hoses, cables and flooring contains plasticiser that migrates into rigid compound and destroys its dimensional stability. A single hose coiled into a load of pipe scrap can contaminate a whole batch, so hand sorting at intake is not optional.`,
          `The second is metal. Threaded brass inserts, steel reinforcement in some composite pipes, and galvanised brackets all have to be removed. A metal detector on the outlet catches what the eye misses.`,
          `The third is the joint. Solvent-cemented joints and rubber ring seals are different materials, and both have to be cut out. We trim joint ends before grinding; it is slower than grinding everything, but it is the difference between a compound that extrudes cleanly and one that leaves gels and black specks in the finished pipe.`
        ]
      },
      {
        h2: 'How we collect PVC pipe scrap',
        paras: [
          `For contractors and demolition firms we offer site clearance: we assess the material on site, agree a rate on the assessed grade, and handle the loading. Large diameter sewer pipe is cut on site to lengths that fit a truck. For fabricators we arrange scheduled collection, which suits the steady offcut volumes they generate.`,
          `Traders can deliver to our yard by weight. Every load is inspected and graded against the agreed description, and the grading is recorded so a repeat supplier knows exactly what to deliver to reach the top rate.`
        ]
      },
      {
        h2: 'How we recycle PVC pipe scrap',
        paras: [
          `PVC is not remelted and pelletised the way polyethylene is. Rigid PVC pipe scrap is shredded, washed, dried and ground to a controlled particle size, then either sold as regrind for a customer to formulate themselves or compounded in our own operation with stabiliser, lubricant and filler to a specification. Our two PVC pipe extrusion lines in Karachi consume recycled compound directly, which gives us a guaranteed internal outlet and lets us run a steady purchase programme for scrap.`,
          `The advantage of being both recycler and pipe producer is quality control. If a batch of regrind is not good enough, we find out on our own extrusion line before it reaches a customer, not after. That is why our compound leaves the yard with a batch report rather than a verbal assurance.`
        ]
      },
      {
        h2: 'What is made from recycled PVC pipe scrap',
        paras: [
          `Recycled rigid PVC performs well in any product that does not need a pressure rating or a potable-water certificate.`
        ],
        list: [
          'Non-pressure drainage pipe and soil waste systems',
          'Conduit for electrical and telecom cabling',
          'Cable protection tiles and covers',
          'Garden and agricultural fittings',
          'PVC profiles for partitions, trunking and skirting',
          'Drainage chambers, inspection covers and gully gratings',
          'Compound feedstock for pipe producers running non-pressure lines'
        ]
      }
    ],
    buying: [
      `Al Qaryan Industries buys PVC pipe scrap across Pakistan and supplies recycled rigid PVC regrind and compound from our Karachi facility. Because we extrude PVC pipe ourselves, we are a consistent buyer rather than a trader who disappears when the market softens.`,
      `Selling to us: send photographs showing the pipe type, colour and approximate wall thickness, plus the tonnage and location. For large diameter or site-clearance lots we will inspect in person. WhatsApp +92 333 201 0506 is the fastest route to an assessment.`,
      `Buying from us: tell us the product, the colour you need, whether you can take regrind or require finished compound, and your monthly tonnage. We will confirm the specification we can hold and supply a trial load so you can run it before committing.`
    ],
    faqs: [
      ['Is PVC pipe scrap better than HDPE scrap?', 'It is different. PVC is denser, so transport is cheaper per ton, and it re-compounds well for rigid products. HDPE is tougher and more forgiving in processing. Most processors use both, for different products.'],
      ['Do you accept pipe with solvent-cement joints?', 'Yes, but joint ends are trimmed and separated because the cement and the fitting material are not the same as the pipe. Loads with many joints are graded lower.'],
      ['Can recycled PVC be used for drinking water pipe?', 'Not without a documented stabiliser system that meets the relevant standard. For anything touching potable water, tell us at enquiry stage so we can confirm whether the material qualifies rather than assume it.'],
      ['What happens to the rubber seals?', 'They are removed during sorting and sent for separate processing. Rubber in a PVC grind shows up as soft black specks and cannot be filtered out later.']
    ],
    related: [
      ['UPVC profile scrap', 'Window and door profile scrap with glass, gasket and reinforcement removed.', 'upvc-profile-scrap'],
      ['PVC cable scrap', 'Cable insulation and sheathing recovered for PVC compound.', 'pvc-cable-scrap'],
      ['HDPE 100 pipe scrap', 'PE100 pressure pipe recovered from water and gas networks.', 'hdpe-100-pipe-scrap']
    ],
    cta: CTA
  },

  {
    id: 1045,
    slug: 'upvc-profile-scrap',
    title: 'UPVC Profile Scrap',
    focus: 'UPVC profile scrap',
    focusShort: 'UPVC profile scrap',
    schemaMaterial: 'Unplasticised polyvinyl chloride (uPVC) profile',
    kicker: 'Materials we deal · PVC scrap',
    h1: 'UPVC profile scrap',
    lede: `UPVC profile scrap is the waste stream from window and door manufacture — extrusion offcuts, rejected profiles, cut-outs from drainage and hardware openings, and complete frames removed during renovation. It is one of the cleanest rigid PVC streams available, because profile extrusion is a tightly controlled process and the material is well identified. The catch is that profile is never just PVC: it carries gaskets, steel reinforcement, glass, hardware and sometimes a laminated foil, and all of it has to come out. Al Qaryan Industries buys UPVC profile scrap and recycles it into compound at our Karachi facility.`,
    chips: ['Rigid uPVC profile', 'White, laminated, coloured', 'Glass and steel removed', 'Compound feedstock'],
    sections: [
      {
        h2: 'What UPVC profile scrap is',
        paras: [
          `Window and door profiles are extruded rigid PVC with a carefully balanced additive package: thermal stabiliser, impact modifier, lubricant, filler and pigment. A modern profile is a multi-chambered hollow section designed for stiffness and thermal performance, and the chambers are what make the scrap bulky per kilo. That is why UPVC profile scrap is normally baled or crushed before transport rather than shipped as loose frames.`,
          `Two things make this stream valuable. First, the base resin is high quality and consistent, because profile extrusion demands it. Second, the material is identifiable: a fabricator knows exactly which profile system they run, so we can get colour and formulation information that is rarely available for mixed construction waste.`
        ]
      },
      {
        h2: 'Grades of UPVC profile scrap we handle',
        paras: [
          `The grade depends on how much non-PVC material is attached and what the profile was made from. Fabricator offcuts are the top grade because they have never been outdoors and carry no glass or steel. Demolition frames are the bottom grade because everything is attached and the profile has weathered.`
        ],
        table: [
          ['Fabricator offcuts, white', 'Unweathered, single colour, no glass or steel. The best grade available.'],
          ['Fabrication cut-outs and punchings', 'Small pieces from drainage slots and hardware holes; clean and easy to grind.'],
          ['Rejected or surplus profile stock', 'Full lengths, often still bundled, sometimes laminated.'],
          ['Demolition window frames', 'Glass, gaskets, steel reinforcement and hardware all present; requires full dismantling.'],
          ['Laminated or foiled profile', 'Carries a decorative film that must be identified; often downgraded.'],
          ['Coloured profile', 'Brown, grey, anthracite and woodgrain finishes; kept separate by colour.'],
          ['Profile with steel reinforcement', 'Requires the steel to be extracted before grinding.']
        ]
      },
      {
        h2: 'Where our UPVC profile scrap comes from',
        paras: [
          `Profile fabricators are our primary source. Every window factory produces a continuous stream of offcuts, punchings and rejects, and the volume scales directly with their order book. We buy from fabricators across Karachi and Sindh and arrange scheduled collection so the material does not pile up in their yard.`,
          `The second source is renovation and demolition. When a building replaces its windows, the old frames come out complete with glass. Those loads need dismantling, which costs labour, so they are priced lower and only worth moving in quantity. We also buy imported UPVC profile regrind and crushed profile from the Gulf when the quality and price justify it.`
        ]
      },
      {
        h2: 'Specification we work to',
        paras: [
          `Recycled profile compound is specified on the same properties a profile extruder needs to control: K-value, density, filler content and colour. Filler is the one that surprises buyers. Profile formulations contain calcium carbonate at levels that vary by system, and regrind inherits that filler, so a compound made from high-filler profile will not behave like one made from low-filler profile.`
        ],
        table: [
          ['Polymer', 'Unplasticised polyvinyl chloride (uPVC) profile compound'],
          ['Typical density', 'Around 1.45 to 1.55 g/cm3, higher than pipe grade because of filler content'],
          ['K-value', 'Profile grades commonly K67 to K70; measured on regrind and reported'],
          ['Filler content', 'Varies by original profile system; measured per lot'],
          ['Stabiliser note', 'Lead-stabilised and calcium-zinc stabilised material are kept separate where documentation allows'],
          ['Colour', 'White, laminated, coloured or mixed'],
          ['Form supplied', 'Ground regrind or compounded pellet'],
          ['Packing', '25 kg bags, jumbo bags or bulk'],
          ['Documents', 'Batch report; third-party inspection on request']
        ]
      },
      {
        h2: 'Glass, steel and gaskets: the three removals',
        paras: [
          `Demolition frames fail on preparation, not on polymer quality. Glass has to come out before crushing, because shattered glass in a grinder destroys blades and ends up in the regrind where it can score an extruder screw. We remove glazing beads and lift the glass out mechanically, then send the glass for separate recycling.`,
          `Steel reinforcement is the second removal. Most window profiles are reinforced with a galvanised or painted steel insert for structural performance, and it is inside the chamber, so the frame has to be cut or crushed and the steel extracted by magnet. A rare-earth magnet on the outlet catches anything left behind.`,
          `Gaskets and weather seals are the third. EPDM or TPE seals are a different polymer family and will not disperse in PVC; they appear as soft specks in the finished profile. They are pulled out by hand, which is labour-intensive, and it is the main reason demolition frames are worth less per kilo than fabricator offcuts.`
        ]
      },
      {
        h2: 'How we buy UPVC profile scrap',
        paras: [
          `For fabricators we agree a monthly rate on the grade they produce and collect on a schedule, so the material never becomes a storage problem for them. For demolition contractors we quote on the assessed grade after inspection, and we handle dismantling and transport.`,
          `Photographs are usually enough to grade a fabricator load. Demolition loads we prefer to see, because the amount of glass and steel changes the whole economics. WhatsApp +92 333 201 0506 reaches our purchasing team directly.`
        ]
      },
      {
        h2: 'How we recycle UPVC profile scrap',
        paras: [
          `Profile scrap is crushed, then metal-separated, then ground to a controlled particle size and washed where soil or dust is present. The ground material is either sold as regrind or compounded in-house with stabiliser and lubricant to bring it back to a workable formulation. Colour sorting matters commercially: white regrind can go back into white products, while mixed regrind is confined to dark or hidden applications.`,
          `Because our own PVC extrusion lines run recycled compound daily, we have a real-world test bench for every batch. Material that would pass a laboratory check but gel on an extruder is caught before it is sold.`
        ]
      },
      {
        h2: 'What is made from recycled UPVC profile scrap',
        paras: [
          `Recycled profile compound is well suited to products where rigidity, weather resistance and colour stability matter but a pressure rating does not.`
        ],
        list: [
          'New PVC profiles for internal partitions, trunking and skirting',
          'Drainage pipe and fittings',
          'Conduit and cable management systems',
          'Fence posts, garden edging and decking boards',
          'Window and door components in hidden or non-structural positions',
          'Pallet feet, spacers and industrial mouldings',
          'Compound feedstock for profile extruders'
        ],
        note: 'Recycled profile compound is not recommended for structural window frames that must carry a wind-load rating, and we will say so if that is the application you describe.'
      }
    ],
    buying: [
      `Al Qaryan Industries buys UPVC profile scrap from window fabricators, demolition contractors and traders, and supplies recycled profile regrind and compound from our Karachi base. Around 500 tons of plastic moves through our facility each month, and rigid PVC is one of the streams we process most consistently.`,
      `If you run a window factory, we can set up a scheduled collection against a fixed rate for the grade you produce, which removes a waste-handling job from your operation entirely. If you are clearing a building, send photographs of the frames and we will quote on the assessed grade before anything is dismantled.`,
      `If you are buying, tell us the product, the colour and whether filler content matters for your formulation. We will confirm the specification we can hold on a repeat basis and supply a trial batch first.`
    ],
    faqs: [
      ['Why is UPVC profile scrap worth more than mixed PVC?', 'Because the polymer is well identified, the additive package is consistent and fabricator offcuts are clean and unweathered. Mixed PVC from general construction waste needs far more sorting to reach the same quality.'],
      ['Can you remove glass and steel yourselves?', 'Yes, on demolition loads we handle dismantling as part of the purchase. It is labour-intensive, which is reflected in the price offered for frames with glass still fitted.'],
      ['Is lead-stabilised profile a problem?', 'It matters for products with food contact or EU-market requirements. Where documentation allows we keep stabiliser systems separate and will tell you which one a lot carries.'],
      ['Do you buy small quantities from fabricators?', 'We buy from one truckload upward, and for regular fabricators we aggregate smaller weekly volumes into scheduled full loads so the threshold is not a barrier.']
    ],
    related: [
      ['PVC pipe scrap', 'Rigid uPVC drainage, sewer and conduit pipe recovered for compound.', 'pvc-pipe-scrap'],
      ['PVC cable scrap', 'Insulation and sheathing PVC recovered from cable waste.', 'pvc-cable-scrap'],
      ['Off-grade materials', 'Alternative resin grades in bulk for cost-sensitive applications.', 'off-grade-materials']
    ],
    cta: CTA
  }
];
