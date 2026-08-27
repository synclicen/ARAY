import { HTMLAttributes } from 'react'

type BadgeVariant = 'purple' | 'gold' | 'silver' | 'success' | 'warning' | 'danger' | 'info'

interface ArayBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantClass: Record<BadgeVariant, string> = {
  purple: 'bg-purple-haze-500/20 text-purple-haze-200 border border-purple-haze-500/30',
  gold: 'bg-gold-400/15 text-gold-300 border border-gold-400/30',
  silver: 'bg-silver-200/10 text-silver-200 border border-silver-300/20',
  success: 'bg-green-500/15 text-green-300 border border-green-500/30',
  warning: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30',
  danger: 'bg-red-500/15 text-red-300 border border-red-500/30',
  info: 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
}

export function ArayBadge({ variant = 'silver', className = '', children, ...rest }: ArayBadgeProps) {
  return (
    <span className={`aray-badge ${variantClass[variant]} ${className}`} {...rest}>
      {children}
    </span>
  )
}
