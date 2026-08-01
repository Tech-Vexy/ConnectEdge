// ConnectEdge v2 theme — Tinder-inspired, dark base, warm coral accent
// Cards are the primary canvas. Typography is confident. Gestures are physical.

export const colors = {
  // Base
  bg:          '#0F0F0F',
  surface:     '#1A1A1A',
  surfaceHigh: '#242424',
  border:      '#2E2E2E',
  borderHigh:  '#3D3D3D',

  // Text
  textPrimary:   '#FFFFFF',
  textSecondary: '#ABABAB',
  textMuted:     '#606060',
  textOnDark:    '#FFFFFF',

  // Brand — warm gradient pair
  gradientA:  '#FF4458',   // Tinder red-pink
  gradientB:  '#FF7854',   // warm orange
  pulse:      '#FF4458',   // primary action
  pulseLight: '#2D0A10',
  pulseMid:   '#8B2030',

  // Like / pass / super
  like:       '#4CD964',   // green — iOS system green
  pass:       '#FF3B30',   // red
  superLike:  '#007AFF',   // blue

  // Match celebration
  matchGold:  '#FFD700',

  // Signal (kept for internal scoring display)
  signalStrong: '#4ECBA0',
  signalMid:    '#3A9078',
  signalFaint:  '#1D4A3C',

  // Status
  success: '#4CD964',
  warning: '#FF9500',
  danger:  '#FF3B30',

  // Overlays
  overlay:       'rgba(0,0,0,0.55)',
  overlayStrong: 'rgba(0,0,0,0.80)',
  overlayCard:   'rgba(0,0,0,0.0)',

  // Semi-transparent variants (replaces fragile hex+alpha concatenation)
  pulseAlpha10:  'rgba(255,68,88,0.06)',
  pulseAlpha18:  'rgba(255,68,88,0.10)',
  pulseAlpha14:  'rgba(255,68,88,0.08)',
  pulseAlpha44:  'rgba(255,68,88,0.27)',
  likeAlpha18:   'rgba(77,217,100,0.10)',
  likeAlpha22:   'rgba(77,217,100,0.13)',
  likeAlpha55:   'rgba(77,217,100,0.33)',
  passAlpha18:   'rgba(255,59,48,0.10)',
  passAlpha44:   'rgba(255,59,48,0.27)',
} as const

export const typography = {
  display: {
    fontFamily:  'System',
    fontWeight:  '700' as const,
    letterSpacing: -0.5,
  },
  heading: {
    fontFamily:  'System',
    fontWeight:  '600' as const,
    letterSpacing: -0.3,
  },
  body: {
    fontFamily:  'System',
    fontWeight:  '400' as const,
    letterSpacing: 0,
  },
  label: {
    fontFamily:  'System',
    fontWeight:  '600' as const,
    letterSpacing: 0.2,
  },
  mono: {
    fontFamily:  'Courier New',
    fontWeight:  '400' as const,
    letterSpacing: 0.5,
  },
} as const

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const

export const radius = {
  sm:   8,
  md:   16,
  lg:   24,
  card: 20,
  full: 9999,
} as const

export const fontSizes = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   18,
  xl:   24,
  xxl:  32,
  hero: 44,
} as const

// Card shadow (cross-platform)
export const cardShadow = {
  shadowColor:   '#000',
  shadowOffset:  { width: 0, height: 8 },
  shadowOpacity: 0.35,
  shadowRadius:  16,
  elevation:     12,
}

// Gradient pairs used throughout
export const gradients = {
  brand:   ['#FF4458', '#FF7854'] as const,
  like:    ['#4CD964', '#34C759'] as const,
  pass:    ['#FF3B30', '#FF6B6B'] as const,
  super:   ['#007AFF', '#5AC8FA'] as const,
  card:    ['transparent', 'rgba(0,0,0,0.85)'] as const,
  match:   ['#FFD700', '#FF4458'] as const,
}
