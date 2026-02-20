const STORAGE_KEY = 'genmark_user'

export interface AuthUser {
  token: string
  name: string
  email: string
}

export function useAuth() {
  const stored = localStorage.getItem(STORAGE_KEY)
  const user: AuthUser | null = stored ? JSON.parse(stored) : null

  const login = (data: AuthUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    window.location.href = '/login'
  }

  return { user, login, logout, isLoggedIn: !!user }
}
