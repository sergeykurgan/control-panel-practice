export function formatDate(isoDate) {
  if (!isoDate) {
    return '—';
  }

  const date = new Date(`${isoDate}T00:00:00`);

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function daysUntil(isoDate) {
  if (!isoDate) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(`${isoDate}T00:00:00`);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

export const EXPIRY_WARN_DAYS = 30;
export const EXPIRY_CRITICAL_DAYS = 15;

export function expiryStatus(isoDate) {
  const days = daysUntil(isoDate);

  if (days === null) {
    return 'neutral';
  }

  if (days < 0) {
    return 'expired';
  }

  if (days < EXPIRY_CRITICAL_DAYS) {
    return 'critical';
  }

  if (days <= EXPIRY_WARN_DAYS) {
    return 'warning';
  }

  return 'ok';
}

export function isExpiryAttention(status) {
  return status === 'expired' || status === 'critical' || status === 'warning';
}

export function expiryLabel(isoDate) {
  const status = expiryStatus(isoDate);

  if (status === 'expired') {
    return 'Истёк';
  }

  if (status === 'critical') {
    return 'Срочно';
  }

  if (status === 'warning') {
    return 'Скоро';
  }

  return 'OK';
}

export function formatEmpty(value) {
  const text = String(value ?? '').trim();

  if (!text || text === '—' || text === '— уточнить') {
    return '—';
  }

  return text;
}

export function clearSentinel(value) {
  const text = String(value ?? '').trim();

  if (!text || text === '—' || text === '— уточнить') {
    return '';
  }

  return text;
}

export function daysUntilLabel(isoDate) {
  const days = daysUntil(isoDate);

  if (days === null) {
    return 'Дата не указана';
  }

  if (days < 0) {
    const overdue = Math.abs(days);
    return overdue === 1 ? 'Просрочен на 1 день' : `Просрочен на ${overdue} дн.`;
  }

  if (days === 0) {
    return 'Истекает сегодня';
  }

  if (days === 1) {
    return 'Завтра';
  }

  return `Через ${days} дн.`;
}
