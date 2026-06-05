import { useState, useRef, useCallback } from 'react';

function load(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); }
  catch { return []; }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function useChatSessions(storageKey) {
  const [sessions, setSessions] = useState(() => load(storageKey));
  const [activeId, setActiveId] = useState(() => load(storageKey)[0]?.id ?? null);

  // Ref always holds the latest sessions so callbacks don't close over stale state
  const ref = useRef(sessions);
  ref.current = sessions;

  const persist = useCallback((next) => {
    setSessions(next);
    save(storageKey, next);
  }, [storageKey]);

  const createSession = useCallback((title = 'New conversation') => {
    const id = uid();
    persist([{ id, title, messages: [], updatedAt: Date.now() }, ...ref.current]);
    setActiveId(id);
    return id;
  }, [persist]);

  const updateSession = useCallback((id, messages) => {
    const title = messages.find((m) => m.role === 'user')?.content.slice(0, 45).trimEnd() ?? 'Conversation';
    persist(ref.current.map((s) => s.id === id ? { ...s, messages, title, updatedAt: Date.now() } : s));
  }, [persist]);

  const selectSession = useCallback((id) => setActiveId(id), []);

  const deleteSession = useCallback((id) => {
    const next = ref.current.filter((s) => s.id !== id);
    persist(next);
    setActiveId((prev) => prev === id ? (next[0]?.id ?? null) : prev);
  }, [persist]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  return { sessions, activeId, activeSession, createSession, updateSession, selectSession, deleteSession };
}
