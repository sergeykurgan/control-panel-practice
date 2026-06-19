export function groupByCityLocation(items) {
  const groups = new Map();

  items.forEach((item) => {
    const key = `${item.city}|||${item.location}`;

    if (!groups.has(key)) {
      groups.set(key, {
        city: item.city,
        location: item.location,
        items: [],
      });
    }

    groups.get(key).items.push(item);
  });

  return [...groups.values()].sort((a, b) => {
    const cityCompare = a.city.localeCompare(b.city, 'ru');
    return cityCompare !== 0 ? cityCompare : a.location.localeCompare(b.location, 'ru');
  });
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
