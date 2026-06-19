import { CITIES } from './cities.js';
import { inventorySeed } from './inventorySeed.js';

export { CITIES };
export { AD_WORKPLACES_VERSION } from './workplacesSeed.js';

export const PRINTER_TYPE_LABELS = {
  mfp: 'МФУ',
  thermal: 'Термопринтер',
  laser: 'Лазерный',
};

/** Ходовые модели принтеров в парке (базовые названия, без привязки к локации). */
export const PRINTER_MODELS = [
  'Godex DT2x',
  'Godex G500',
  'Godex G530',
  'Godex GE330',
  'TSC TE200',
  'TSC TE310',
  'MPRINT Terra Nova TLP300',
  'Brother MFC-1910W',
  'Brother MFC-L2700DN',
  'Brother MFC-L2720DW',
  'Brother MFC-L2740DW',
  'Canon MF264',
  'HP LaserJet 400 MFP M425',
  'HP LaserJet Pro MFP M125',
  'HP M127',
  'Kyocera ECOSYS M2040dn',
  'Kyocera ECOSYS M2135dn',
  'Kyocera FS-6525MFP',
  'Pantum M6550NW',
  'Pantum M6600NW',
  'Pantum M7100DN',
  'Kyocera ECOSYS P2235dn',
  'Kyocera ECOSYS P3145dn',
];

export const defaultInventory = structuredClone(inventorySeed);
