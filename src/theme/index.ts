export const colors = {
  primary: '#2563EB',
  primaryMuted: '#2563EB33',

  background: '#0D0D0D',
  surface: '#1A1A1E',
  surfaceElevated: '#242429',
  border: '#2E2E34',

  text: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textMuted: '#6B6B74',
  textOnPrimary: '#FFFFFF',

  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',

  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayStrong: 'rgba(13, 13, 13, 0.96)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const theme = { colors, spacing, radius, fontSize } as const;
export type Theme = typeof theme;
