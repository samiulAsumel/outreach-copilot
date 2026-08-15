import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';

interface LoginScreenProps {
  onLoggedIn: () => void;
}

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.login(password);
      onLoggedIn();
    } catch (err) {
      // 429 (rate limited) and 401 (wrong password) both come back through
      // ApiError with a server-authored message already safe to show —
      // worker/routes/auth.ts never leaks anything more specific than that.
      setError(err instanceof ApiError ? err.message : 'Failed to log in');
    } finally {
      setSubmitting(false);
      setPassword('');
    }
  }

  return (
    <div className="login-screen">
      <form onSubmit={handleSubmit} className="login-screen__form panel">
        <h1>Outreach Copilot</h1>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={submitting || !password}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}
