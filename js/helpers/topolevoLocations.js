export const TOPOLEVO = {
  SHOP: 'Тополево · Магазин',
  WAREHOUSE: 'Тополево · Склад',
  WAREHOUSE_OFFICE: 'Склад · Офис',
  STO: 'СТО Тополево',
};

export const KHABAROVSK_OFFICE = 'Офис';

export const LEGACY_TOPOLEVO_SHOP = 'Магазин Тополево';
export const LEGACY_TOPOLEVO_OFFICE = 'Тополево · Офис';
export const LEGACY_TOPOLEVO_WAREHOUSE_OFFICE = 'Тополево · Склад · Офис';

export function isTopolevoLocation(location) {
  return (
    location === TOPOLEVO.SHOP ||
    location === TOPOLEVO.WAREHOUSE ||
    location === TOPOLEVO.WAREHOUSE_OFFICE ||
    location === TOPOLEVO.STO ||
    location === LEGACY_TOPOLEVO_SHOP ||
    location === LEGACY_TOPOLEVO_OFFICE ||
    location === LEGACY_TOPOLEVO_WAREHOUSE_OFFICE
  );
}

export function isWarehouseOfficeLocation(location) {
  return location === TOPOLEVO.WAREHOUSE_OFFICE || location === LEGACY_TOPOLEVO_WAREHOUSE_OFFICE;
}

export function isTopolevoShopLocation(location) {
  return location === TOPOLEVO.SHOP || location === LEGACY_TOPOLEVO_SHOP;
}

export function isTopolevoWarehouseLocation(location) {
  return location === TOPOLEVO.WAREHOUSE;
}

export function inferTopolevoLocation(...parts) {
  const value = parts
    .flat()
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!/тополево|topolevo/.test(value) && !/\bsto\b/.test(value)) {
    if (/^сто\b/.test(value.trim())) {
      return TOPOLEVO.STO;
    }

    return null;
  }

  if (/сто\b|\bsto\b/.test(value) && !/магазин/.test(value)) {
    return TOPOLEVO.STO;
  }

  if (/склад\s*[-·]?\s*офис|склад офис|офис\s*[-·]?\s*склад/.test(value)) {
    return TOPOLEVO.WAREHOUSE_OFFICE;
  }

  if (/склад|sklad/.test(value)) {
    return TOPOLEVO.WAREHOUSE;
  }

  if (/касса|магазин|озон|стикер|сопровод|продаж/.test(value)) {
    return TOPOLEVO.SHOP;
  }

  if (/бухгалтер|\bофис\b|\bсб\b|админ/.test(value)) {
    return KHABAROVSK_OFFICE;
  }

  return null;
}

export function inferTopolevoLocationFromItem(item) {
  return inferTopolevoLocation(item?.comment, item?.employee, item?.computerName, item?.model);
}

export function migrateTopolevoItemLocation(item) {
  if (item?.city !== 'Хабаровск') {
    return false;
  }

  let changed = false;

  if (item.location === LEGACY_TOPOLEVO_SHOP) {
    item.location = inferTopolevoLocationFromItem(item) || TOPOLEVO.SHOP;
    changed = true;
  }

  if (item.location === LEGACY_TOPOLEVO_OFFICE) {
    item.location = KHABAROVSK_OFFICE;
    changed = true;
  }

  if (item.location === LEGACY_TOPOLEVO_WAREHOUSE_OFFICE) {
    item.location = TOPOLEVO.WAREHOUSE_OFFICE;
    changed = true;
  }

  return changed;
}
