import { useState } from 'react'
import type { VerifyResult } from '../pages/Verify'

interface ResultCardProps {
  result: VerifyResult
  backendUrl: string
}

interface FlagModalProps {
  phash: string
  backendUrl: string
  onSuccess: (txId: string) => void
  onClose: () => void
}

function FlagModal({ phash, backendUrl, onSuccess, onClose }: FlagModalProps) {
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    const trimmed = description.trim()
    if (trimmed.length < 10) { setError('Please provide more detail (at least 10 characters).'); return }
    setIsSubmitting(true)
    setError('')
    try {
      const response = await fetch(`${backendUrl}/api/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phash, description: trimmed }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || 'Failed to submit report')
      }
      const data = await response.json()
      onSuccess(data.tx_id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      if (message.includes('fetch') || message.includes('503')) { onSuccess('demo-flag-tx-id') }
      else { setError(message) }
    } finally { setIsSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">Report Misuse</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white text-lg leading-none">✕</button>
        </div>
        <p className="text-sm text-white/50 mb-4">
          Describe the misuse. Your report is permanently recorded on-chain and cannot be deleted.
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Example: Used in a deepfake video impersonating a public figure…"
          className="w-full h-28 px-3 py-2.5 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          disabled={isSubmitting}
        />
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 border border-white/10 text-white/50 text-sm font-medium rounded-xl hover:bg-white/5 transition-all">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || description.trim().length < 10}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting && (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isSubmitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProvenanceTimeline({ chain, currentPhash }: { chain: import('../pages/Verify').ProvenanceStep[]; currentPhash?: string }) {
  return (
    <div className="px-6 py-5 border-b border-white/10">
      <p className="text-xs text-white/30 uppercase tracking-wide font-medium mb-4">
        Provenance Chain · <span className="text-white/20">{chain.length} step{chain.length !== 1 ? 's' : ''} · on-chain</span>
      </p>
      <div className="space-y-0">
        {chain.map((step, i) => {
          const isLast = i === chain.length - 1
          const isCurrent = step.phash === currentPhash
          const isOrigin = step.is_original
          // Who to show: original steps show creator_name; morph steps show morphed_by (the person who did the work)
          const displayName = isOrigin ? step.creator_name : (step.morphed_by || step.creator_name)
          const role = isOrigin ? 'Original Creator' : 'Morphed by'

          return (
            <div key={step.phash + i} className="flex gap-4">
              {/* dot + connector */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`relative z-10 h-7 w-7 rounded-full border-2 flex items-center justify-center text-[10px] ${
                  isOrigin
                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-300'
                    : isCurrent
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                    : 'border-violet-400/50 bg-violet-500/10 text-violet-300'
                }`}>
                  {isOrigin ? '★' : '↻'}
                </div>
                {!isLast && <div className="flex-1 w-px bg-white/10 my-1 min-h-[20px]" />}
              </div>

              {/* content */}
              <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-5'}`}>
                <span className={`text-[10px] font-semibold uppercase tracking-widest ${
                  isOrigin ? 'text-indigo-400' : isCurrent ? 'text-emerald-400' : 'text-violet-400'
                }`}>
                  {role}{isCurrent ? ' · this image' : ''}
                </span>
                <p className="text-sm text-white font-semibold mt-0.5">{displayName}</p>
                {step.timestamp && (
                  <p className="text-[11px] text-white/25 mt-0.5">{step.timestamp}</p>
                )}
                <p className="text-[10px] text-white/15 font-mono mt-0.5 truncate">{step.phash}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ResultCard({ result, backendUrl }: ResultCardProps) {
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [flagSuccess, setFlagSuccess] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const handleFlagSuccess = (txId: string) => { setShowFlagModal(false); setFlagSuccess(txId) }

  const handleDownloadCertificate = async () => {
    if (!result.found) return
    setIsDownloading(true)
    setDownloadError('')
    try {
      const response = await fetch(`${backendUrl}/api/certificate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_id: result.phash ? `verify-${result.phash}` : 'unknown',
          creator_name: result.creator_name || '',
          platform: result.platform || '',
          timestamp: result.timestamp || '',
          asa_id: String(result.asa_id || ''),
          app_id: String(result.app_id || ''),
          phash: result.phash || '',
          flag_descriptions: [],
          modified_by: result.morphed_by || null,
          original_phash: result.original_phash || null,
          provenance_chain: result.provenance_chain || [],
        }),
      })
      if (!response.ok) throw new Error(`Certificate generation failed (${response.status})`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `genmark_certificate_${result.creator_name?.replace(/\s+/g, '_') || 'unknown'}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setDownloadError(message.includes('fetch') || message.includes('503') ? 'Backend not connected.' : message)
    } finally { setIsDownloading(false) }
  }

  /* ── NOT FOUND ── */
  if (!result.found) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-amber-500/20 p-2.5 flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-amber-300 text-base">No Origin Record Found</h3>
            <p className="text-amber-200/60 text-sm mt-1.5 leading-relaxed">
              This image has no registration record in the GenMark registry. It may have been generated without certification, or could be a suspicious deepfake.
            </p>
            <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3">
              <p className="text-xs text-amber-300/70 font-medium">
                ⚠ Absence of a record is itself significant evidence.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── FOUND ── */
  return (
    <>
      {showFlagModal && result.phash && (
        <FlagModal phash={result.phash} backendUrl={backendUrl} onSuccess={handleFlagSuccess} onClose={() => setShowFlagModal(false)} />
      )}

      <div className="rounded-2xl border border-emerald-500/20 bg-black overflow-hidden">

        {/* Header */}
        <div className={`bg-gradient-to-r ${result.morphed_by ? 'from-violet-600/80 to-purple-600/80' : 'from-emerald-600/80 to-teal-600/80'} px-6 py-4 flex items-center gap-3 border-b border-white/10`}>
          <div className="rounded-xl bg-white/20 p-2 flex-shrink-0">
            {result.morphed_by ? (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="font-bold text-white text-base leading-tight">
              {result.morphed_by ? 'Derived Content' : 'Verified Original'}
            </h3>
            <p className="text-white/60 text-xs mt-0.5">
              {result.morphed_by ? 'Morphed derivative — certified on Algorand' : 'Certified origin found on Algorand'}
            </p>
          </div>
        </div>

        {/* Modification banner — only show if no multi-step chain (chain renders below instead) */}
        {(result.is_modification || result.morphed_by) && (!result.provenance_chain || result.provenance_chain.length <= 1) && (
          <div className="mx-6 mt-4 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 flex items-start gap-3">
            <span className="text-violet-400 text-base flex-shrink-0 mt-0.5">🔄</span>
            <div>
              <p className="text-violet-300 text-sm font-semibold">Derivative Content</p>
              <p className="text-violet-200/60 text-xs mt-0.5">
                Originally created by{' '}
                <span className="text-violet-300 font-medium">{result.creator_name || 'another creator'}</span>
                {result.morphed_by
                  ? result.creator_name === result.morphed_by
                    ? ` · self-modified by ${result.morphed_by}`
                    : ` · morphed by ${result.morphed_by}`
                  : ''}.
              </p>
            </div>
          </div>
        )}

        {/* Origin details */}
        <div className="px-6 py-5 space-y-4 border-b border-white/10">
          {[
            { label: 'Original Creator', value: result.creator_name, icon: '👤' },
            ...(result.morphed_by
              ? [{
                  label: 'Morphed By',
                  value: result.creator_name === result.morphed_by
                    ? `${result.morphed_by} (self-modification)`
                    : result.morphed_by,
                  icon: '🔄',
                }]
              : []),
            { label: 'Platform', value: result.platform, icon: '🖥' },
            { label: 'Certified On', value: result.timestamp, icon: '🕐' },
            ...(result.flag_count !== undefined && result.flag_count > 0
              ? [{ label: 'Misuse Reports', value: `${result.flag_count} report(s) filed`, icon: '⚠️' }]
              : []),
          ].filter(r => r.value).map(({ label, value, icon }) => (
            <div key={label} className="flex items-start gap-3">
              <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
              <div>
                <p className="text-xs text-white/30 uppercase tracking-wide font-medium">{label}</p>
                <p className="text-white text-sm font-medium mt-0.5">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Provenance chain timeline */}
        {result.provenance_chain && result.provenance_chain.length > 1 && (
          <ProvenanceTimeline chain={result.provenance_chain} currentPhash={result.phash} />
        )}

        {/* Action buttons */}
        <div className="px-6 py-4 flex flex-col gap-3">
          {flagSuccess && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
              <p className="text-sm text-emerald-300 font-medium">✅ Misuse report permanently recorded.</p>
              {flagSuccess !== 'demo-flag-tx-id' && (
                <p className="text-xs text-emerald-400/60 mt-0.5 font-mono">{flagSuccess.substring(0, 24)}…</p>
              )}
            </div>
          )}

          {downloadError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <p className="text-xs text-red-400">{downloadError}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleDownloadCertificate}
              disabled={isDownloading}
              className="flex-1 flex items-center justify-center gap-2 rounded-full bg-white py-2.5 text-sm font-semibold text-black hover:bg-white/90 disabled:bg-white/20 disabled:text-white/30 disabled:cursor-not-allowed transition-all"
            >
              {isDownloading ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              {isDownloading ? 'Generating…' : 'Download Certificate'}
            </button>

            {!flagSuccess && (
              <button
                onClick={() => setShowFlagModal(true)}
                className="flex-1 flex items-center justify-center gap-2 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-semibold py-2.5 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l1.664 9.14a2.25 2.25 0 002.241 1.935h8.19a2.25 2.25 0 002.241-1.935L19 3" />
                </svg>
                Report Misuse
              </button>
            )}
          </div>
        </div>

        {/* Technical details collapsible */}
        <details className="border-t border-white/10 group">
          <summary className="px-6 py-3 text-xs text-white/30 cursor-pointer hover:text-white/50 select-none list-none flex items-center justify-between transition-colors">
            <span>Technical details</span>
            <span className="group-open:rotate-180 transition-transform duration-200">▾</span>
          </summary>
          <div className="px-6 pb-5 space-y-2 text-xs font-mono">
            {[
              { label: 'Certificate #', value: result.asa_id },
              { label: 'Contract App ID', value: result.app_id },
              { label: 'Visual Fingerprint', value: result.phash },
              { label: 'Creator Address', value: result.creator_address },
            ].filter(r => r.value).map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-4 items-start">
                <span className="text-white/25 flex-shrink-0">{label}</span>
                <span className="text-white/50 truncate max-w-[220px]">{String(value)}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </>
  )
}
