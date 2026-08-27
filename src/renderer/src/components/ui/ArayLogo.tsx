import { motion } from 'framer-motion'
import { arayLogoStyle } from '../../brand/typography'

interface ArayLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showTagline?: boolean
  animated?: boolean
  className?: string
}

const sizeMap = {
  sm: { logo: 'text-2xl', tagline: 'text-xs' },
  md: { logo: 'text-4xl', tagline: 'text-sm' },
  lg: { logo: 'text-6xl', tagline: 'text-base' },
  xl: { logo: 'text-8xl', tagline: 'text-lg' }
}

export function ArayLogo({
  size = 'md',
  showTagline = true,
  animated = false,
  className = ''
}: ArayLogoProps) {
  const s = sizeMap[size]
  const Logo = (
    <div className={`flex flex-col items-center ${className}`}>
      <div
        className={`aray-gradient-text font-extrabold tracking-tighter ${s.logo}`}
        style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
      >
        ARAY
      </div>
      {showTagline && (
        <div className={`text-silver-300/80 font-medium tracking-wide mt-1 ${s.tagline}`}>
          Are you Ready? and....Yapping!
        </div>
      )}
    </div>
  )

  if (!animated) return Logo

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {Logo}
    </motion.div>
  )
}
