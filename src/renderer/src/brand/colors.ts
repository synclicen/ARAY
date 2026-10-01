/**
 * ARAY BRAND DESIGN SYSTEM
 * Purple Haze × Gold × Silver
 * "Are you Ready? and....Yapping!"
 */

export const arayColors = {
  purpleHaze: {
    50: '#F4F0FA',
    100: '#E6DCF2',
    200: '#CDB8E4',
    300: '#B493D6',
    400: '#9B6FC8',
    500: '#7B61A8',
    600: '#654E8E',
    700: '#4F3C74',
    800: '#392B5A',
    900: '#241A40',
    950: '#120D24'
  },
  gold: {
    50: '#FBF6E6',
    100: '#F6ECC2',
    200: '#EDD985',
    300: '#E4C647',
    400: '#D4AF37',
    500: '#B8932B',
    600: '#8C701F',
    700: '#5F4C14',
    800: '#322808',
    900: '#1A1404'
  },
  silver: {
    50: '#F8F8FA',
    100: '#EDEDF1',
    200: '#DCDCE3',
    300: '#C0C0C8',
    400: '#A8A8B2',
    500: '#909099',
    600: '#74747C',
    700: '#56565C',
    800: '#38383C',
    900: '#1E1E22'
  },
  surface: {
    base: '#0F0B1A',
    raised: '#1A1330',
    elevated: '#241A40',
    overlay: '#2E2150'
  },
  status: {
    success: '#5FCF80',
    warning: '#E4C647',
    danger: '#E45A5A',
    info: '#7B61A8'
  }
} as const

export const arayBrand = {
  name: 'ARAY',
  tagline: 'Are you Ready? and....Yapping!',
  shortTagline: "Let's yap!",
  motto: 'Yap. Snap. Repeat.',
  primaryColor: arayColors.purpleHaze[500],
  accentColor: arayColors.gold[400],
  secondaryColor: arayColors.silver[300]
} as const

export const arayMicrocopy = [
  'Are you ready?',
  "Let's yap!",
  'Ready? Smile!',
  'Your moment is loading...',
  'Say cheese!',
  'That was cute.',
  'One more?',
  'Your memories are ready.',
  'Yap. Snap. Repeat.',
  'Strike a pose.',
  "Don't blink.",
  'Memory unlocked.',
  'Your yap is safe.',
  'Look at you!'
] as const

export const arayColorBalance = {
  purpleHaze: '60%',
  silver: '25%',
  gold: '15%'
} as const

export type ArayColorTokens = typeof arayColors
export type ArayBrand = typeof arayBrand
