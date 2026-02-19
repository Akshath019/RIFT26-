/**
 * GenMark — Verify Page
 * ======================
 * The "public verification portal" page.
 *
 * UX flow:
 *   1. User drags or uploads any image (from anywhere on the internet)
 *   2. Backend computes the perceptual hash and queries the blockchain
 *   3A. If FOUND → green card shows creator, platform, and exact timestamp
 *       User can: Download Certificate (PDF) or Report Misuse
 *   3B. If NOT FOUND → yellow card warns "No Origin Record Found"
 *       This itself is evidence of suspicious content
 *
 * Anyone can use this portal — no account, no wallet, no fees.
 */

import React, { useCallback, useRef, useState } from 'react'
import DropZone from '../components/DropZone'
import ResultCard from '../components/ResultCard'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

type VerifyStatus = 'idle' | 'verifying' | 'found' | 'not_found' | 'error'

export interface VerifyResult {
  found: boolean
  creator_name?: string
  creator_address?: string
  platform?: string
  timestamp?: string
  timestamp_unix?: number
  asa_id?: number
  flag_count?: number
  phash?: string
  app_id?: number
}

export default function Verify() {
  const [status, setStatus] = useState<VerifyStatus>('idle')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [fileName, setFileName] = useState('')

  // Verify the image by sending it to the backend
  const handleImageSelected = useCallback(async (file: File) => {
    setFileName(file.name)
    setStatus('verifying')
    setResult(null)
    setErrorMsg('')

    // Create a preview URL for display
    const preview = URL.createObjectURL(file)
    setPreviewUrl(preview)

    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await fetch(`${BACKEND_URL}/api/verify`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `Verification failed (${response.status})`)
      }

      const data: VerifyResult = await response.json()
      setResult(data)
      setStatus(data.found ? 'found' : 'not_found')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'

      // Demo mode: backend not available
      if (message.includes('fetch') || message.includes('503') || message.includes('not configured')) {
        // Show a mock "not found" result for demo purposes
        setResult({ found: false })
        setStatus('not_found')
        return
      }

      setStatus('error')
      setErrorMsg(message)
    }
  }, [])

  const handleReset = useCallback(() => {
    setStatus('idle')
    setResult(null)
    setErrorMsg('')
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    setFileName('')
  }, [previewUrl])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Navigation */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/generate" className="flex items-center gap-2 text-slate-800 font-bold text-lg">
            <span className="text-2xl">🛡</span>
            <span>GenMark</span>
          </a>
          <div className="flex items-center gap-6">
            <a
              href="/generate"
              className="text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors"
            >
              Create
            </a>
            <a
              href="/verify"
              className="text-indigo-600 border-b-2 border-indigo-500 text-sm font-medium pb-0.5"
            >
              Verify
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-medium px-4 py-1.5 rounded-full mb-4">
            <span>🔍</span> Public Verification Portal
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
            Verify Image Origin
          </h1>
          <p className="text-slate-500 text-lg max-w-lg mx-auto">
            Upload any image to check if it has a verified origin record.
            Works even on edited, resized, or re-saved versions.
          </p>
        </div>

        {/* Main verification area */}
        {status === 'idle' && (
          <DropZone onImageSelected={handleImageSelected} />
        )}

        {/* Verifying state */}
        {status === 'verifying' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
            <div className="flex items-center justify-center mb-4">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Checking"
                  className="w-24 h-24 rounded-xl object-cover opacity-60"
                />
              )}
            </div>
            <div className="flex items-center justify-center gap-3 mb-2">
              <svg className="animate-spin h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-slate-700 font-medium">Checking origin records...</span>
            </div>
            <p className="text-sm text-slate-400">
              Computing visual fingerprint and querying the registry
            </p>
          </div>
        )}

        {/* Result */}
        {(status === 'found' || status === 'not_found') && result && (
          <div className="space-y-4">
            {/* Image preview */}
            {previewUrl && (
              <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <img
                  src={previewUrl}
                  alt="Verified image"
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 font-medium truncate">{fileName}</p>
                  <p className="text-xs text-slate-400">Uploaded for verification</p>
                </div>
                <button
                  onClick={handleReset}
                  className="ml-auto text-slate-400 hover:text-slate-600 text-sm flex-shrink-0"
                >
                  ✕ Clear
                </button>
              </div>
            )}

            {/* Result card */}
            <ResultCard result={result} backendUrl={BACKEND_URL} />

            {/* Verify another */}
            <div className="text-center pt-2">
              <button
                onClick={handleReset}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium underline underline-offset-2"
              >
                Verify a different image
              </button>
            </div>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="font-semibold text-red-700 mb-1">Verification Failed</h3>
                <p className="text-sm text-slate-600">{errorMsg}</p>
                <button
                  onClick={handleReset}
                  className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium underline"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* How it works — shown in idle state below the dropzone */}
        {status === 'idle' && (
          <div className="mt-10">
            <h2 className="text-center text-lg font-semibold text-slate-700 mb-5">
              How Verification Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  icon: '📸',
                  title: 'Upload Any Version',
                  desc: 'Our verification works even on resized, compressed, or cropped versions of the original.',
                },
                {
                  icon: '🔎',
                  title: 'Fingerprint Matching',
                  desc: "We compute a visual fingerprint of your image and look it up in the permanent registry.",
                },
                {
                  icon: '📋',
                  title: 'Instant Origin Report',
                  desc: "Get the creator's name, the platform, and the exact moment the image was certified.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"
                >
                  <div className="text-2xl mb-3">{item.icon}</div>
                  <h3 className="font-semibold text-slate-800 mb-1 text-sm">{item.title}</h3>
                  <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
