import i18n from '@src/i18n';

const locale = (): string => i18n.language || 'pt-BR';

export function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString(locale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeWithSeconds(value: number): string {
  return new Date(value).toLocaleTimeString(locale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDateTime(value: number): string {
  return new Date(value).toLocaleString(locale(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDistance(meters: number | null): string {
  if (meters === null) return '—';
  return meters < 1_000 ? `${Math.round(meters)} m` : `${(meters / 1_000).toFixed(1)} km`;
}
