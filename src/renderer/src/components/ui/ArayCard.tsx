import { HTMLAttributes, forwardRef } from 'react'

interface ArayCardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  glow?: boolean
}

export const ArayCard = forwardRef<HTMLDivElement, ArayCardProps>(
  ({ hover = false, glow = false, className = '', children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={`aray-card p-5 transition-all ${hover ? 'hover:border-purple-haze-400/40 hover:shadow-glow-purple cursor-pointer' : ''} ${glow ? 'shadow-glow-purple' : ''} ${className}`}
        {...rest}
      >
        {children}
      </div>
    )
  }
)

ArayCard.displayName = 'ArayCard'
