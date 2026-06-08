import React, { useState } from 'react';
import type { AdminUserDetailResponse, AdminUsersResponse } from '../../../shared/types';
import { getAdminUserDetail, getAdminUsers } from '../api';

export function AdminPanel() {
  const [code, setCode] = useState('');
  const [users, setUsers] = useState<AdminUsersResponse>({ users: [] });
  const [detail, setDetail] = useState<AdminUserDetailResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const loadUsers = async () => {
    if (!code.trim()) return;
    setStatus('loading');
    setDetail(null);
    try {
      const result = await getAdminUsers(code.trim());
      setUsers(result);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  const openUser = async (userId: string) => {
    if (!code.trim()) return;
    setStatus('loading');
    try {
      const result = await getAdminUserDetail(code.trim(), userId);
      setDetail(result);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="surface" aria-label="admin panel">
      <span className="section-label">Admin</span>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="field-label flex-1">
          Admin code
          <input className="field mt-1" value={code} onChange={event => setCode(event.target.value)} />
        </label>
        <button type="button" className="btn-primary" disabled={!code.trim() || status === 'loading'} onClick={() => void loadUsers()}>
          Load users
        </button>
      </div>
      {status === 'error' ? <p className="mt-3 text-sm text-red-700">Could not load admin data.</p> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-2">
          {users.users.map(user => (
            <article key={user.id} className="admin-user-row">
              <div>
                <p className="font-semibold text-slate-950">{user.name ?? user.id}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {user.vocabCount} words / {user.sessionCount} writing / {user.sentenceLabCount} sentence lab
                </p>
              </div>
              <button type="button" className="btn-ghost text-xs" onClick={() => void openUser(user.id)}>
                Open {user.name ?? user.id}
              </button>
            </article>
          ))}
        </div>

        {detail ? (
          <div className="admin-detail">
            <div>
              <p className="text-sm font-semibold text-slate-950">{detail.user.name ?? detail.user.id}</p>
              <p className="mt-1 text-xs text-slate-500">{detail.vocab.total} saved words</p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="section-label">Vocab list</p>
                {detail.vocab.items.slice(0, 30).map(item => (
                  <div key={`${detail.user.id}-${item.word}`} className="mini-row">
                    <span className="font-medium text-slate-900">{item.word}</span>
                    {item.capturedDate ? <span className="text-xs text-slate-400">{item.capturedDate}</span> : null}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="section-label">Writing history</p>
                {detail.history.entries.slice(0, 30).map(entry => (
                  <div key={`${detail.user.id}-${entry.source}-${entry.id}`} className="mini-row">
                    <span className="text-sm text-slate-700">{entry.draftText}</span>
                    <span className="chip">{entry.source.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
