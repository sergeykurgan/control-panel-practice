import { CITIES } from '../data/cities.js';

const NON_PERSON_COMMENT =
  /^(ноутбук|резерв|свобод|reserve|pool|test\b|тест\b|удалить|\*\*\*|сервер|terminal|терминал)/i;

function normalizePersonName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function buildEmployeeLookup(employees) {
  const lookup = new Map();

  employees?.forEach((employee) => {
    if (!employee.displayName?.trim()) {
      return;
    }

    lookup.set(normalizePersonName(employee.displayName), employee.displayName.trim());
  });

  return lookup;
}

function looksLikePersonName(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length < 2 || words.length > 4) {
    return false;
  }

  return words.every((word) => /^[а-яА-ЯЁё\-]+$/.test(word));
}

export function resolveEmployeeFromComputer(computer, employees = [], lookup = null) {
  const employeeLookup = lookup || buildEmployeeLookup(employees);
  const raw = String(computer.comment || computer.location || '').trim();

  if (!raw || NON_PERSON_COMMENT.test(raw)) {
    return 'Не назначен';
  }

  const exact = employees.find(
    (employee) => employee.displayName?.trim().toLowerCase() === raw.toLowerCase()
  );

  if (exact) {
    return exact.displayName.trim();
  }

  const normalized = normalizePersonName(raw);

  if (employeeLookup.has(normalized)) {
    return employeeLookup.get(normalized);
  }

  const words = raw.toLowerCase().split(/\s+/).filter(Boolean);
  const fuzzy = employees.find((employee) => {
    const displayName = employee.displayName?.trim().toLowerCase();

    if (!displayName || words.length < 2) {
      return false;
    }

    return words.every((word) => displayName.includes(word));
  });

  if (fuzzy) {
    return fuzzy.displayName.trim();
  }

  if (looksLikePersonName(raw)) {
    return raw;
  }

  return 'Не назначен';
}

function defaultLocationForCity(city) {
  const locations = CITIES[city];

  if (!locations?.length) {
    return 'Офис';
  }

  if (locations.includes('Офис')) {
    return 'Офис';
  }

  return locations[0];
}

function defaultSpecs(os = '') {
  const normalizedOs = String(os || '').trim();

  return {
    cpu: 'уточняется',
    ram: 'уточняется',
    ssd: 'уточняется',
    monitor: 'уточняется',
    keyboard: 'уточняется',
    mouse: 'уточняется',
    webcam: 'уточняется',
    headphones: 'нет',
    ups: 'уточняется',
    os: normalizedOs || 'Windows 11 Pro',
  };
}

function stableWorkplaceId(computerName) {
  return `wp-${computerName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function getWorkstations(registry) {
  if (registry.workstations?.length) {
    return registry.workstations;
  }

  return registry.computers?.filter((computer) => computer.isWorkstation) || [];
}

function compareWorkplaces(a, b) {
  const cityCompare = (a.city || '').localeCompare(b.city || '', 'ru');

  if (cityCompare !== 0) {
    return cityCompare;
  }

  return (a.computerName || '').localeCompare(b.computerName || '', 'ru');
}

export function syncWorkplacesFromAd(registry, workplaces = []) {
  const workstations = getWorkstations(registry).filter((computer) => computer.city && computer.name?.trim());
  const employeeLookup = buildEmployeeLookup(registry.employees);
  const existingByPc = new Map();

  workplaces.forEach((workplace) => {
    const key = workplace.computerName?.trim().toLowerCase();

    if (key) {
      existingByPc.set(key, workplace);
    }
  });

  const result = [];
  const seen = new Set();
  let created = 0;
  let updated = 0;

  workstations.forEach((computer) => {
    const computerName = computer.name.trim();
    const key = computerName.toLowerCase();

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    const employee = resolveEmployeeFromComputer(computer, registry.employees, employeeLookup);
    const existing = existingByPc.get(key);

    if (existing) {
      existing.computerName = computerName;
      existing.city = computer.city;
      existing.employee = employee;

      if (!existing.specs) {
        existing.specs = defaultSpecs(computer.os);
      } else if (computer.os) {
        existing.specs.os = computer.os;
      }

      result.push(existing);
      updated += 1;
      return;
    }

    result.push({
      id: stableWorkplaceId(computerName),
      city: computer.city,
      location: defaultLocationForCity(computer.city),
      employee,
      computerName,
      model: 'уточняется',
      specs: defaultSpecs(computer.os),
    });
    created += 1;
  });

  let keptManual = 0;
  let removed = 0;

  workplaces.forEach((workplace) => {
    const key = workplace.computerName?.trim().toLowerCase();

    if (!key) {
      result.push(workplace);
      keptManual += 1;
      return;
    }

    if (!seen.has(key)) {
      removed += 1;
    }
  });

  result.sort(compareWorkplaces);

  return {
    workplaces: result,
    stats: {
      workstations: workstations.length,
      created,
      updated,
      removed,
      keptManual,
      total: result.length,
    },
  };
}
