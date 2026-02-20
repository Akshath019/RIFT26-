import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import ResultCard from '../components/ResultCard'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
const PILLARS = [92, 84, 78, 70, 62, 54, 46, 34, 18, 34, 46, 54, 62, 70, 78, 84, 92]

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
  const { user, logout } = useAuth()
  const [isMounted, setIsMounted] = useState(false)
  const [status, setStatus] = useState<VerifyStatus>('idle')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setIsMounted(true), 100)
    return () => clearTimeout(t)
  }, [])

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setFileName(file.name)
    setStatus('verifying')
    setResult(null)
    setErrorMsg('')
    const preview = URL.createObjectURL(file)
    setPreviewUrl(preview)

    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await fetch(`${BACKEND_URL}/api/verify`, { method: 'POST', body: formData })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `Verification failed (${response.status})`)
      }
      const data: VerifyResult = await response.json()
      setResult(data)
      setStatus(data.found ? 'found' : 'not_found')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      if (message.includes('fetch') || message.includes('503') || message.includes('not configured')) {
        setResult({ found: false })
        setStatus('not_found')
        return
      }
      setStatus('error')
      setErrorMsg(message)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const handleReset = useCallback(() => {
    setStatus('idle')
    setResult(null)
    setErrorMsg('')
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
    setFileName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [previewUrl])

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-up { animation: fadeInUp 0.7s ease-out forwards; }
      `}</style>

      <div className="relative min-h-screen overflow-x-hidden bg-black text-white">

        {/* ── Background ── */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-30" style={{
          backgroundImage: [
            'radial-gradient(80% 55% at 50% 52%, rgba(88,112,255,0.25) 0%, rgba(60,40,120,0.35) 35%, rgba(20,20,40,0.5) 60%, rgba(0,0,0,1) 85%)',
            'radial-gradient(70% 50% at 86% 22%, rgba(88,112,255,0.30) 0%, transparent 55%)',
            'radial-gradient(60% 40% at 10% 80%, rgba(214,76,82,0.15) 0%, transparent 55%)',
          ].join(','),
          backgroundColor: '#000',
        }} />
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 mix-blend-screen opacity-20" style={{
          backgroundImage: [
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 96px)',
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 24px)',
          ].join(','),
        }} />

        {/* ── Nav ── */}
        <header className="relative z-20 border-b border-white/10 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 md:px-8">
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-5 rounded-full bg-white" />
              <span className="text-base font-semibold tracking-tight">GenMark</span>
            </div>
            <nav className="flex items-center gap-5 text-sm text-white/70">
              <a href="/generate" className="hover:text-white transition-colors">Create</a>
              <a href="/verify" className="text-white border-b border-white/60 pb-0.5">Verify</a>
              {user && (
                <div className="flex items-center gap-3 pl-2 border-l border-white/10">
                  <span className="text-white/50 text-xs">{user.name}</span>
                  <button onClick={logout} className="text-xs text-white/30 hover:text-white/70 transition-colors">Log out</button>
                </div>
              )}
            </nav>
          </div>
        </header>

        <div className="relative z-10 mx-auto w-full max-w-2xl px-6 pt-16 pb-24">

          {/* ── Header ── */}
          <div className={`text-center mb-10 ${isMounted ? 'fade-up' : 'opacity-0'}`}>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wider text-white/60 ring-1 ring-white/10 mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              Public Verification Portal
            </span>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              Verify Image
              <span className="text-indigo-300"> Origin</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-white/50 md:text-base">
              Upload any image to check if it has a certified origin record — works even on resized or re-saved versions.
            </p>
          </div>

          {/* ── Drop zone ── */}
          {status === 'idle' && (
            <div
              className={`fade-up rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer
                ${isDragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/8'}
              `}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
              <div className="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center select-none">
                <div className={`rounded-full p-4 ${isDragging ? 'bg-indigo-500/20' : 'bg-white/10'}`}>
                  <svg className="h-8 w-8 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-medium">Drop your image here</p>
                  <p className="text-white/40 text-sm mt-1">or click to browse — PNG, JPG, WebP</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Verifying ── */}
          {status === 'verifying' && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
              {previewUrl && (
                <img src={previewUrl} alt="Checking" className="w-20 h-20 rounded-xl object-cover mx-auto mb-5 opacity-50" />
              )}
              <svg className="animate-spin h-8 w-8 text-indigo-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-white font-medium">Checking origin records…</p>
              <p className="text-white/40 text-sm mt-1">Computing fingerprint and querying blockchain</p>
            </div>
          )}

          {/* ── Result ── */}
          {(status === 'found' || status === 'not_found') && result && (
            <div className="space-y-4">
              {/* Image preview strip */}
              {previewUrl && (
                <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3">
                  <img src={previewUrl} alt="Verified" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium truncate">{fileName}</p>
                    <p className="text-xs text-white/40 mt-0.5">Uploaded for verification</p>
                  </div>
                  <button onClick={handleReset} className="text-white/30 hover:text-white/70 text-sm flex-shrink-0 transition-colors">
                    ✕
                  </button>
                </div>
              )}

              {/* Result card */}
              <ResultCard result={result} backendUrl={BACKEND_URL} />

              <div className="text-center pt-1">
                <button onClick={handleReset} className="text-sm text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 transition-colors">
                  Verify a different image
                </button>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {status === 'error' && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">⚠️</span>
                <div>
                  <h3 className="font-semibold text-red-300 mb-1">Verification Failed</h3>
                  <p className="text-sm text-white/50">{errorMsg}</p>
                  <button onClick={handleReset} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 font-medium underline">
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── How it works (idle only) ── */}
          {status === 'idle' && (
            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { icon: '📸', title: 'Any Version', desc: 'Works on resized, compressed, or cropped copies.' },
                { icon: '🔎', title: 'Fingerprint Match', desc: 'Visual hash lookup in the permanent blockchain registry.' },
                { icon: '📋', title: 'Origin Report', desc: "Creator name, platform, and exact certification time." },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <h3 className="font-semibold text-white text-sm mb-1">{item.title}</h3>
                  <p className="text-white/40 text-xs leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Pillars (idle only) ── */}
        {status === 'idle' && (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[35vh]">
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/90 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex h-full items-end gap-px px-[2px]">
              {PILLARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-black"
                  style={{
                    height: isMounted ? `${h}%` : '0%',
                    transition: 'height 1s ease-in-out',
                    transitionDelay: `${Math.abs(i - Math.floor(PILLARS.length / 2)) * 60}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
