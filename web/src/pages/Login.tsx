import { useState, type FormEvent } from 'react'
import { Building, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../api/client'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try { await login(email.trim(), password) }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.') }
    finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="logo big"><Building size={26} /></div>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to your society's back office.</p>
        <label className="field"><span className="field-label">Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@society.com" required autoFocus />
        </label>
        <label className="field"><span className="field-label">Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn primary block" disabled={busy || !email || !password}>{busy ? <><Loader2 size={16} className="spin" /> Signing in...</> : 'Sign in'}</button>
        <small className="login-foot">Access is by invitation from your society administrator.</small>
      </form>
    </div>
  )
}
