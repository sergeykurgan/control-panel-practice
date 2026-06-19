import { CITIES } from '../data/cities.js';
import { resolveEmployeeFromComputer } from './syncWorkplacesFromAd.js';
import { inferTopolevoLocation, isWarehouseOfficeLocation, TOPOLEVO } from './topolevoLocations.js';

const WORKPLACE_MODELS = [
  'HP ProDesk 400 G9',
  'HP ProBook 450 G9',
  'Lenovo ThinkCentre M70q Gen 3',
  'Dell OptiPlex 7090',
];

const CPU_OPTIONS = ['Intel Core i5-12400', 'Intel Core i5-13400', 'Intel Core i7-12700', 'уточняется'];
const RAM_OPTIONS = ['8 GB', '16 GB', '32 GB'];
const SSD_OPTIONS = ['256 GB SSD', '512 GB SSD', '1 TB SSD'];
const MONITOR_OFFICE = ['24" Full HD', '27" QHD', '24" Full HD ×2'];
const MONITOR_SHOP = ['24" Full HD', '21" HD'];

function isStoreLocation(location) {
  return location === 'Магазин' || location.startsWith('Магазин ');
}

function isStoLocation(location) {
  return location === 'СТО' || location.startsWith('СТО ');
}

function isOfficeLocation(location) {
  return location === 'Офис' || isWarehouseOfficeLocation(location);
}

function isWarehouseLocation(location) {
  return location === 'Склад' || location === TOPOLEVO.WAREHOUSE;
}

function stableHash(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pick(list, seed) {
  const index = ((Number(seed) >>> 0) % list.length + list.length) % list.length;
  return list[index];
}

function normalizeOs(os) {
  const value = String(os || '').trim();

  if (!value) {
    return 'Windows 11 Pro';
  }

  if (/windows 10/i.test(value)) {
    return 'Windows 10 LTSC';
  }

  if (/windows 11/i.test(value)) {
    return 'Windows 11 Pro';
  }

  return value;
}

function inferLocation(computer, city) {
  const locations = CITIES[city] || ['Офис'];
  const comment = String(computer.comment || computer.assignedEmployee || '').toLowerCase();
  const name = String(computer.name || '').toLowerCase();

  const findLocation = (predicate) => locations.find(predicate);

  if (/тополево|topolevo/.test(comment) || /тополево|topolevo/.test(name)) {
    if (/сто|\bsto\b/.test(comment)) {
      return TOPOLEVO.STO;
    }

    const inferred = inferTopolevoLocation(comment, computer.assignedEmployee, computer.name);

    if (inferred) {
      return inferred;
    }

    return TOPOLEVO.SHOP;
  }

  if (/краснореч/.test(comment)) {
    return findLocation((item) => item.includes('Краснореченская')) || locations[0];
  }

  if (/воронеж/.test(comment)) {
    return findLocation((item) => item.includes('Воронежская')) || locations[0];
  }

  if (/касса|kassa/.test(comment)) {
    return findLocation(isStoreLocation) || locations[0];
  }

  if (/склад|^sk[a-z]*0/.test(comment) || /^sk[a-z]+\d/i.test(computer.name || '')) {
    if (city === 'Хабаровск') {
      return TOPOLEVO.WAREHOUSE;
    }

    if (locations.includes('Склад')) {
      return 'Склад';
    }

    return findLocation(isStoreLocation) || locations[0];
  }

  if (/переговор|офис|\boffice\b/.test(comment)) {
    if (locations.includes('Офис')) {
      return 'Офис';
    }
  }

  if (/^сто\b|\bsto\b/.test(comment)) {
    return findLocation(isStoLocation) || locations[0];
  }

  if (!locations.includes('Офис')) {
    return locations[0];
  }

  const hash = stableHash(computer.name);
  const nonOffice = locations.filter((item) => !isOfficeLocation(item));

  if (!nonOffice.length) {
    return 'Офис';
  }

  if (hash % 100 < 58) {
    return 'Офис';
  }

  return nonOffice[hash % nonOffice.length];
}

function buildSpecs(location, computer) {
  const hash = stableHash(`${computer.name}:${location}`);
  const os = normalizeOs(computer.os);

  const specs = {
    cpu: pick(CPU_OPTIONS, hash),
    ram: pick(RAM_OPTIONS, hash >> 3),
    ssd: pick(SSD_OPTIONS, hash >> 5),
    monitor: isOfficeLocation(location) ? pick(MONITOR_OFFICE, hash >> 7) : pick(MONITOR_SHOP, hash >> 7),
    keyboard: 'Logitech K120',
    mouse: 'Logitech M185',
    webcam: 'уточняется',
    headphones: 'нет',
    ups: hash % 4 === 0 ? 'нет' : 'Ippon Back Basic 650',
    os,
  };

  if (isOfficeLocation(location)) {
    specs.webcam = 'Logitech C920';
    specs.headphones = hash % 5 === 0 ? 'нет' : 'Plantronics Blackwire';
    specs.ups = 'Ippon Back Basic 650';
    return specs;
  }

  if (isStoreLocation(location) || isStoLocation(location)) {
    specs.webcam = 'нет';
    specs.headphones = 'нет';

    if (isStoLocation(location) && hash % 3 === 0) {
      specs.monitor = '21" HD';
    }

    if (hash % 3 === 1) {
      specs.ups = 'нет';
    }

    return specs;
  }

  if (isWarehouseLocation(location)) {
    specs.monitor = '21" HD';
    specs.webcam = 'нет';
    specs.headphones = 'нет';
    specs.ups = 'нет';
  }

  return specs;
}

function stableWorkplaceId(computerName) {
  return `wp-${computerName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function compareWorkplaces(a, b) {
  const cityCompare = (a.city || '').localeCompare(b.city || '', 'ru');

  if (cityCompare !== 0) {
    return cityCompare;
  }

  const locationCompare = (a.location || '').localeCompare(b.location || '', 'ru');

  if (locationCompare !== 0) {
    return locationCompare;
  }

  return (a.computerName || '').localeCompare(b.computerName || '', 'ru');
}

export function buildWorkplacesFromAdRegistry(registry) {
  const workstations = (registry.workstations?.length ? registry.workstations : registry.computers || []).filter(
    (computer) => computer.isWorkstation && computer.city && computer.name?.trim()
  );

  const seen = new Set();
  const workplaces = [];

  workstations.forEach((computer) => {
    const computerName = computer.name.trim();
    const key = computerName.toLowerCase();

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    const city = computer.city;
    const location = inferLocation(computer, city);
    const hash = stableHash(computerName);

    workplaces.push({
      id: stableWorkplaceId(computerName),
      city,
      location,
      employee: resolveEmployeeFromComputer(computer, registry.employees),
      computerName,
      model: pick(WORKPLACE_MODELS, hash >> 9),
      specs: buildSpecs(location, computer),
    });
  });

  workplaces.sort(compareWorkplaces);
  return workplaces;
}
