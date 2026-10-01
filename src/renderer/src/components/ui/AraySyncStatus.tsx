import { HTMLAttributes } from 'react'
import { Check, Cloud, CloudOff, RefreshCw, AlertCircle, Clock } from 'lucide-react'
import type { SyncStatus } from '@shared/types'

interface AraySyncStatusProps extends HTMLAttributes<HTMLDivElement> {
  status: SyncStatus
  compact?: boolean
}

const statusMap: Record<
  SyncStatus,
  { label: string; icon: React.ReactNode; variant: string }
> = {
  LOCAL_ONLY: {
    label: 'Local only',
    icon: <Check className="w-3 h-3" />,
    variant: 'bg-silver-200/10 text-silver-200 border border-silver-300/20'
  },
  PENDING: {
    label: 'Pending',
    icon: <Clock className="w-3 h-3" />,
    variant: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30'
  },
  UPLOADING: {
    label: 'Uploading...',
    icon: <RefreshCw className="w-3 h-3 animate-spin" />,
    variant: 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
  },
  SYNCED: {
    label: 'Synced',
    icon: <Cloud className="w-3 h-3" />,
    variant: 'bg-green-500/15 text-green-300 border border-green-500/30'
  },
  FAILED: {
    label: 'Failed',
    icon: <AlertCircle className="w-3 h-3" />,
    variant: 'bg-red-500/15 text-red-300 border border-red-500/30'
  },
  RETRYING: {
    label: 'Retrying',
    icon: <RefreshCw className="w-3 h-3 animate-spin" />,
    variant: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30'
  },
  OFFLINE: {
    label: 'Offline',
    icon: <CloudOff className="w-3 h-3" />,
    variant: 'bg-silver-200/10 text-silver-300 border border-silver-300/20'
  }
}

export function AraySyncStatus({ status, compact = false, className = '', ...rest }: AraySyncStatusProps) {
  const s = statusMap[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.variant} ${className}`}
      {...rest}
    >
      {s.icon}
      {!compact && <span>{s.label}</span>}
    </span>
  )
}
