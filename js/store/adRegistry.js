import { AD_SYNC_VERSION, bundledAdRegistry } from '../data/adSyncBundle.js';

const STORAGE_KEY = 'itInventoryPracticeAd';

export function loadAdRegistry() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (raw) {
    try {
      const parsed = JSON.parse(raw);

      if (parsed.syncedAt === AD_SYNC_VERSION) {
        return parsed;
      }
    } catch {
      // use bundled data
    }
  }

  const registry = structuredClone(bundledAdRegistry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  return registry;
}

export function getAdRegistry() {
  return loadAdRegistry();
}

export function getAdRegistrySummary(registry) {
  if (!registry) {
    return null;
  }

  const syncedAt = registry.syncedAt
    ? new Date(registry.syncedAt).toLocaleString('ru-RU')
    : 'неизвестно';

  return {
    syncedAt,
    employees: registry.employees?.length || 0,
    computers: registry.computers?.length || 0,
  };
}
