import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const today = new Date();

function addDays(days) {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function pick(list, index = 0) {
  return list[index % list.length];
}

const CITIES = {
  'Санкт-Петербург': ['Офис', 'Магазин Невский', 'Склад'],
  'Екатеринбург': ['Офис', 'Магазин'],
  Казань: ['Магазин'],
  Тюмень: ['Магазин', 'СТО'],
  Владивосток: ['Офис', 'Магазин'],
};

const CITY_PREFIX = {
  'Санкт-Петербург': 'SPB',
  Екатеринбург: 'EKB',
  Казань: 'KZN',
  Тюмень: 'TMN',
  Владивосток: 'VLD',
};

const CITY_OU = {
  'Санкт-Петербург': 'spb',
  Екатеринбург: 'ekb',
  Казань: 'kzn',
  Тюмень: 'tmn',
  Владивосток: 'vld',
};

const FIRST_NAMES = ['Алексей', 'Мария', 'Дмитрий', 'Елена', 'Игорь', 'Анна', 'Павел', 'Ольга', 'Никита', 'Юлия'];
const LAST_NAMES = ['Смирнов', 'Кузнецова', 'Попов', 'Васильева', 'Морозов', 'Новикова', 'Фёдоров', 'Соколова', 'Лебедев', 'Козлова'];

const PC_MODELS = ['HP ProBook 450 G9', 'Lenovo ThinkCentre M70q', 'Dell OptiPlex 7090', 'Acer Veriton X'];
const PRINTER_MODELS = [
  { model: 'HP LaserJet Pro M428fdw', type: 'mfp', connection: 'network', ip: '192.168.10.21' },
  { model: 'Kyocera ECOSYS M2040dn', type: 'mfp', connection: 'network', ip: '192.168.10.22' },
  { model: 'Brother MFC-L2740DW', type: 'mfp', connection: 'network', ip: '' },
  { model: 'Godex G500', type: 'thermal', connection: 'network', ip: '192.168.20.15' },
  { model: 'TSC TE310', type: 'thermal', connection: 'usb', ip: '' },
  { model: 'Pantum M6550NW', type: 'mfp', connection: 'network', ip: '192.168.30.40' },
  { model: 'Canon MF264', type: 'mfp', connection: 'usb', ip: '' },
];

const CASH_SCENARIOS = [
  { fnDays: -12, ofdDays: 45, terminal: '', org: 'ООО СеверТрейд' },
  { fnDays: 8, ofdDays: 22, terminal: 'TRM-10042', org: 'ООО СеверТрейд' },
  { fnDays: 55, ofdDays: -3, terminal: 'TRM-10043', org: 'ИП Демидов' },
  { fnDays: 120, ofdDays: 90, terminal: 'TRM-10044', org: 'ООО СеверТрейд' },
  { fnDays: 18, ofdDays: 18, terminal: '', org: 'ООО Восток-Демо' },
  { fnDays: 200, ofdDays: 160, terminal: 'TRM-10045', org: 'ИП Демидов' },
];

function fakeName(index) {
  return `${pick(LAST_NAMES, index)} ${pick(FIRST_NAMES, index + 2)}`;
}

function needsCash(location) {
  return location === 'Магазин' || location.startsWith('Магазин ') || location === 'СТО';
}

function buildEmployees() {
  const employees = [];
  let index = 0;

  Object.keys(CITIES).forEach((city) => {
    for (let i = 0; i < 8; i += 1) {
      employees.push({
        displayName: fakeName(index),
        login: `user${index + 1}`,
        office: '',
        ou: CITY_OU[city].toUpperCase(),
        ouPath: `${CITY_OU[city].toUpperCase()} / Пользователи`,
        ouCode: CITY_OU[city],
        city,
        rawCity: '',
        groups: [],
      });
      index += 1;
    }
  });

  return employees;
}

function buildComputers() {
  const computers = [];
  let counter = 1;

  Object.entries(CITIES).forEach(([city, locations]) => {
    const prefix = CITY_PREFIX[city];

    locations.forEach((location) => {
      const count = location === 'Офис' ? 4 : location === 'Склад' ? 2 : 3;

      for (let i = 0; i < count; i += 1) {
        computers.push({
          name: `${prefix}-WSS-${String(counter).padStart(2, '0')}`,
          os: 'Windows 11 Pro',
          description: `${city} · ${location}`,
          location,
          ou: CITY_OU[city].toUpperCase(),
          ouPath: `${CITY_OU[city].toUpperCase()} / Компьютеры`,
          ouCode: CITY_OU[city],
          city,
          groups: [],
        });
        counter += 1;
      }
    });
  });

  return computers;
}

function buildWorkplaces(employees, computers) {
  const workplaces = [];

  computers.forEach((computer, index) => {
    const employee = index % 5 === 2 ? 'Не назначен' : employees[index % employees.length].displayName;
    const active = index % 7 === 4 ? false : index % 5 !== 2;

    workplaces.push({
      id: `wp-practice-${index + 1}`,
      city: computer.city,
      location: computer.location,
      employee,
      computerName: computer.name,
      model: pick(PC_MODELS, index),
      active,
      comment: index === 2 ? 'Демо: место под нового сотрудника' : '',
      specs: {
        cpu: pick(['Intel Core i5-12400', 'Intel Core i5-13400', 'Intel Core i7-12700'], index),
        ram: pick(['16 GB', '32 GB'], index),
        ssd: pick(['512 GB SSD', '1 TB SSD'], index),
        monitor: pick(['24" Full HD', '27" QHD'], index),
        keyboard: 'Logitech K120',
        mouse: 'Logitech M185',
        webcam: computer.location === 'Офис' ? 'Logitech C920' : 'нет',
        headphones: computer.location === 'Офис' ? 'Jabra Evolve' : 'нет',
        ups: index % 3 === 0 ? 'Ippon Back Basic 650' : 'нет',
        os: 'Windows 11 Pro',
      },
    });
  });

  return workplaces;
}

function buildCash() {
  const cash = [];
  let counter = 1;
  let scenarioIndex = 0;

  Object.entries(CITIES).forEach(([city, locations]) => {
    locations.forEach((location) => {
      if (!needsCash(location)) {
        return;
      }

      const scenario = CASH_SCENARIOS[scenarioIndex % CASH_SCENARIOS.length];
      scenarioIndex += 1;

      cash.push({
        id: `cash-practice-${counter}`,
        city,
        location,
        model: 'АТОЛ 55Ф',
        terminalNumber: scenario.terminal,
        brand: 'ДемоКасса',
        address: `г. ${city}, ${location}`,
        phone: '+7 (800) 000-00-00',
        organization: scenario.org,
        fnExpiry: addDays(scenario.fnDays),
        ofdExpiry: addDays(scenario.ofdDays),
        serial: `DEMO-${1000 + counter}`,
      });
      counter += 1;
    });
  });

  return cash;
}

function buildPrinters() {
  const printers = [];
  let counter = 1;

  Object.entries(CITIES).forEach(([city, locations]) => {
    locations.forEach((location, locationIndex) => {
      for (let slot = 0; slot < 2; slot += 1) {
        const template = PRINTER_MODELS[(counter + locationIndex + slot) % PRINTER_MODELS.length];

        printers.push({
          id: `printer-practice-${counter}`,
          city,
          location,
          model: template.model,
          ip: template.ip,
          connection: template.connection,
          printerType: template.type,
        });
        counter += 1;
      }
    });
  });

  return printers;
}

const syncedAt = new Date().toISOString();
const employees = buildEmployees();
const computers = buildComputers();
const inventory = {
  workplaces: buildWorkplaces(employees, computers),
  cash: buildCash(),
  printers: buildPrinters(),
  meta: {
    printerRegistryVersion: 3,
    printerConnectionVersion: 1,
    locationsVersion: 3,
    practiceDemo: true,
  },
};

const adRegistry = {
  syncedAt,
  source: 'Practice demo data (fictional)',
  ouCodeToCity: Object.fromEntries(Object.entries(CITY_OU).map(([city, code]) => [code, city])),
  prefixToCity: Object.fromEntries(Object.entries(CITY_PREFIX).map(([city, prefix]) => [prefix.toLowerCase(), city])),
  cityAliases: {},
  employees,
  computers,
};

fs.writeFileSync(
  path.join(root, 'js', 'data', 'cities.js'),
  `export const CITIES = ${JSON.stringify(CITIES, null, 2)};\n`,
  'utf8'
);

fs.writeFileSync(
  path.join(root, 'js', 'data', 'inventorySeed.js'),
  `/** Fictional practice demo — generated by scripts/generate-practice-data.mjs */
export const INVENTORY_SEED_SOURCE = 'practice-demo';
export const inventorySeed = ${JSON.stringify(inventory, null, 2)};
`,
  'utf8'
);

fs.writeFileSync(
  path.join(root, 'js', 'data', 'workplacesSeed.js'),
  `/** Practice demo stub */
export const AD_WORKPLACES_VERSION = ${JSON.stringify(syncedAt)};
export const workplacesFromAd = [];
`,
  'utf8'
);

fs.writeFileSync(
  path.join(root, 'js', 'data', 'adSyncBundle.js'),
  `/** Fictional practice demo — generated by scripts/generate-practice-data.mjs */
export const AD_SYNC_VERSION = ${JSON.stringify(syncedAt)};
export const bundledAdRegistry = ${JSON.stringify(adRegistry)};
`,
  'utf8'
);

const ouCodeToCity = Object.fromEntries(Object.entries(CITY_OU).map(([, code]) => [code, Object.entries(CITY_OU).find(([, c]) => c === code)[0]]));
const prefixToCity = Object.fromEntries(
  Object.entries(CITY_PREFIX).map(([city, prefix]) => [prefix.toLowerCase(), city])
);

fs.writeFileSync(
  path.join(root, 'js', 'data', 'adConfig.js'),
  `/** Fictional practice demo — generated by scripts/generate-practice-data.mjs */
export const AD_OU_CODE_TO_CITY = ${JSON.stringify(ouCodeToCity, null, 2)};

export const AD_PREFIX_TO_CITY = ${JSON.stringify(prefixToCity, null, 2)};

export const AD_CITY_ALIASES = {};
`,
  'utf8'
);

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'inventory-store.json'), `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');

console.log('Practice demo generated:');
console.log(`  cities: ${Object.keys(CITIES).length}`);
console.log(`  workplaces: ${inventory.workplaces.length}`);
console.log(`  cash: ${inventory.cash.length}`);
console.log(`  printers: ${inventory.printers.length}`);
console.log(`  employees: ${employees.length}`);
