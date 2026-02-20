import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

export default function Login() {
  const { isLoggedIn, login } = useAuth()
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    if (isLoggedIn) { window.location.href = '/generate'; return }
    const t = setTimeout(() => setIsMounted(true), 80)
    return () => clearTimeout(t)
  }, [isLoggedIn])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (tab === 'signup' && name.trim().length < 2) { setError('Please enter your full name.'); return }
    if (!email.trim().includes('@')) { setError('Enter a valid email address.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

    setIsLoading(true)
    try {
      const endpoint = tab === 'signup' ? '/api/auth/signup' : '/api/auth/login'
      const body: Record<string, string> = { email: email.trim(), password }
      if (tab === 'signup') body.name = name.trim()

      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || (tab === 'signup' ? 'Signup failed' : 'Login failed'))
      }

      const data = await res.json()
      login({ token: data.token, name: data.name, email: data.email })
      window.location.href = '/generate'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeInUp 0.6s ease-out forwards; }
      `}</style>

      <div className="relative min-h-screen overflow-x-hidden bg-black text-white flex items-center justify-center px-4">

        {/* Background */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-30" style={{
          backgroundImage: [
            'radial-gradient(80% 55% at 50% 52%, rgba(88,112,255,0.22) 0%, rgba(60,40,120,0.32) 35%, rgba(20,20,40,0.5) 60%, rgba(0,0,0,1) 85%)',
            'radial-gradient(60% 40% at 14% 0%, rgba(255,120,100,0.18) 0%, transparent 55%)',
          ].join(','),
          backgroundColor: '#000',
        }} />
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 mix-blend-screen opacity-15" style={{
          backgroundImage: [
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 96px)',
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 24px)',
          ].join(','),
        }} />

        {/* Card */}
        <div className={`w-full max-w-sm ${isMounted ? 'fade-up' : 'opacity-0'}`}>

          {/* Logo */}
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <div className="h-5 w-5 rounded-full bg-white" />
            <span className="text-base font-semibold tracking-tight">GenMark</span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-7">

            {/* Tab switcher */}
            <div className="flex rounded-xl bg-white/5 p-1 mb-6">
              {(['login', 'signup'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError('') }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                    tab === t ? 'bg-white text-black' : 'text-white/50 hover:text-white'
                  }`}
                >
                  {t === 'login' ? 'Log In' : 'Sign Up'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {tab === 'signup' && (
                <div>
                  <label className="block text-xs text-white/40 uppercase tracking-wide mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-white/40 uppercase tracking-wide mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-white/40 uppercase tracking-wide mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-3 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:bg-white/20 disabled:text-white/30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isLoading && (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {isLoading ? 'Please wait…' : tab === 'login' ? 'Log In' : 'Create Account'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-white/25 mt-5">
            {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setTab(tab === 'login' ? 'signup' : 'login'); setError('') }}
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
              {tab === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </div>
    </>
  )
}
