import React, { useState } from 'react';

interface AccessGateProps {
  onSubmit: (code: string) => void;
}

export function AccessGate({ onSubmit }: AccessGateProps) {
  const [code, setCode] = useState('');

  return (
    <main className="app-shell flex min-h-[100dvh] items-center justify-center px-4 text-slate-950">
      <form
        aria-label="access gate"
        className="surface w-full max-w-sm space-y-4"
        onSubmit={event => {
          event.preventDefault();
          if (code.trim()) onSubmit(code);
        }}
      >
        <div>
          <p className="desk-kicker">Private preview</p>
          <h1 className="desk-title text-3xl">Idiomate</h1>
          <p className="mt-2 text-sm text-slate-500">Ask the owner for the code.</p>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Access code
          <input
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-base outline-none focus:border-slate-400"
            value={code}
            onChange={event => setCode(event.target.value)}
            autoFocus
          />
        </label>
        <button type="submit" className="btn-primary w-full">
          Continue
        </button>
      </form>
    </main>
  );
}
