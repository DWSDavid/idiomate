import React, { useState } from 'react';
import { switchToRubiProfile } from '../api';

interface OwnerVocabImportProps {
  onImported?: () => void;
}

export function OwnerVocabImport({ onImported }: OwnerVocabImportProps) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'importing' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async () => {
    if (!code.trim()) return;
    setStatus('importing');
    setMessage('');
    try {
      const result = await switchToRubiProfile(code.trim());
      const vocabMessage = result.ownerVocabAvailable
        ? `Imported ${result.imported} words. Total: ${result.total}.`
        : `Switched to ${result.user.name}, but the owner vocab file is not available on this server.`;
      setMessage(`Using ${result.user.name}'s profile. ${vocabMessage}`);
      setStatus('done');
      onImported?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not switch to Rubi profile.');
      setStatus('error');
    }
  };

  return (
    <section className="surface" aria-label="owner vocab import">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="field-label flex-1">
          Rubi profile code
          <input
            className="field mt-1"
            value={code}
            onChange={event => setCode(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn-primary"
          disabled={!code.trim() || status === 'importing'}
          onClick={() => void submit()}
        >
          {status === 'importing' ? 'Switching' : 'Switch to Rubi'}
        </button>
      </div>
      {message ? (
        <p className={`mt-3 text-sm ${status === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>{message}</p>
      ) : null}
    </section>
  );
}
