import { useCallback, useState } from 'react'
import StampBadge from '../components/StampBadge'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

const SAMPLE_PROMPTS = [
  'a majestic lion in a cyberpunk city at sunset',
  'an astronaut surfing on neon waves in space',
  'a dragon made of cherry blossoms over Mount Fuji',
  'a cozy library with glowing books and floating lanterns',
  'a fox in a forest made entirely of glass',
]

type RegistrationStatus = 'idle' | 'generating' | 'registering' | 'stamped' | 'error'

interface StampData {
  tx_id: string
  asa_id: number
  phash: string
  app_id: number
}

export default function Generate() {
  const [prompt, setPrompt] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<RegistrationStatus>('idle')
  const [stampData, setStampData] = useState<StampData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) return

    setStatus('generating')
    setImageUrl(null)
    setStampData(null)
    setErrorMsg('')

    // Display image via backend proxy
    const proxyUrl = `${BACKEND_URL}/api/generate-image?prompt=${encodeURIComponent(trimmedPrompt)}`
    setImageUrl(proxyUrl)
    setStatus('registering')

    try {
      // Send the RAW PROMPT to backend — backend computes seed itself
      // This guarantees the same image is displayed AND registered
      const formData = new FormData()
      formData.append('creator_name', 'GenMark User')
      formData.append('platform', 'GenMark')
      formData.append('prompt', trimmedPrompt) // backend uses same seed formula

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
      setStampData({
        tx_id: data.tx_id,
        asa_id: data.asa_id,
        phash: data.phash,
        app_id: data.app_id,
      })
      setStatus('stamped')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      if (
        message.includes('503') ||
        message.includes('not configured') ||
        message.includes('Failed to fetch') ||
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
  }, [prompt])

  const handleSamplePrompt = useCallback((sample: string) => {
    setPrompt(sample)
    setStatus('idle')
    setImageUrl(null)
    setStampData(null)
    setErrorMsg('')
  }, [])

  const isDemo = stampData?.tx_id === 'demo-mode'
  const isExisting = stampData?.tx_id === 'existing'
  const isBusy = status === 'generating' || status === 'registering'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900">
      <nav className="border-b border-white/10 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/generate" className="flex items-center gap-2 text-white font-bold text-lg">
            <span className="text-2xl">🛡</span>
            <span>GenMark</span>
          </a>
          <div className="flex items-center gap-6">
            <a href="/generate" className="text-indigo-300 border-b-2 border-indigo-400 text-sm font-medium pb-0.5">
              Create
            </a>
            <a href="/verify" className="text-slate-400 hover:text-white text-sm font-medium transition-colors">
              Verify
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-white mb-3 tracking-tight">Create & Protect Your Image</h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Every image you create is automatically certified with a permanent origin record. Your authorship is provable — forever.
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">Describe your image</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder="a majestic lion in a cyberpunk city at sunset..."
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              disabled={isBusy}
            />
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isBusy}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 flex items-center gap-2 min-w-[140px] justify-center"
            >
              {isBusy && (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {status === 'generating' ? 'Creating...' : status === 'registering' ? 'Certifying...' : 'Create Image'}
            </button>
          </div>

          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-2">Try a sample prompt:</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_PROMPTS.map((sample) => (
                <button
                  key={sample}
                  onClick={() => handleSamplePrompt(sample)}
                  disabled={isBusy}
                  className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sample.length > 40 ? sample.substring(0, 40) + '…' : sample}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!imageUrl && status === 'generating' && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="w-full aspect-square max-w-md mx-auto rounded-xl bg-white/5 animate-pulse flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-3">🎨</div>
                <p className="text-slate-400 text-sm">Starting image generation…</p>
              </div>
            </div>
          </div>
        )}

        {imageUrl && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="relative max-w-md mx-auto">
              <img src={imageUrl} alt={prompt} className="w-full rounded-xl shadow-2xl" />

              {status === 'registering' && (
                <div className="absolute inset-0 bg-black/65 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <div className="text-center px-6">
                    <svg className="animate-spin h-10 w-10 text-indigo-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-white font-semibold text-lg">Certifying your content</p>
                    <p className="text-indigo-300 text-sm mt-1">Recording permanent origin on Algorand…</p>
                    <p className="text-slate-500 text-xs mt-3">This takes ~20 seconds</p>
                  </div>
                </div>
              )}

              {status === 'stamped' && stampData && (
                <div className="absolute top-3 right-3">
                  <StampBadge isDemo={isDemo || isExisting} txId={stampData.tx_id} asaId={stampData.asa_id} />
                </div>
              )}
            </div>

            {status === 'stamped' && stampData && (
              <div className="mt-6 space-y-4">
                <div
                  className={`rounded-xl p-4 border ${isDemo || isExisting ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{isDemo || isExisting ? '🔷' : '✅'}</span>
                    <div>
                      <p className={`font-semibold ${isDemo || isExisting ? 'text-amber-300' : 'text-emerald-300'}`}>
                        {isDemo ? 'Content Certified (Demo Mode)' : isExisting ? 'Content Previously Certified' : 'Content Certified ✓'}
                      </p>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {isDemo
                          ? 'Backend not connected — showing demo.'
                          : isExisting
                            ? 'This image was already registered. Your authorship is on record.'
                            : "Your image's origin is permanently recorded and provable."}
                      </p>
                    </div>
                  </div>
                </div>

                {!isDemo && !isExisting && stampData.tx_id && (
                  <details className="bg-white/5 border border-white/10 rounded-xl">
                    <summary className="px-4 py-3 text-sm text-slate-400 cursor-pointer hover:text-white select-none">
                      View certification details
                    </summary>
                    <div className="px-4 pb-4 space-y-2 text-xs font-mono text-slate-400">
                      <div className="flex justify-between">
                        <span>Certificate #</span>
                        <span className="text-slate-300">{stampData.asa_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Record ID</span>
                        <span className="text-slate-300 truncate ml-4 max-w-48">{stampData.tx_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Fingerprint</span>
                        <span className="text-slate-300">{stampData.phash}</span>
                      </div>
                    </div>
                  </details>
                )}

                <div className="flex gap-3">
                  <a
                    href="/verify"
                    className="flex-1 text-center py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-sm font-medium rounded-xl transition-all"
                  >
                    Verify This Image
                  </a>
                  <button
                    onClick={() => {
                      setStatus('idle')
                      setImageUrl(null)
                      setStampData(null)
                      setPrompt('')
                    }}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-all"
                  >
                    Create Another
                  </button>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="mt-4 rounded-xl p-4 bg-red-500/10 border border-red-500/30">
                <p className="text-red-300 font-medium text-sm">⚠ {errorMsg}</p>
                <button
                  onClick={() => {
                    setStatus('idle')
                    setImageUrl(null)
                    setErrorMsg('')
                  }}
                  className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {!imageUrl && status === 'idle' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            {[
              { icon: '🎨', title: 'Create', desc: 'Type a prompt and generate a unique AI image instantly.' },
              { icon: '🔒', title: 'Certify', desc: "Your image's fingerprint is permanently recorded — silently, in the background." },
              { icon: '🛡', title: 'Prove', desc: 'If your image is ever misused, you can prove original authorship with one click.' },
            ].map((item) => (
              <div key={item.title} className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="text-white font-semibold mb-1">{item.title}</h3>
                <p className="text-slate-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
