import React, { useState } from 'react';
import { importOwnerVocab } from '../api';

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
      const result = await importOwnerVocab(code.trim());
      setMessage(`Imported ${result.imported} words. Total: ${result.total}.`);
      setStatus('done');
      onImported?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not import owner vocabulary.');
      setStatus('error');
    }
  };

  return (
    <section className="surface" aria-label="owner vocab import">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="field-label flex-1">
          Owner vocab code
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
          {status === 'importing' ? 'Importing' : 'Import owner vocab'}
        </button>
      </div>
      {message ? (
        <p className={`mt-3 text-sm ${status === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>{message}</p>
      ) : null}
    </section>
  );
}
