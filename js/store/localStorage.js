import { defaultInventory } from '../data/defaultData.js';
import { PRINTER_REGISTRY_VERSION, buildPrintersFromRegistry } from '../data/printerRegistry.js';
import { clearSentinel } from '../helpers/format.js';
import { migrateTopolevoItemLocation } from '../helpers/topolevoLocations.js';

const STORAGE_KEY = 'itInventoryPracticeV1';
const API_URL = '/api/inventory';
const LOCATIONS_VERSION = 3;
const PRINTER_CONNECTION_VERSION = 1;

function normalizeCashModel(model) {
  return String(model || '')
    .replace(/\s*\+\s*терминал\s+Сбербанка\s*$/iu, '')
    .trim();
}

function ensurePrinterRegistry(data) {
  if ((data.meta?.printerRegistryVersion || 0) >= PRINTER_REGISTRY_VERSION) {
    return;
  }

  data.printers = buildPrintersFromRegistry();
  data.meta = { ...data.meta, printerRegistryVersion: PRINTER_REGISTRY_VERSION };
}

function migratePrinterConnections(data) {
  if ((data.meta?.printerConnectionVersion || 0) >= PRINTER_CONNECTION_VERSION) {
    return;
  }

  data.printers?.forEach((item) => {
    if (item.connection === 'usb') {
      return;
    }

    const ip = String(item.ip || '').trim();
    if (!ip && item.printerType === 'thermal') {
      item.connection = 'usb';
    }
  });

  data.meta = { ...data.meta, printerConnectionVersion: PRINTER_CONNECTION_VERSION };
}

function migrateLocations(data) {
  if ((data.meta?.locationsVersion || 0) >= LOCATIONS_VERSION) {
    return;
  }

  [...(data.workplaces || []), ...(data.printers || []), ...(data.cash || [])].forEach((item) => {
    migrateTopolevoItemLocation(item);
  });

  data.meta = { ...data.meta, locationsVersion: LOCATIONS_VERSION };
}

export function normalizeInventory(data) {
  data.cash?.forEach((item) => {
    item.model = normalizeCashModel(item.model);
    item.address = clearSentinel(item.address);
    item.phone = clearSentinel(item.phone);
    item.organization = clearSentinel(item.organization) || 'ООО СеверТрейд';
    item.serial = clearSentinel(item.serial);
  });

  data.workplaces?.forEach((item) => {
    if (!item.specs) {
      item.specs = {};
    }

    if (item.comment === undefined || item.comment === null) {
      item.comment = '';
    }

    if (!item.specs.webcam) {
      item.specs.webcam = 'уточняется';
    }

    if (!item.specs.headphones) {
      item.specs.headphones = 'нет';
    }

    if (typeof item.active !== 'boolean') {
      item.active = true;
    }
  });

  data.printers?.forEach((item) => {
    item.connection = String(item.connection || '').trim().toLowerCase() === 'usb' ? 'usb' : 'network';

    if (item.connection === 'usb') {
      item.ip = '';
    }
  });

  migrateLocations(data);
  migratePrinterConnections(data);
  ensurePrinterRegistry(data);

  return data;
}

function readInventoryFromLocalStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return normalizeInventory(structuredClone(defaultInventory));
  }

  try {
    return normalizeInventory(JSON.parse(raw));
  } catch {
    return normalizeInventory(structuredClone(defaultInventory));
  }
}

function writeInventoryToLocalStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeInventory(data)));
}

async function readInventoryFromFile() {
  const response = await fetch(API_URL, {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Не удалось загрузить данные (${response.status})`);
  }

  return normalizeInventory(await response.json());
}

async function writeInventoryToFile(data) {
  const response = await fetch(API_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeInventory(data)),
  });

  if (!response.ok) {
    throw new Error(`Не удалось сохранить данные (${response.status})`);
  }
}

export async function loadInventory() {
  try {
    const fromFile = await readInventoryFromFile();

    if (fromFile) {
      writeInventoryToLocalStorage(fromFile);
      return fromFile;
    }
  } catch (error) {
    console.warn('Файл данных недоступен, пробуем localStorage.', error);
  }

  const fromLocal = readInventoryFromLocalStorage();

  if (localStorage.getItem(STORAGE_KEY)) {
    try {
      await writeInventoryToFile(fromLocal);
    } catch (error) {
      console.warn('Не удалось перенести localStorage в файл.', error);
    }
  }

  return fromLocal;
}

export async function saveInventory(data) {
  const normalized = normalizeInventory(structuredClone(data));
  writeInventoryToLocalStorage(normalized);

  try {
    await writeInventoryToFile(normalized);
  } catch (error) {
    console.warn('Сохранено только в браузере. Запустите: node scripts/serve.mjs', error);
    throw error;
  }

  return normalized;
}

export function resetInventory() {
  localStorage.removeItem(STORAGE_KEY);
}
