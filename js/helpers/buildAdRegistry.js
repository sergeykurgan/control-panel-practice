import { AD_CITY_ALIASES, AD_OU_CODE_TO_CITY, AD_PREFIX_TO_CITY } from '../data/adConfig.js';
import {
  inferOuCodeFromGroups,
  inferOuCodeFromLogin,
  normalizeOuCode,
  resolveCityFromComputerName,
  resolveCityFromOuPath,
  resolveEmployeeCity,
} from './adMapping.js';
import { parseCsv } from './csvParse.js';

function splitGroups(value) {
  return String(value || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isEmployeeRecord(employee) {
  if (!employee.DisplayName?.trim()) {
    return false;
  }

  if (employee.Login?.endsWith('$')) {
    return false;
  }

  if (/^__/.test(employee.Login || '')) {
    return false;
  }

  return true;
}

function isWorkstation(name, os) {
  if (!/-wss/i.test(name)) {
    return false;
  }

  if (!os) {
    return true;
  }

  return /windows\s*(server)?\s*(10|11)/i.test(os);
}

function readComputerComment(computer) {
  return (computer.Description || computer.Location || computer.Comment || '').trim();
}

function readOuFields(record) {
  return {
    ou: (record.Ou || record.OU || record.OrganizationalUnit || record.Path || '').trim(),
    ouPath: (record.OuPath || record.OUPath || record.Path || '').trim(),
  };
}

function buildEmployees(rows) {
  return rows
    .filter(isEmployeeRecord)
    .map((employee) => {
      const groups = splitGroups(employee.Groups);
      const { ou, ouPath } = readOuFields(employee);
      const login = employee.Login.trim();
      const displayName = employee.DisplayName.trim();
      const ouCode =
        normalizeOuCode(ou, ouPath) || inferOuCodeFromLogin(login) || inferOuCodeFromGroups(groups) || null;

      return {
        displayName,
        login,
        office: employee.Office?.trim() || '',
        ou,
        ouPath,
        ouCode,
        city: resolveEmployeeCity(
          {
            city: employee.City,
            groups,
            ou,
            ouPath,
            displayName,
            login,
          },
          null
        ),
        rawCity: employee.City?.trim() || '',
        groups,
      };
    })
    .filter((employee) => employee.city);
}

function buildComputers(rows) {
  return rows
    .filter((computer) => computer.Name?.trim())
    .map((computer) => {
      const groups = splitGroups(computer.Groups);
      const name = computer.Name.trim();
      const comment = readComputerComment(computer);
      const { ou, ouPath } = readOuFields(computer);
      const cityFromName = resolveCityFromComputerName(name);

      return {
        name,
        os: computer.OS?.trim() || '',
        location: computer.Location?.trim() || '',
        comment,
        assignedEmployee: comment,
        ou,
        ouPath,
        city:
          cityFromName ||
          resolveCityFromOuPath(ouPath) ||
          resolveCityFromOuPath(ou) ||
          resolveEmployeeCity({ city: '', groups, ou, ouPath, displayName: name, login: name }, null),
        groups,
        isWorkstation: isWorkstation(name, computer.OS),
      };
    });
}

export function buildAdRegistryFromCsv(employeesText, computersText) {
  const employees = buildEmployees(parseCsv(employeesText));
  const computers = buildComputers(parseCsv(computersText));
  const workstations = computers.filter((computer) => computer.isWorkstation);

  return {
    syncedAt: new Date().toISOString(),
    source: 'CSV upload',
    ouCodeToCity: AD_OU_CODE_TO_CITY,
    prefixToCity: AD_PREFIX_TO_CITY,
    cityAliases: AD_CITY_ALIASES,
    employees,
    computers,
    workstations,
  };
}

export function detectCsvKind(fileName, headers) {
  const name = fileName.toLowerCase();

  if (name.includes('employee') || headers.includes('DisplayName')) {
    return 'employees';
  }

  if (name.includes('computer') || (headers.includes('Name') && headers.includes('OS'))) {
    return 'computers';
  }

  return null;
}
