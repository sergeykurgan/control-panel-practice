export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const normalized = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];

    if (inQuotes) {
      if (char === '"' && normalized[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ';') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && normalized[index + 1] === '\n') {
        index += 1;
      }
      row.push(cell);
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some(Boolean)) {
      rows.push(row);
    }
  }

  if (!rows.length) {
    return [];
  }

  const headers = rows.shift();
  return rows.map((values) => Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ''])));
}
