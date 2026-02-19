import { useCallback, useEffect, useState } from 'react'
import StampBadge from '../components/StampBadge'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

const PROMPTS = [
  'a majestic lion in a cyberpunk city at sunset',
  'an astronaut surfing on neon waves in space',
  'a dragon made of cherry blossoms over Mount Fuji',
  'a cozy library with glowing books and floating lanterns',
  'a fox in a forest made entirely of glass',
  'a futuristic city floating above the clouds',
  'an ancient temple overgrown with bioluminescent plants',
  'a wolf made of northern lights and stardust',
]

const PILLARS = [92, 84, 78, 70, 62, 54, 46, 34, 18, 34, 46, 54, 62, 70, 78, 84, 92]

type Status = 'idle' | 'generating' | 'registering' | 'stamped' | 'error'

interface StampData {
  tx_id: string
  asa_id: number
  phash: string
  app_id: number
}

export default function Generate() {
  const [isMounted, setIsMounted] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [stampData, setStampData] = useState<StampData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setIsMounted(true), 100)
    return () => clearTimeout(t)
  }, [])

  const handleGenerate = useCallback(async () => {
    const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)] + ' ' + Date.now()
    setStatus('generating')
    setImageUrl(null)
    setStampData(null)
    setErrorMsg('')

    const proxyUrl = `${BACKEND_URL}/api/generate-image?prompt=${encodeURIComponent(prompt)}`
    setImageUrl(proxyUrl)
    setStatus('registering')

    try {
      const formData = new FormData()
      formData.append('creator_name', 'GenMark User')
      formData.append('platform', 'GenMark')
      formData.append('prompt', prompt)

      const response = await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        if (response.status === 409) {
          setStatus('stamped')
          setStampData({ tx_id: 'existing', asa_id: 0, phash: '', app_id: 0 })
          return
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Registration failed')
      }

      const data = await response.json()
      setStampData({ tx_id: data.tx_id, asa_id: data.asa_id, phash: data.phash, app_id: data.app_id })
      setStatus('stamped')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      if (message.includes('503') || message.includes('not configured') || message.includes('fetch') || message.includes('NetworkError')) {
        setStatus('stamped')
        setStampData({ tx_id: 'demo-mode', asa_id: 0, phash: '', app_id: 0 })
      } else {
        setStatus('error')
        setErrorMsg(message)
      }
    }
  }, [])

  const isDemo = stampData?.tx_id === 'demo-mode'
  const isExisting = stampData?.tx_id === 'existing'
  const isPending = stampData?.tx_id === 'pending'
  const isBusy = status === 'generating' || status === 'registering'

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes subtlePulse {
          0%, 100% { opacity: 0.8; transform: scale(1) translateX(-50%); }
          50%       { opacity: 1;   transform: scale(1.04) translateX(-50%); }
        }
        .fade-up { animation: fadeInUp 0.7s ease-out forwards; }
      `}</style>

      <div className="relative min-h-screen overflow-x-hidden bg-black text-white">

        {/* ── Background gradients ── */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-30" style={{
          backgroundImage: [
            'radial-gradient(80% 55% at 50% 52%, rgba(252,166,154,0.38) 0%, rgba(214,76,82,0.40) 27%, rgba(61,36,47,0.30) 47%, rgba(39,38,67,0.40) 60%, rgba(8,8,12,0.92) 78%, rgba(0,0,0,1) 88%)',
            'radial-gradient(85% 60% at 14% 0%, rgba(255,193,171,0.55) 0%, rgba(233,109,99,0.48) 30%, rgba(48,24,28,0.0) 64%)',
            'radial-gradient(70% 50% at 86% 22%, rgba(88,112,255,0.30) 0%, rgba(16,18,28,0.0) 55%)',
          ].join(','),
          backgroundColor: '#000',
        }} />

        {/* ── Grid overlay ── */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 mix-blend-screen opacity-20" style={{
          backgroundImage: [
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.09) 0 1px, transparent 1px 96px)',
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 24px)',
            'repeating-radial-gradient(80% 55% at 50% 52%, rgba(255,255,255,0.07) 0 1px, transparent 1px 120px)',
          ].join(','),
        }} />

        {/* ── Nav ── */}
        <header className="relative z-20 border-b border-white/10 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 md:px-8">
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-5 rounded-full bg-white" />
              <span className="text-base font-semibold tracking-tight">GenMark</span>
            </div>
            <nav className="flex items-center gap-6 text-sm text-white/70">
              <a href="/generate" className="text-white border-b border-white/60 pb-0.5">Create</a>
              <a href="/verify" className="hover:text-white transition-colors">Verify</a>
            </nav>
          </div>
        </header>

        {/* ── Hero section ── */}
        {status === 'idle' && (
          <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-6 pt-24 pb-20 text-center">
            <span
              className={`inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wider text-white/60 ring-1 ring-white/10 ${isMounted ? 'fade-up' : 'opacity-0'}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              AI Content Provenance
            </span>

            <h1
              style={{ animationDelay: '150ms' }}
              className={`mt-6 text-5xl font-bold tracking-tight md:text-7xl ${isMounted ? 'fade-up' : 'opacity-0'}`}
            >
              Create &amp; Certify
              <br />
              <span className="text-rose-300">Your Images</span>
            </h1>

            <p
              style={{ animationDelay: '280ms' }}
              className={`mx-auto mt-5 max-w-xl text-white/60 md:text-lg ${isMounted ? 'fade-up' : 'opacity-0'}`}
            >
              Every image you generate is silently registered on Algorand — an unforgeable birth certificate, permanent and public.
            </p>

            <div
              style={{ animationDelay: '400ms' }}
              className={`mt-10 flex flex-col items-center gap-4 sm:flex-row ${isMounted ? 'fade-up' : 'opacity-0'}`}
            >
              <button
                onClick={handleGenerate}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-black shadow-lg transition hover:bg-white/90 active:scale-95"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Generate Image
              </button>
              <a
                href="/verify"
                className="inline-flex items-center justify-center rounded-full border border-white/20 px-8 py-3.5 text-sm font-semibold text-white/80 backdrop-blur hover:border-white/40 hover:text-white transition-all"
              >
                Verify an Image
              </a>
            </div>

            {/* Feature pills */}
            <div
              style={{ animationDelay: '520ms' }}
              className={`mt-14 flex flex-wrap justify-center gap-3 ${isMounted ? 'fade-up' : 'opacity-0'}`}
            >
              {[
                { icon: '🔒', label: 'Blockchain-registered' },
                { icon: '🧬', label: 'Perceptual fingerprint' },
                { icon: '📜', label: 'Forensic certificates' },
                { icon: '⚡', label: 'Algorand TestNet' },
              ].map((f) => (
                <span key={f.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white/60">
                  {f.icon} {f.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Generating skeleton ── */}
        {status === 'generating' && (
          <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col items-center px-6 pt-20 pb-20 text-center">
            <div className="w-full aspect-square max-w-sm rounded-2xl border border-white/10 bg-white/5 animate-pulse flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-4">🎨</div>
                <p className="text-white/50 text-sm">Starting generation…</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Image result ── */}
        {imageUrl && status !== 'generating' && (
          <div className="relative z-10 mx-auto w-full max-w-2xl px-6 pt-10 pb-32">

            {/* Image card */}
            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              <img src={imageUrl} alt="Generated image" className="w-full object-cover" />

              {/* Registering overlay */}
              {status === 'registering' && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                  <svg className="animate-spin h-10 w-10 text-rose-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-white font-semibold">Certifying on Algorand…</p>
                  <p className="text-white/50 text-xs">Computing fingerprint</p>
                </div>
              )}

              {/* Stamp badge */}
              {status === 'stamped' && stampData && (
                <div className="absolute top-3 right-3">
                  <StampBadge isDemo={isDemo || isExisting} txId={stampData.tx_id} asaId={stampData.asa_id} />
                </div>
              )}
            </div>

            {/* Result info */}
            {status === 'stamped' && stampData && (
              <div className="mt-5 space-y-3">
                {/* Status banner */}
                <div className={`rounded-xl border px-5 py-4 flex items-start gap-3 ${isDemo || isExisting ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                  <span className="text-2xl mt-0.5">{isDemo || isExisting ? '🔷' : '✅'}</span>
                  <div>
                    <p className={`font-semibold ${isDemo || isExisting ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {isDemo ? 'Demo Mode' : isExisting ? 'Previously Certified' : 'Content Certified ✓'}
                    </p>
                    <p className="text-sm text-white/50 mt-0.5">
                      {isDemo
                        ? 'Backend not connected — showing demo.'
                        : isExisting
                        ? 'This image was already registered on Algorand.'
                        : 'Origin permanently recorded on the Algorand blockchain.'}
                    </p>
                  </div>
                </div>

                {/* Tech details */}
                {!isDemo && !isExisting && stampData.phash && (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 space-y-2 text-xs font-mono">
                    <div className="flex justify-between text-white/40">
                      <span>Fingerprint</span>
                      <span className="text-white/70">{stampData.phash}</span>
                    </div>
                    {!isPending && stampData.asa_id > 0 && (
                      <div className="flex justify-between text-white/40">
                        <span>Certificate #</span>
                        <span className="text-white/70">{stampData.asa_id}</span>
                      </div>
                    )}
                    {!isPending && stampData.tx_id && (
                      <div className="flex justify-between text-white/40">
                        <span>Tx ID</span>
                        <span className="text-white/70 truncate max-w-[200px]">{stampData.tx_id}</span>
                      </div>
                    )}
                    {isPending && (
                      <div className="flex justify-between text-white/40">
                        <span>Status</span>
                        <span className="text-emerald-400/70">Registering on-chain…</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <a
                    href="/verify"
                    className="flex-1 text-center rounded-full border border-white/20 py-2.5 text-sm font-medium text-white/70 hover:border-white/40 hover:text-white transition-all"
                  >
                    Verify This Image
                  </a>
                  <button
                    onClick={handleGenerate}
                    className="flex-1 rounded-full bg-white py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition-all"
                  >
                    Generate Another
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {status === 'error' && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4">
                <p className="text-red-300 text-sm font-medium">⚠ {errorMsg}</p>
                <button onClick={() => { setStatus('idle'); setImageUrl(null); setErrorMsg('') }} className="mt-2 text-xs text-red-400 hover:text-red-300 underline">
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Pillar silhouette (only on idle) ── */}
        {status === 'idle' && (
          <>
            <div
              className="pointer-events-none fixed bottom-[120px] left-1/2 z-0 h-32 w-24 rounded-md"
              style={{
                background: 'linear-gradient(to bottom, rgba(255,255,255,0.7), rgba(255,200,190,0.5), transparent)',
                animation: 'subtlePulse 6s ease-in-out infinite',
                transformOrigin: 'center bottom',
              }}
            />
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[44vh]">
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
          </>
        )}
      </div>
    </>
  )
}
