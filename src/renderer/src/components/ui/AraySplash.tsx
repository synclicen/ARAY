import { ArayLogo } from './ArayLogo'

interface AraySplashProps {
  message?: string
}

export function AraySplash({ message = 'Loading your moment...' }: AraySplashProps) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-purple-haze-900 via-surface-base to-purple-haze-950">
      <div className="absolute inset-0 opacity-30 pointer-events-none"
           style={{
             backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(123,97,168,0.35) 0%, transparent 45%), radial-gradient(circle at 70% 80%, rgba(212,175,55,0.18) 0%, transparent 40%)'
           }}
      />
      <div className="relative z-10">
        <ArayLogo size="xl" animated showTagline />
      </div>
      <div className="mt-12 flex items-center gap-3 text-silver-300/80">
        <div className="w-2 h-2 rounded-full bg-purple-haze-400 animate-pulse" />
        <span className="text-sm font-medium tracking-wide">{message}</span>
      </div>
    </div>
  )
}
