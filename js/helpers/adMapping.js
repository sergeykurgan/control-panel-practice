import { AD_CITY_ALIASES, AD_OU_CODE_TO_CITY, AD_PREFIX_TO_CITY } from '../data/adConfig.js';

const OU_CODES = Object.keys(AD_OU_CODE_TO_CITY);

const GENERIC_OU_NAMES = new Set([
  'пользователи',
  'рабочие станции',
  'сервера',
  'системный пользователи',
  'внешние пользователи',
]);

const CITY_NAME_HINTS = [
  ['новосибирск', 'Новосибирск'],
  ['барнаул', 'Барнаул'],
  ['красноярск', 'Красноярск'],
  ['краснодар', 'Краснодар'],
  ['комсомольск', 'Комсомольск-на-Амуре'],
  ['хабаровск', 'Хабаровск'],
  ['москва', 'Москва'],
  ['омск', 'Омск'],
  ['ростов', 'Ростов-на-Дону'],
  ['тополево', 'Хабаровск'],
];

const LOGIN_PREFIX_TO_OU = {
  sknsk02: 'nsk02',
  sknsk: 'nsk',
  skmsk: 'msk',
  skbrn: 'brn',
  skkdr: 'kdr',
  skrov: 'rov',
  skomsk: 'omsk',
  skkhv: 'khv',
  skkms: 'kms',
};

function getOuMap(registry) {
  return registry?.ouCodeToCity || AD_OU_CODE_TO_CITY;
}

function getPrefixMap(registry) {
  return registry?.prefixToCity || AD_PREFIX_TO_CITY;
}

function getCityAliases(registry) {
  return registry?.cityAliases || AD_CITY_ALIASES;
}

export function cityFromOuCode(code, registry = null) {
  if (!code) {
    return null;
  }

  return getOuMap(registry)[code.toLowerCase()] || null;
}

export function extractOuCodeFromPath(ouPath, registry = null) {
  if (!ouPath?.trim()) {
    return null;
  }

  const map = getOuMap(registry);
  const segments = String(ouPath)
    .split(/[/\\|>]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const code = segment.toLowerCase();

    if (map[code]) {
      return code;
    }
  }

  return null;
}

export function normalizeOuCode(rawOu, ouPath, registry = null) {
  const fromPath = extractOuCodeFromPath(ouPath, registry);

  if (fromPath) {
    return fromPath;
  }

  const direct = resolveCityFromOuPath(rawOu, registry);

  if (direct) {
    const code = String(rawOu).trim().toLowerCase();

    if (GENERIC_OU_NAMES.has(code)) {
      return null;
    }

    return code;
  }

  const trimmed = rawOu?.trim().toLowerCase();

  if (!trimmed || GENERIC_OU_NAMES.has(trimmed)) {
    return null;
  }

  if (getOuMap(registry)[trimmed]) {
    return trimmed;
  }

  return null;
}

export function resolveCityFromOuPath(ouPath, registry = null) {
  if (!ouPath?.trim()) {
    return null;
  }

  const map = getOuMap(registry);
  const code = extractOuCodeFromPath(ouPath, registry);

  if (code) {
    return map[code];
  }

  const direct = ouPath.trim().toLowerCase();

  if (map[direct] && !GENERIC_OU_NAMES.has(direct)) {
    return map[direct];
  }

  const dnParts = String(ouPath).match(/OU=([^,]+)/gi);

  if (dnParts) {
    for (const part of dnParts) {
      const codeFromDn = part.replace(/^OU=/i, '').toLowerCase();

      if (GENERIC_OU_NAMES.has(codeFromDn)) {
        continue;
      }

      if (map[codeFromDn]) {
        return map[codeFromDn];
      }
    }
  }

  return null;
}

export function inferCityFromText(text, registry = null) {
  if (!text?.trim()) {
    return null;
  }

  const aliases = getCityAliases(registry);
  const trimmed = text.trim();

  if (aliases[trimmed]) {
    return aliases[trimmed];
  }

  const lower = trimmed.toLowerCase();

  for (const [needle, city] of CITY_NAME_HINTS) {
    if (lower.includes(needle)) {
      return city;
    }
  }

  return null;
}

export function inferOuCodeFromLogin(login) {
  if (!login?.trim()) {
    return null;
  }

  const value = login.trim().toLowerCase();
  const sortedKeys = Object.keys(LOGIN_PREFIX_TO_OU).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (value.startsWith(key)) {
      return LOGIN_PREFIX_TO_OU[key];
    }
  }

  return null;
}

export function inferOuCodeFromGroups(groups) {
  if (!groups?.length) {
    return null;
  }

  const counts = {};

  for (const group of groups) {
    const match = group.match(new RegExp(`^(${OU_CODES.join('|')})\\b`, 'i'));

    if (match) {
      const code = match[1].toLowerCase();
      counts[code] = (counts[code] || 0) + 1;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || null;
}

export function resolveEmployeeCity({ city, groups, ou, ouPath, displayName, login }, registry = null) {
  const map = getOuMap(registry);
  const aliases = getCityAliases(registry);

  const ouCodeFromPath = normalizeOuCode(ou, ouPath, registry);

  if (ouCodeFromPath && map[ouCodeFromPath]) {
    return map[ouCodeFromPath];
  }

  const trimmed = city?.trim();

  if (trimmed && aliases[trimmed]) {
    return aliases[trimmed];
  }

  if (trimmed) {
    return trimmed;
  }

  const fromDisplay = inferCityFromText(displayName, registry);

  if (fromDisplay) {
    return fromDisplay;
  }

  const ouCodeFromLogin = inferOuCodeFromLogin(login);

  if (ouCodeFromLogin && map[ouCodeFromLogin]) {
    return map[ouCodeFromLogin];
  }

  const ouCodeFromGroups = inferOuCodeFromGroups(groups);

  if (ouCodeFromGroups && map[ouCodeFromGroups]) {
    return map[ouCodeFromGroups];
  }

  return inferCityFromText(login, registry);
}

export function resolveCityFromComputerName(computerName, registry = null) {
  if (!computerName) {
    return null;
  }

  const token = computerName.trim().split('-')[0].toLowerCase();
  const map = getPrefixMap(registry);
  const sortedKeys = Object.keys(map).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (token === key) {
      return map[key];
    }
  }

  for (const key of sortedKeys) {
    if (token.startsWith(key)) {
      return map[key];
    }
  }

  return null;
}

export function getEmployeesByCity(city, registry) {
  if (!registry?.employees?.length || !city) {
    return [];
  }

  return registry.employees
    .filter((employee) => employee.city === city)
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'ru'));
}

export function getComputersByCity(city, registry) {
  const list = registry?.workstations?.length ? registry.workstations : registry?.computers;

  if (!list?.length || !city) {
    return [];
  }

  return list
    .filter((computer) => computer.city === city)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
}

export function findComputer(computerName, registry) {
  const list = registry?.computers;

  if (!list?.length || !computerName) {
    return null;
  }

  const normalized = computerName.trim().toLowerCase();
  return list.find((computer) => computer.name?.toLowerCase() === normalized) || null;
}

export function validateAdSyncPayload(data) {
  if (!data || typeof data !== 'object') {
    return 'Файл не распознан.';
  }

  if (!Array.isArray(data.employees) || !Array.isArray(data.computers)) {
    return 'В файле должны быть массивы employees и computers.';
  }

  return '';
}
