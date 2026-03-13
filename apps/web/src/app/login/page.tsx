'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, mfaCode: step === 'mfa' ? mfaCode : undefined }),
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.requireMfa) {
          setStep('mfa');
          return;
        }
        setError(data.message || 'Error de autenticación');
        return;
      }

      window.location.href = '/chat';
    } catch {
      setError('Error de conexión');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center">Gepetto Shield</h1>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>
        )}

        {step === 'credentials' ? (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded p-2 mb-3"
              required
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded p-2 mb-4"
              required
            />
          </>
        ) : (
          <input
            type="text"
            placeholder="Código MFA (6 dígitos)"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            className="w-full border rounded p-2 mb-4 text-center tracking-widest"
            maxLength={6}
            pattern="[0-9]{6}"
            required
          />
        )}

        <button
          type="submit"
          className="w-full bg-blue-600 text-white rounded p-2 font-medium hover:bg-blue-700"
        >
          {step === 'credentials' ? 'Iniciar sesión' : 'Verificar MFA'}
        </button>
      </form>
    </main>
  );
}
