interface ArayProgressProps {
  value: number
  max?: number
  variant?: 'purple' | 'gold' | 'silver'
  className?: string
  showLabel?: boolean
}

const colorMap = {
  purple: 'from-purple-haze-500 to-purple-haze-300',
  gold: 'from-gold-500 to-gold-300',
  silver: 'from-silver-400 to-silver-200'
}

export function ArayProgress({
  value,
  max = 100,
  variant = 'purple',
  className = '',
  showLabel = false
}: ArayProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className={`w-full ${className}`}>
      <div className="h-2 rounded-full bg-silver-900/60 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${colorMap[variant]} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <div className="text-xs text-silver-400 mt-1.5">{pct.toFixed(0)}%</div>
      )}
    </div>
  )
}
