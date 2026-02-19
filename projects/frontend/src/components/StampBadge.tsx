/**
 * StampBadge — "Content Stamped ✓" overlay badge
 *
 * Displayed as a small overlay on generated images to indicate
 * they have been certified. No blockchain terminology — just a trust badge.
 *
 * Variants:
 *   - Real: Green badge, shown when actual blockchain registration succeeds
 *   - Demo: Blue badge, shown when backend is not connected (demo/preview mode)
 */

import React, { useState } from 'react'

interface StampBadgeProps {
  isDemo?: boolean
  txId?: string
  asaId?: number
}

export default function StampBadge({ isDemo = false, txId, asaId }: StampBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold
          shadow-lg backdrop-blur-sm border transition-all
          ${
            isDemo
              ? 'bg-blue-600/90 border-blue-400/50 text-white'
              : 'bg-emerald-500/90 border-emerald-400/50 text-white'
          }
        `}
        aria-label="Content certification status"
      >
        {isDemo ? '🔷' : '✓'}
        <span>{isDemo ? 'Demo' : 'Certified'}</span>
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute top-full right-0 mt-1.5 z-10 pointer-events-none">
          <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
            {isDemo ? (
              <p>Demo mode — connect backend for real certification</p>
            ) : (
              <div className="space-y-0.5">
                <p className="font-semibold text-emerald-400">Origin Certified ✓</p>
                {asaId ? <p>Certificate #{asaId}</p> : null}
                {txId && txId !== 'existing' ? (
                  <p className="font-mono text-slate-400">
                    {txId.substring(0, 12)}...
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
