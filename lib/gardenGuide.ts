// lib/gardenGuide.ts
// A planting guide for a vege garden in Waikanae (Kāpiti Coast): mild coastal climate, light
// frosts, sandy free-draining soil, windy springs and a dry summer. Month by month: what to sow,
// what to plant out as seedlings, what's ready to pick, and the one job that matters most.
//
// Climate figures are NIWA's for Paraparaumu Airport (1981–2010), the nearest long-term station.

export type MonthGuide = {
  sow: string[];      // seeds, straight into the garden or into trays
  plant: string[];    // seedlings or tubers into the garden
  harvest: string[];
  job: string;        // the one thing to get done this month
};

// Index 0 = January.
export const MONTHS: MonthGuide[] = [
  { // January
    sow: ['Beans', 'Beetroot', 'Carrots', 'Lettuce', 'Radish', 'Spring onions', 'Silverbeet'],
    plant: ['Lettuce', 'Last zucchini', 'Broccoli, cabbage & cauli for winter (late Jan)'],
    harvest: ['Tomatoes', 'Beans', 'Zucchini', 'Cucumbers', 'Lettuce', 'Potatoes', 'Berries'],
    job: 'Water deeply in the early morning two or three times a week rather than a little every day, and keep the mulch topped up. Check brassicas for white butterfly caterpillars.',
  },
  { // February
    sow: ['Beetroot', 'Carrots', 'Lettuce', 'Radish', 'Spinach', 'In trays: broccoli, cabbage, cauli, kale, leeks'],
    plant: ['Broccoli', 'Cabbage', 'Cauliflower', 'Kale', 'Leeks', 'Lettuce'],
    harvest: ['Tomatoes', 'Sweetcorn', 'Beans', 'Cucumbers', 'Zucchini', 'Capsicums'],
    job: 'February is one of the driest months here. Keep up deep watering, and save seed from your best beans and tomatoes.',
  },
  { // March
    sow: ['Carrots', 'Beetroot', 'Spinach', 'Lettuce', 'Rocket', 'Radish', 'Peas', 'In trays: onions'],
    plant: ['Broccoli', 'Cabbage', 'Kale', 'Leeks', 'Silverbeet', 'Spring onions'],
    harvest: ['Pumpkins & squash', 'Tomatoes', 'Sweetcorn', 'Potatoes', 'Beans'],
    job: 'Pull out spent summer crops, compost them, and sow a green crop (mustard or lupin) on any bed you won\'t use over winter.',
  },
  { // April
    sow: ['Broad beans', 'Peas', 'Spinach', 'Radish', 'Rocket', 'Mesclun', 'In trays: onions'],
    plant: ['Broccoli', 'Cabbage', 'Cauliflower', 'Kale', 'Lettuce', 'Silverbeet'],
    harvest: ['Pumpkins (cure them in the sun)', 'Last tomatoes', 'Leeks', 'Silverbeet'],
    job: 'Cure pumpkins on a sunny dry spot for a couple of weeks before storing. The first ground frosts can turn up late this month in open low spots.',
  },
  { // May
    sow: ['Broad beans', 'Peas', 'Spinach', 'Radish'],
    plant: ['Garlic', 'Shallots', 'Onions', 'Cabbage', 'Kale', 'Strawberry runners'],
    harvest: ['Broccoli', 'Cauliflower', 'Leeks', 'Silverbeet', 'Kale', 'Carrots', 'Citrus'],
    job: 'Get garlic in (any time up to the shortest day). Dig compost or manure into empty beds and have frost cloth handy.',
  },
  { // June
    sow: ['Broad beans', 'Peas (sheltered spot)', 'In trays: onions'],
    plant: ['Garlic (by the shortest day)', 'Shallots', 'Asparagus crowns', 'Rhubarb', 'Bare-root fruit trees'],
    harvest: ['Broccoli', 'Cabbage', 'Kale', 'Leeks', 'Parsnips', 'Silverbeet', 'Citrus'],
    job: 'Bare-root fruit trees and berries go in now. Keep off the beds when they\'re waterlogged; winter is the wettest season.',
  },
  { // July
    sow: ['Broad beans', 'Peas', 'Indoors on a warm sill: tomatoes, capsicums, chillies, eggplant'],
    plant: ['Asparagus', 'Rhubarb', 'Fruit trees', 'Onion seedlings'],
    harvest: ['Leeks', 'Kale', 'Cabbage', 'Broccoli', 'Brussels sprouts', 'Parsnips'],
    job: 'July is the frostiest month (about five air frosts on average). Cover tender plants on still, clear nights, and prune fruit trees.',
  },
  { // August
    sow: ['Peas', 'Spinach', 'Lettuce', 'Radish', 'Indoors: tomatoes, capsicums, cucumbers'],
    plant: ['Early potatoes (sheltered, late Aug)', 'Onions', 'Lettuce', 'Cabbage'],
    harvest: ['Broccoli', 'Cauliflower', 'Kale', 'Leeks', 'Spinach', 'Silverbeet'],
    job: 'Chit seed potatoes: stand them in egg cartons in a light, cool spot until they sprout. Feed the soil with compost ahead of spring.',
  },
  { // September
    sow: ['Beetroot', 'Carrots', 'Lettuce', 'Peas', 'Radish', 'Spinach', 'Silverbeet', 'Parsley', 'In trays: zucchini, cucumber, pumpkin, sweetcorn'],
    plant: ['Potatoes', 'Onions', 'Lettuce', 'Brassicas', 'Strawberries'],
    harvest: ['Broccoli', 'Asparagus', 'Spinach', 'Silverbeet', 'Lettuce'],
    job: 'Spring is the windiest time of year here. Put up stakes, windbreak cloth or a temporary fence before the summer crops go in.',
  },
  { // October
    sow: ['Beans', 'Beetroot', 'Carrots', 'Lettuce', 'Radish', 'Sweetcorn', 'Zucchini', 'Cucumber', 'Pumpkin'],
    plant: ['Main-crop potatoes', 'After Labour Weekend: tomatoes, capsicums, zucchini, cucumbers, basil'],
    harvest: ['Asparagus', 'Broad beans', 'Lettuce', 'Peas', 'Spring onions', 'Rhubarb'],
    job: 'Labour Weekend is the traditional green light for tomatoes and other frost-tender crops. Stake them well against the spring winds.',
  },
  { // November
    sow: ['Beans', 'Beetroot', 'Carrots', 'Sweetcorn', 'Cucumber', 'Lettuce', 'Pumpkin', 'Zucchini', 'Basil'],
    plant: ['Tomatoes', 'Capsicums', 'Chillies', 'Eggplant', 'Cucumbers', 'Zucchini', 'Pumpkins', 'Sweetcorn', 'Kūmara'],
    harvest: ['Broad beans', 'Peas', 'Lettuce', 'Early potatoes', 'Strawberries'],
    job: 'The soil starts drying out from now until April. Mulch thickly (straw, pea straw or compost) and water deeply in the morning.',
  },
  { // December
    sow: ['Beans', 'Beetroot', 'Carrots', 'Lettuce', 'Radish', 'Cucumber', 'Basil', 'Spring onions'],
    plant: ['Cucumbers', 'Zucchini', 'Pumpkins', 'Sweetcorn', 'Lettuce', 'Celery', 'Leeks for winter'],
    harvest: ['Garlic (around the longest day)', 'Potatoes', 'Peas', 'Beans', 'Strawberries', 'Zucchini', 'Lettuce'],
    job: 'Lift garlic when the leaves are half brown and dry it somewhere airy. Feed tomatoes and pinch out their side shoots.',
  },
];

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** What makes growing in Waikanae different. */
export const LOCAL: { title: string; text: string }[] = [
  {
    title: 'Light frosts',
    text: 'About 12 air frosts a year, May to September, most in July. Ground frosts can touch open spots from April to October. Keep frost-tender crops inside until Labour Weekend.',
  },
  {
    title: 'Dry summers',
    text: 'Around 1,000 mm of rain a year, but most falls in winter. January, February and April are the driest months, and the soil usually runs short of water from November to April.',
  },
  {
    title: 'Sandy soil',
    text: 'Dune sand drains fast and holds little water or food. Dig in compost every season, mulch thickly, and water deeply but less often so roots go down.',
  },
  {
    title: 'Windy springs',
    text: 'Spring brings the strongest winds, with gusts over 63 km/h on about 77 days a year. Stake tall plants and give young seedlings shelter.',
  },
  {
    title: 'Bright coastal sun',
    text: 'The west coast gets plenty of sun and strong UV. Lettuce, coriander and spinach bolt in midsummer, so give them afternoon shade from December.',
  },
  {
    title: 'Soil warmth',
    text: 'Soil is about 7° in July and 20° in January. Most seeds want 10° or more; beans, sweetcorn, pumpkins and cucumbers want 16° or more.',
  },
];
