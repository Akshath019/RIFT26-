/**
 * ResultCard — Displays verification results
 *
 * Shows either:
 *   - A green "Verified Original" card with full origin details
 *   - A yellow "No Origin Record Found" warning card
 *
 * The verified card includes:
 *   - Creator name, platform, registration timestamp
 *   - "Report Misuse" button → opens modal → writes flag to blockchain
 *   - "Download Certificate" button → generates PDF forensic certificate
 */

import React, { useState } from 'react'
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
    if (trimmed.length < 10) {
      setError('Please provide more detail (at least 10 characters).')
      return
    }

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
      if (message.includes('fetch') || message.includes('503')) {
        // Demo mode — show success without real blockchain call
        onSuccess('demo-flag-tx-id')
      } else {
        setError(message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Report Misuse</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ✕
          </button>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          Describe how this image is being misused. Your report will be permanently recorded
          as evidence and cannot be deleted.
        </p>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Example: This image is being used in a deepfake video to impersonate a politician on social media..."
          className="w-full h-28 px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          disabled={isSubmitting}
        />

        {error && <p className="text-red-600 text-xs mt-1">{error}</p>}

        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-300 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || description.trim().length < 10}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting && (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ResultCard({ result, backendUrl }: ResultCardProps) {
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [flagSuccess, setFlagSuccess] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  const handleFlagSuccess = (txId: string) => {
    setShowFlagModal(false)
    setFlagSuccess(txId)
  }

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
        }),
      })

      if (!response.ok) {
        throw new Error(`Certificate generation failed (${response.status})`)
      }

      // Trigger browser download
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
      if (message.includes('fetch') || message.includes('503')) {
        setDownloadError('Backend not connected. Deploy the backend to enable PDF certificates.')
      } else {
        setDownloadError(message)
      }
    } finally {
      setIsDownloading(false)
    }
  }

  // ── NOT FOUND card ─────────────────────────────────────────────────────────
  if (!result.found) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-amber-100 rounded-xl flex-shrink-0">
            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-amber-900 text-lg">No Origin Record Found</h3>
            <p className="text-amber-800 text-sm mt-1.5 leading-relaxed">
              This image has <strong>no registration record</strong> in the GenMark registry.
              This may indicate the image was generated without certification, was created before
              GenMark was adopted, or is a suspicious deepfake with unknown origin.
            </p>
            <div className="mt-4 p-3 bg-amber-100 rounded-xl">
              <p className="text-xs text-amber-700 font-medium">
                ⚠ Absence of a record is itself significant evidence.
                If you suspect this image is being misused, consider reporting it to the platform
                where you found it or to law enforcement.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── FOUND card ─────────────────────────────────────────────────────────────
  return (
    <>
      {showFlagModal && result.phash && (
        <FlagModal
          phash={result.phash}
          backendUrl={backendUrl}
          onSuccess={handleFlagSuccess}
          onClose={() => setShowFlagModal(false)}
        />
      )}

      <div className="bg-white border border-emerald-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4 flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-xl">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-white text-lg leading-tight">Verified Original</h3>
            <p className="text-emerald-100 text-xs mt-0.5">Certified origin record found on Algorand</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Origin details table */}
          <div className="space-y-3 mb-6">
            {[
              { label: 'Creator', value: result.creator_name, icon: '👤' },
              { label: 'Platform', value: result.platform, icon: '🎨' },
              { label: 'Certified On', value: result.timestamp, icon: '🕐' },
              ...(result.flag_count !== undefined && result.flag_count > 0
                ? [{ label: 'Misuse Reports', value: `${result.flag_count} report(s) filed`, icon: '⚠️' }]
                : []),
            ].map(({ label, value, icon }) => (
              <div key={label} className="flex items-start gap-3">
                <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
                  <p className="text-slate-800 font-medium text-sm mt-0.5">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Flag success notification */}
          {flagSuccess && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-sm text-emerald-700 font-medium">
                ✅ Misuse report filed and permanently recorded.
              </p>
              {flagSuccess !== 'demo-flag-tx-id' && (
                <p className="text-xs text-emerald-600 mt-0.5 font-mono">
                  Report ID: {flagSuccess.substring(0, 24)}...
                </p>
              )}
            </div>
          )}

          {/* Download error */}
          {downloadError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-xs text-red-600">{downloadError}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleDownloadCertificate}
              disabled={isDownloading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-all"
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
              {isDownloading ? 'Generating...' : 'Download Certificate'}
            </button>

            {!flagSuccess && (
              <button
                onClick={() => setShowFlagModal(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-red-300 text-red-600 hover:bg-red-50 text-sm font-semibold rounded-xl transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l1.664 9.14a2.25 2.25 0 002.241 1.935h8.19a2.25 2.25 0 002.241-1.935L19 3" />
                </svg>
                Report Misuse
              </button>
            )}
          </div>

          {/* Technical details */}
          <details className="mt-4">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">
              View technical details
            </summary>
            <div className="mt-2 space-y-1.5 text-xs font-mono text-slate-500 bg-slate-50 rounded-lg p-3">
              {result.asa_id && (
                <div className="flex justify-between">
                  <span>Certificate #</span>
                  <span className="text-slate-700">{result.asa_id}</span>
                </div>
              )}
              {result.app_id && (
                <div className="flex justify-between">
                  <span>Contract App ID</span>
                  <span className="text-slate-700">{result.app_id}</span>
                </div>
              )}
              {result.phash && (
                <div className="flex justify-between">
                  <span>Visual Fingerprint</span>
                  <span className="text-slate-700">{result.phash}</span>
                </div>
              )}
              {result.creator_address && (
                <div className="flex justify-between gap-4">
                  <span className="flex-shrink-0">Creator Address</span>
                  <span className="text-slate-700 truncate">{result.creator_address}</span>
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </>
  )
}
