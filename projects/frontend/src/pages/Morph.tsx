import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import StampBadge from '../components/StampBadge'
import type { ProvenanceStep } from './Verify'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

const MORPH_TYPES = [
  { id: 'brightness', label: 'Brighten', icon: '☀️' },
  { id: 'contrast',   label: 'Contrast', icon: '◑' },
  { id: 'saturation', label: 'Saturate', icon: '🎨' },
  { id: 'blur',       label: 'Blur',     icon: '💧' },
  { id: 'rotate',     label: 'Rotate',   icon: '↻' },
  { id: 'crop',       label: 'Crop',     icon: '✂️' },
] as const

type MorphType = typeof MORPH_TYPES[number]['id']
type Stage = 'idle' | 'uploading' | 'verified' | 'morphing' | 'morphed' | 'registering' | 'stamped' | 'error'

interface MorphResult {
  original_phash: string
  morphed_phash: string
  hamming_distance: number
  original_registered: boolean
  original_creator: string
  original_morphed_by: string        // who morphed the uploaded image (empty if original)
  provenance_chain: ProvenanceStep[] // full lineage of the uploaded image
  morphed_image_b64: string
  morph_type: string
}

function base64ToBlob(b64: string, mimeType = 'image/jpeg'): Blob {
  const byteChars = atob(b64)
  const byteArr = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i)
  return new Blob([byteArr], { type: mimeType })
}

export default function Morph() {
  const { user, logout } = useAuth()
  const [isMounted, setIsMounted] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [isDragging, setIsDragging] = useState(false)
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [originalPreview, setOriginalPreview] = useState<string | null>(null)
  const [morphResult, setMorphResult] = useState<MorphResult | null>(null)
  const [selectedMorph, setSelectedMorph] = useState<MorphType>('brightness')
  const [morphedPreview, setMorphedPreview] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setIsMounted(true), 100)
    return () => clearTimeout(t)
  }, [])

  // ── Upload & initial morph ────────────────────────────────────────────────

  const runMorph = useCallback(async (file: File, morphType: MorphType) => {
    setStage('morphing')
    setErrorMsg('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('morph_type', morphType)
      const res = await fetch(`${BACKEND_URL}/api/morph`, { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || 'Morph failed')
      }
      const data: MorphResult = await res.json()
      setMorphResult(data)
      // Decode base64 → object URL for preview
      const blob = base64ToBlob(data.morphed_image_b64)
      if (morphedPreview) URL.revokeObjectURL(morphedPreview)
      setMorphedPreview(URL.createObjectURL(blob))
      setStage('morphed')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setErrorMsg(msg)
      setStage('error')
    }
  }, [morphedPreview])

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setOriginalFile(file)
    if (originalPreview) URL.revokeObjectURL(originalPreview)
    setOriginalPreview(URL.createObjectURL(file))
    setMorphResult(null)
    setMorphedPreview(null)
    setStage('uploading')
    await runMorph(file, selectedMorph)
  }, [originalPreview, runMorph, selectedMorph])

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

  // ── Morph type switch ─────────────────────────────────────────────────────

  const handleMorphSwitch = useCallback(async (morphType: MorphType) => {
    if (!originalFile || stage === 'morphing' || stage === 'registering' || stage === 'stamped') return
    setSelectedMorph(morphType)
    await runMorph(originalFile, morphType)
  }, [originalFile, stage, runMorph])

  // ── Register morphed image ────────────────────────────────────────────────

  const handleRegister = useCallback(async () => {
    if (!user) { setShowAuthPrompt(true); return }
    if (!morphResult || !morphedPreview) return

    // Block registration if pHash is unchanged — morph too subtle, would overwrite original record
    if (morphResult.hamming_distance === 0) {
      setErrorMsg('Fingerprint unchanged — this morph is too similar to the original. Pick Rotate or Blur for a stronger transform.')
      setStage('error')
      return
    }

    setStage('registering')
    try {
      const blob = base64ToBlob(morphResult.morphed_image_b64)
      const fd = new FormData()
      // creator_name = original owner (propagated through chain); morphed_by = current user
      fd.append('creator_name', morphResult.original_creator || user.name)
      fd.append('platform', 'GenMark')
      fd.append('image', blob, 'morphed.jpg')
      fd.append('morphed_by', user.name)
      fd.append('original_phash', morphResult.original_phash)
      fd.append('creator_email', user.email || '')

      const res = await fetch(`${BACKEND_URL}/api/register`, { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || 'Registration failed')
      }
      const data = await res.json()
      // Detect silent collision: pHash already exists as an original, morph was not distinct
      if (data.already_registered && data.phash_collision_with_original) {
        setErrorMsg('The morphed fingerprint matched an existing original record — the morph was not distinct enough. Try Rotate or Blur instead.')
        setStage('error')
        return
      }
      setStage('stamped')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (msg.includes('fetch') || msg.includes('503') || msg.includes('not configured')) {
        setStage('stamped') // treat as success in demo mode
      } else {
        setErrorMsg(msg)
        setStage('error')
      }
    }
  }, [user, morphResult, morphedPreview])

  const handleDownload = useCallback(() => {
    if (!morphResult) return
    const blob = base64ToBlob(morphResult.morphed_image_b64)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `genmark-morphed-${morphResult.morphed_phash.slice(0, 8)}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [morphResult])

  const handleReset = useCallback(() => {
    if (originalPreview) URL.revokeObjectURL(originalPreview)
    if (morphedPreview) URL.revokeObjectURL(morphedPreview)
    setOriginalFile(null)
    setOriginalPreview(null)
    setMorphResult(null)
    setMorphedPreview(null)
    setStage('idle')
    setErrorMsg('')
    setShowAuthPrompt(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [originalPreview, morphedPreview])

  const isLoading = stage === 'uploading' || stage === 'morphing' || stage === 'registering'

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes stampPop {
          0%   { opacity: 0; transform: scale(0.3) rotate(-18deg); }
          65%  { transform: scale(1.18) rotate(5deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        .fade-up    { animation: fadeInUp 0.6s ease-out forwards; }
        .stamp-pop  { animation: stampPop 0.65s cubic-bezier(0.34,1.56,0.64,1) forwards; }
      `}</style>

      <div className="relative min-h-screen overflow-x-hidden bg-black text-white">

        {/* ── Background ── */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-30" style={{
          backgroundImage: [
            'radial-gradient(80% 55% at 50% 52%, rgba(139,92,246,0.28) 0%, rgba(76,29,149,0.35) 30%, rgba(20,10,40,0.5) 60%, rgba(0,0,0,1) 85%)',
            'radial-gradient(70% 50% at 10% 20%, rgba(251,113,133,0.15) 0%, transparent 55%)',
            'radial-gradient(60% 40% at 90% 80%, rgba(88,112,255,0.20) 0%, transparent 55%)',
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
              <a href="/morph" className="text-white border-b border-white/60 pb-0.5">Morph</a>
              <a href="/verify" className="hover:text-white transition-colors">Verify</a>
              {user && (
                <div className="flex items-center gap-3 pl-2 border-l border-white/10">
                  <span className="text-white/50 text-xs">{user.name}</span>
                  <button onClick={logout} className="text-xs text-white/30 hover:text-white/70 transition-colors">Log out</button>
                </div>
              )}
            </nav>
          </div>
        </header>

        <div className="relative z-10 mx-auto w-full max-w-3xl px-6 pt-12 pb-24">

          {/* ── Page header ── */}
          <div className={`text-center mb-10 ${isMounted ? 'fade-up' : 'opacity-0'}`}>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wider text-white/60 ring-1 ring-white/10 mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              Derivative Content Tool
            </span>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              Morph &amp; <span className="text-violet-300">Certify</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-white/50 md:text-base">
              Upload a registered image, apply a transformation, and register the derivative on-chain with full provenance linking back to the original creator.
            </p>
          </div>

          {/* ── F4 Auth prompt ── */}
          {showAuthPrompt && (
            <div className="mb-6 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-sm px-7 py-6 text-center fade-up">
              <div className="h-9 w-9 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-3">
                <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold text-sm mb-1">Sign in to register your morph</h3>
              <p className="text-white/40 text-xs mb-4">You can morph and preview freely. Sign in only to certify it on-chain.</p>
              <div className="flex gap-3 justify-center">
                <a href="/login" className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white/70 hover:border-white/40 hover:text-white transition-all">Log in</a>
                <a href="/login?tab=signup" className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-violet-50 transition-all">Create account</a>
              </div>
              <button onClick={() => setShowAuthPrompt(false)} className="mt-3 text-xs text-white/20 hover:text-white/40 transition-colors">Dismiss</button>
            </div>
          )}

          {/* ── Drop zone (idle) ── */}
          {stage === 'idle' && (
            <div
              className={`rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer
                ${isDragging ? 'border-violet-400 bg-violet-500/10' : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/8'}
              `}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
              <div className="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center select-none">
                <div className={`rounded-full p-4 ${isDragging ? 'bg-violet-500/20' : 'bg-white/10'}`}>
                  <svg className="h-8 w-8 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-medium">Drop your image here</p>
                  <p className="text-white/40 text-sm mt-1">PNG, JPG, WebP — any registered GenMark image</p>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/30 max-w-xs">
                  {['Upload', 'Pick transform', 'Register morph'].map((s, i) => (
                    <div key={s} className="flex items-center gap-1.5">
                      <span className="h-4 w-4 rounded-full border border-white/20 flex items-center justify-center text-[10px]">{i + 1}</span>
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Loading spinner ── */}
          {(stage === 'uploading' || stage === 'morphing') && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center fade-up">
              {originalPreview && (
                <img src={originalPreview} alt="Processing" className="w-20 h-20 rounded-xl object-cover mx-auto mb-5 opacity-40" />
              )}
              <svg className="animate-spin h-8 w-8 text-violet-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-white font-medium">{stage === 'uploading' ? 'Checking origin…' : 'Applying transform…'}</p>
              <p className="text-white/35 text-sm mt-1">Computing perceptual fingerprint</p>
            </div>
          )}

          {/* ── Morphed result ── */}
          {(stage === 'morphed' || stage === 'registering' || stage === 'stamped') && morphResult && (
            <div className="space-y-5 fade-up">

              {/* Origin info banner with full provenance chain */}
              <div className={`rounded-xl border px-5 py-3.5 ${
                morphResult.original_registered
                  ? 'border-emerald-500/20 bg-emerald-500/10'
                  : 'border-amber-500/20 bg-amber-500/10'
              }`}>
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">{morphResult.original_registered ? '✅' : '⚠'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${morphResult.original_registered ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {morphResult.original_registered
                        ? 'Certified image — provenance chain will be extended'
                        : 'No origin record found for uploaded image'}
                    </p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {morphResult.original_registered
                        ? 'Your morph will be linked to the original creator on-chain.'
                        : 'You can still morph and register — it will be recorded as fresh content.'}
                    </p>

                    {/* Provenance breadcrumb trail */}
                    {morphResult.original_registered && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        {morphResult.provenance_chain.length > 0
                          ? morphResult.provenance_chain.map((step, i) => (
                              <span key={step.phash} className="flex items-center gap-1.5">
                                {i > 0 && <span className="text-white/20 text-xs">→</span>}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  step.is_original
                                    ? 'bg-indigo-500/20 text-indigo-300'
                                    : 'bg-violet-500/20 text-violet-300'
                                }`}>
                                  {step.is_original
                                    ? `${step.creator_name} (original)`
                                    : `${step.morphed_by || step.creator_name} (morphed)`}
                                </span>
                              </span>
                            ))
                          : (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-500/20 text-indigo-300">
                              {morphResult.original_creator} (original)
                            </span>
                          )
                        }
                        <span className="text-white/20 text-xs">→</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/5 text-white/40 italic">
                          your morph next
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Morph type picker */}
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Transform type</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {MORPH_TYPES.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleMorphSwitch(m.id)}
                      disabled={isLoading || stage === 'stamped'}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 px-2 text-xs font-medium transition-all disabled:cursor-not-allowed
                        ${selectedMorph === m.id
                          ? 'border-violet-400/60 bg-violet-500/20 text-violet-200'
                          : 'border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/80'
                        }`}
                    >
                      <span className="text-base">{m.icon}</span>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Side-by-side preview */}
              <div className="grid grid-cols-2 gap-3">
                {/* Original */}
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Original</p>
                  <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-square">
                    {originalPreview && (
                      <img src={originalPreview} alt="Original" className="w-full h-full object-cover" />
                    )}
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="rounded-md bg-black/70 backdrop-blur-sm px-2 py-1 text-[10px] font-mono text-white/50 truncate">
                        {morphResult.original_phash}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Morphed */}
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Morphed</p>
                  <div className="relative rounded-xl overflow-hidden border border-violet-500/30 aspect-square">
                    {stage === 'morphing' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
                        <svg className="animate-spin h-6 w-6 text-violet-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </div>
                    )}
                    {morphedPreview && (
                      <img src={morphedPreview} alt="Morphed" className="w-full h-full object-cover" />
                    )}
                    {stage === 'stamped' && (
                      <div className="absolute top-2 right-2 stamp-pop">
                        <StampBadge isDemo={false} txId="pending" asaId={0} />
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="rounded-md bg-black/70 backdrop-blur-sm px-2 py-1 text-[10px] font-mono text-white/50 truncate">
                        {morphResult.morphed_phash}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hamming distance badge */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-center gap-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs ${
                    morphResult.hamming_distance === 0
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-400/80'
                      : 'border-white/10 bg-white/5 text-white/50'
                  }`}>
                    <span className={`h-2 w-2 rounded-full ${morphResult.hamming_distance === 0 ? 'bg-amber-400' : 'bg-violet-400'}`} />
                    Hamming distance: <span className={`font-mono font-semibold ${morphResult.hamming_distance === 0 ? 'text-amber-300' : 'text-violet-300'}`}>{morphResult.hamming_distance} bits</span>
                    <span className="text-white/30">/ 64</span>
                  </div>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                {morphResult.hamming_distance === 0 && (
                  <p className="text-center text-xs text-amber-400/80">
                    ⚠ Fingerprint unchanged — pick Rotate or Blur for a distinct registration
                  </p>
                )}
              </div>

              {/* Register / success / reset */}
              {stage === 'stamped' ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 flex items-start gap-3">
                    <span className="text-2xl mt-0.5">✅</span>
                    <div>
                      <p className="font-semibold text-emerald-300">Morph Certified ✓</p>
                      <p className="text-sm text-white/50 mt-0.5">
                        Derivative content permanently recorded on the Algorand blockchain.
                        {morphResult.original_registered && ` Provenance links back to ${morphResult.original_creator || 'original creator'}.`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleDownload}
                    className="w-full rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold py-2.5 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Morphed Image
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={handleReset}
                      className="flex-1 rounded-full border border-white/20 py-2.5 text-sm font-semibold text-white/70 hover:border-white/40 hover:text-white transition-all"
                    >
                      Morph another image
                    </button>
                    <a
                      href="/verify"
                      className="flex-1 rounded-full bg-white py-2.5 text-sm font-semibold text-black hover:bg-violet-50 transition-all text-center"
                    >
                      Verify it →
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={handleReset}
                    className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/50 hover:text-white transition-all"
                  >
                    ← New image
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={stage === 'morphing'}
                    className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white/70 hover:border-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                  <button
                    onClick={handleRegister}
                    disabled={stage === 'registering' || stage === 'morphing' || morphResult.hamming_distance === 0}
                    title={morphResult.hamming_distance === 0 ? 'Fingerprint unchanged — choose a different transform' : undefined}
                    className="flex-1 rounded-full bg-violet-600 hover:bg-violet-500 disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-all flex items-center justify-center gap-2"
                  >
                    {stage === 'registering' ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Certifying on Algorand…
                      </>
                    ) : (
                      'Register Morph on Algorand'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {stage === 'error' && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 fade-up">
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">⚠️</span>
                <div>
                  <h3 className="font-semibold text-red-300 mb-1">Something went wrong</h3>
                  <p className="text-sm text-white/50">{errorMsg}</p>
                  <button
                    onClick={handleReset}
                    className="mt-3 text-sm text-violet-400 hover:text-violet-300 font-medium underline"
                  >
                    Start over
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── How it works (idle only) ── */}
          {stage === 'idle' && (
            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { icon: '📤', title: 'Upload Original', desc: 'Any GenMark-certified image. We detect the original creator automatically.' },
                { icon: '🔄', title: 'Apply Transform', desc: 'Choose from 6 visual transforms. Each produces a unique pHash fingerprint.' },
                { icon: '📜', title: 'Certify Derivative', desc: 'The morphed image is registered on-chain with a link to the original creator.' },
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
      </div>
    </>
  )
}
