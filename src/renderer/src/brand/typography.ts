/**
 * ARAY Typography System
 * Inter as primary typeface — modern, premium, neutral.
 */
export const arayTypography = {
  fontFamily: {
    sans: '"Inter", system-ui, -apple-system, sans-serif',
    display: '"Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace'
  },
  sizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    '5xl': '3rem',
    '6xl': '4rem',
    '7xl': '5rem'
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800
  },
  letterSpacing: {
    tight: '-0.02em',
    normal: '0',
    wide: '0.05em',
    wider: '0.1em',
    widest: '0.2em'
  }
} as const

export const arayLogoStyle = {
  fontFamily: '"Inter", system-ui, sans-serif',
  fontWeight: 800,
  letterSpacing: '-0.04em',
  background: 'linear-gradient(135deg, #CDB8E4 0%, #D4AF37 50%, #C0C0C8 100%)',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent'
} as const
