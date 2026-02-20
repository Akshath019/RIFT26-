import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import StampBadge from '../components/StampBadge'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

const PILLARS = [92, 84, 78, 70, 62, 54, 46, 34, 18, 34, 46, 54, 62, 70, 78, 84, 92]

const EXAMPLE_PROMPTS = [
  'a dragon flying over a futuristic city at sunset',
  'an astronaut surfing on neon waves in space',
  'a fox in a forest made entirely of glass',
  'a cozy library with glowing books and floating lanterns',
  'a wolf made of northern lights and stardust',
  'a futuristic city floating above the clouds',
]

type Status = 'idle' | 'generating' | 'registering' | 'stamped' | 'error'

interface StampData {
  tx_id: string
  asa_id: number
  phash: string
  app_id: number
}

export default function Generate() {
  const { user, logout } = useAuth()
  const [isMounted, setIsMounted] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [activePrompt, setActivePrompt] = useState('') // prompt used for current generation
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [stampData, setStampData] = useState<StampData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [typedExample, setTypedExample] = useState('')
  const imgRef = useRef<HTMLImageElement>(null)
  const typeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks which FULL example is currently being typed (so Generate uses complete text, not partial)
  const exampleIdxRef = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setIsMounted(true), 100)
    return () => clearTimeout(t)
  }, [])

  // Typewriter cycling placeholder (stops when user has typed something)
  useEffect(() => {
    if (prompt) { setTypedExample(''); return }
    let charIdx = 0
    let deleting = false
    let exIdx = 0
    exampleIdxRef.current = 0

    const tick = () => {
      const target = EXAMPLE_PROMPTS[exIdx]
      if (!deleting) {
        charIdx++
        setTypedExample(target.slice(0, charIdx))
        if (charIdx === target.length) {
          deleting = true
          typeTimer.current = setTimeout(tick, 2000)
          return
        }
      } else {
        charIdx--
        setTypedExample(target.slice(0, charIdx))
        if (charIdx === 0) {
          deleting = false
          exIdx = (exIdx + 1) % EXAMPLE_PROMPTS.length
          exampleIdxRef.current = exIdx // always the FULL example index
        }
      }
      typeTimer.current = setTimeout(tick, deleting ? 25 : 55)
    }

    typeTimer.current = setTimeout(tick, 600)
    return () => { if (typeTimer.current) clearTimeout(typeTimer.current) }
  }, [prompt])

  const handleGenerate = useCallback(async () => {
    // Use the FULL example prompt from the array — never a partially-typed string
    const effective = prompt.trim() || EXAMPLE_PROMPTS[exampleIdxRef.current]
    if (!effective) return
    if (!prompt.trim()) setPrompt(effective)

    setActivePrompt(effective)
    setStatus('generating')
    setImageUrl(null)
    setStampData(null)
    setErrorMsg('')

    // Route through backend — avoids regional Cloudflare blocks on Pollinations
    const url = `${BACKEND_URL}/api/generate-image?prompt=${encodeURIComponent(effective)}`
    setImageUrl(url)
  }, [prompt])

  const handleImageLoaded = useCallback(async () => {
    if (status !== 'generating') return
    setStatus('registering')

    try {
      const formData = new FormData()
      formData.append('creator_name', user?.name || 'GenMark User')
      formData.append('platform', 'GenMark')
      formData.append('prompt', activePrompt)

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
      if (
        message.includes('503') ||
        message.includes('not configured') ||
        message.includes('fetch') ||
        message.includes('NetworkError')
      ) {
        setStatus('stamped')
        setStampData({ tx_id: 'demo-mode', asa_id: 0, phash: '', app_id: 0 })
      } else {
        setStatus('error')
        setErrorMsg(message)
      }
    }
  }, [status, activePrompt, user])

  const handleImageError = useCallback(() => {
    if (status === 'generating') {
      setStatus('error')
      setErrorMsg('Failed to generate image. Try a different prompt or try again.')
    }
  }, [status])

  const isDemo = stampData?.tx_id === 'demo-mode'
  const isExisting = stampData?.tx_id === 'existing'
  const isPending = stampData?.tx_id === 'pending'

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
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes imageReveal {
          from { opacity: 0; filter: blur(20px); transform: scale(0.96); }
          to   { opacity: 1; filter: blur(0px);  transform: scale(1); }
        }
        @keyframes stampPop {
          0%   { opacity: 0; transform: scale(0.3) rotate(-18deg); }
          65%  { transform: scale(1.18) rotate(5deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes scanline {
          0%   { transform: translateY(-100%); opacity: 0.7; }
          80%  { opacity: 0.4; }
          100% { transform: translateY(500%); opacity: 0; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-10px); }
        }
        @keyframes ringPing {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes borderGlow {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }
        .fade-up { animation: fadeInUp 0.7s ease-out forwards; }
        .image-reveal { animation: imageReveal 0.9s cubic-bezier(0.22,1,0.36,1) forwards; }
        .stamp-pop { animation: stampPop 0.65s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .float-anim { animation: float 3s ease-in-out infinite; }
        .shimmer-text {
          background: linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,1) 40%, rgba(255,255,255,0.5) 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          animation: shimmer 3s linear infinite;
        }
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
              <a href="/generate" className="text-white border-b border-white/60 pb-0.5">Create</a>
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

        {/* ── Hero section (idle) ── */}
        {status === 'idle' && (
          <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-6 pt-24 pb-20 text-center">

            <span className={`inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wider text-white/60 ring-1 ring-white/10 ${isMounted ? 'fade-up' : 'opacity-0'}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
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

            {/* Prompt input with shimmer border */}
            <div
              style={{ animationDelay: '400ms' }}
              className={`mt-10 w-full max-w-xl ${isMounted ? 'fade-up' : 'opacity-0'}`}
            >
              <div className="relative p-px rounded-full" style={{
                background: 'linear-gradient(90deg, rgba(255,255,255,0.08), rgba(251,113,133,0.5), rgba(139,92,246,0.3), rgba(255,255,255,0.08))',
                backgroundSize: '300% auto',
                animation: 'shimmer 4s linear infinite',
              }}>
                <div className="relative flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-md px-2 py-2">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    placeholder={typedExample ? `${typedExample}|` : 'Describe the image you want to create…'}
                    className="flex-1 bg-transparent px-4 py-2 text-sm text-white placeholder-white/40 outline-none"
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={!prompt.trim() && !typedExample}
                    className="group relative inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black shadow-lg transition-all duration-300 hover:bg-rose-50 hover:shadow-rose-500/30 hover:shadow-xl active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-rose-400/0 via-rose-300/20 to-rose-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    <svg className="h-4 w-4 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="relative z-10">Generate</span>
                  </button>
                </div>
              </div>

              <div className="mt-4 flex justify-center">
                <a
                  href="/verify"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-8 py-3 text-sm font-semibold text-white/70 backdrop-blur hover:border-white/40 hover:text-white transition-all"
                >
                  Verify an Image →
                </a>
              </div>
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
              ].map((f, i) => (
                <span
                  key={f.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white/60 hover:border-white/25 hover:bg-white/10 hover:text-white/80 transition-all cursor-default"
                  style={{ animationDelay: `${520 + i * 60}ms` }}
                >
                  {f.icon} {f.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Generating / Result ── */}
        {imageUrl && (
          <div className="relative z-10 mx-auto w-full max-w-2xl px-6 pt-10 pb-32">

            {/* Image card */}
            <div
              className="relative rounded-2xl overflow-hidden border border-white/10"
              style={{
                boxShadow: status === 'stamped'
                  ? '0 0 80px rgba(251,113,133,0.18), 0 25px 60px rgba(0,0,0,0.9)'
                  : '0 25px 60px rgba(0,0,0,0.9)',
                transition: 'box-shadow 1.2s ease',
              }}
            >
              {/* Generating skeleton */}
              {status === 'generating' && (
                <div className="w-full aspect-square bg-gradient-to-br from-white/[0.03] to-rose-950/20 flex flex-col items-center justify-center overflow-hidden relative">

                  {/* Animated scan line */}
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div
                      className="absolute w-full h-24 bg-gradient-to-b from-transparent via-rose-500/8 to-transparent"
                      style={{ animation: 'scanline 3s ease-in-out infinite' }}
                    />
                  </div>

                  {/* Animated grid dots */}
                  <div className="absolute inset-0 pointer-events-none opacity-20" style={{
                    backgroundImage: 'radial-gradient(circle, rgba(251,113,133,0.4) 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                  }} />

                  <div className="relative text-center px-8 z-10">
                    <div className="float-anim text-6xl mb-5">🎨</div>
                    <p className="text-white/90 font-semibold text-base mb-1">AI is painting your vision…</p>
                    <p className="text-white/35 text-xs mb-6">This takes 10–30 seconds on first generation</p>

                    {/* Step indicators */}
                    <div className="flex items-center gap-3 justify-center">
                      {['Initializing', 'Sampling', 'Rendering'].map((step, i) => (
                        <div key={step} className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="h-1.5 w-1.5 rounded-full bg-rose-400"
                              style={{ animation: `pulse 1.4s ease-in-out ${i * 0.3}s infinite` }}
                            />
                            <span className="text-xs text-white/40">{step}</span>
                          </div>
                          {i < 2 && <div className="h-px w-5 bg-white/10" />}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* The actual image — hidden while generating, revealed on load */}
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Generated image"
                className={`w-full object-cover ${status === 'generating' ? 'hidden' : 'image-reveal'}`}
                onLoad={handleImageLoaded}
                onError={handleImageError}
              />

              {/* Registering overlay */}
              {status === 'registering' && (
                <div className="absolute inset-0 bg-black/55 backdrop-blur-sm flex flex-col items-center justify-center gap-5">
                  {/* Multi-ring spinner */}
                  <div className="relative h-20 w-20">
                    <div className="absolute inset-0 rounded-full border border-rose-500/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-rose-400 border-t-transparent animate-spin" style={{ animationDuration: '0.9s' }} />
                    <div
                      className="absolute inset-3 rounded-full border border-rose-300/30"
                      style={{ animation: 'ringPing 1.5s ease-out infinite' }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-xl">🔗</div>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold">Certifying on Algorand…</p>
                    <p className="text-white/40 text-xs mt-1">Computing perceptual fingerprint</p>
                  </div>
                </div>
              )}

              {/* Stamp badge with pop animation */}
              {status === 'stamped' && stampData && (
                <div className="absolute top-3 right-3 stamp-pop">
                  <StampBadge isDemo={isDemo || isExisting} txId={stampData.tx_id} asaId={stampData.asa_id} />
                </div>
              )}
            </div>

            {/* Result cards (staggered fade-up) */}
            {status === 'stamped' && stampData && (
              <div className="mt-5 space-y-3">

                {/* Status banner */}
                <div
                  className={`rounded-xl border px-5 py-4 flex items-start gap-3 ${isDemo || isExisting ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}
                  style={{ animation: 'fadeInUp 0.5s ease-out forwards' }}
                >
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
                  <div
                    className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 space-y-2 text-xs font-mono"
                    style={{ animation: 'fadeInUp 0.5s ease-out 0.1s both' }}
                  >
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
                    {!isPending && stampData.tx_id && stampData.tx_id !== 'pending' && (
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

                {/* Generate another */}
                <div className="space-y-3 pt-1" style={{ animation: 'fadeInUp 0.5s ease-out 0.2s both' }}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                      placeholder="Try another prompt…"
                      className="flex-1 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-rose-400/40 focus:bg-white/8 transition-all"
                    />
                    <button
                      onClick={handleGenerate}
                      disabled={!prompt.trim()}
                      className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black hover:bg-rose-50 transition-all active:scale-95 disabled:opacity-40"
                    >
                      Generate
                    </button>
                  </div>
                  <a
                    href="/verify"
                    className="block text-center rounded-full border border-white/20 py-2.5 text-sm font-medium text-white/70 hover:border-white/40 hover:text-white transition-all"
                  >
                    Verify This Image →
                  </a>
                </div>
              </div>
            )}

            {/* Error */}
            {status === 'error' && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 fade-up">
                <p className="text-red-300 text-sm font-medium">⚠ {errorMsg}</p>
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={handleGenerate}
                    className="text-xs rounded-full border border-red-400/30 px-4 py-1.5 text-red-300 hover:bg-red-500/10 transition-all"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => { setStatus('idle'); setImageUrl(null); setErrorMsg(''); setPrompt('') }}
                    className="text-xs text-red-400/60 hover:text-red-300 underline transition-colors"
                  >
                    New prompt
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Pillar silhouette (idle only) ── */}
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
