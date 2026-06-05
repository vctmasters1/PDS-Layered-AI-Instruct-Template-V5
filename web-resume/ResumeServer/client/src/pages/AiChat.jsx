import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api-client.js';
import { useChatSessions } from '../hooks/useChatSessions.js';
import ConversationSidebar from '../components/ConversationSidebar.jsx';

// ─── Minimal inline markdown (reused pattern from Insight) ───────────────────

function inlineNodes(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 3, padding: '1px 5px', fontSize: '0.9em' }}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function parseTableRow(line) {
  return line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

function MarkdownBubble({ text }) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  let listBuffer = null;

  const flushList = () => {
    if (!listBuffer) return;
    const Tag = listBuffer.type;
    elements.push(
      <Tag key={`list-${i}`} style={{ paddingLeft: 20, marginBottom: 8 }}>
        {listBuffer.items.map((item, idx) => (
          <li key={idx} style={{ marginBottom: 3 }}>{inlineNodes(item)}</li>
        ))}
      </Tag>
    );
    listBuffer = null;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^---+$/.test(line.trim())) {
      flushList();
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.15)', margin: '10px 0' }} />);
      i++; continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      flushList();
      const sizes = { 1: 18, 2: 16, 3: 14, 4: 13 };
      elements.push(
        <div key={i} style={{ fontSize: sizes[h[1].length] ?? 13, fontWeight: 700, marginTop: 14, marginBottom: 4 }}>
          {inlineNodes(h[2])}
        </div>
      );
      i++; continue;
    }

    if (line.startsWith('|') && i + 1 < lines.length && /^\|[-| :]+\|/.test(lines[i + 1])) {
      flushList();
      const headers = parseTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(parseTableRow(lines[i])); i++; }
      elements.push(
        <div key={`t-${i}`} style={{ overflowX: 'auto', marginBottom: 10 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr>{headers.map((h, ci) => <th key={ci} style={{ textAlign: 'left', padding: '5px 10px', background: 'rgba(255,255,255,0.08)', borderBottom: '2px solid rgba(255,255,255,0.15)' }}>{inlineNodes(h)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {row.map((cell, ci) => <td key={ci} style={{ padding: '5px 10px', verticalAlign: 'top' }}>{inlineNodes(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)/);
    if (ul) {
      if (!listBuffer || listBuffer.type !== 'ul') { flushList(); listBuffer = { type: 'ul', items: [] }; }
      listBuffer.items.push(ul[1]);
      i++; continue;
    }

    const ol = line.match(/^\d+\.\s+(.*)/);
    if (ol) {
      if (!listBuffer || listBuffer.type !== 'ol') { flushList(); listBuffer = { type: 'ol', items: [] }; }
      listBuffer.items.push(ol[1]);
      i++; continue;
    }

    flushList();
    if (line.trim() === '') { i++; continue; }
    elements.push(<p key={i} style={{ marginBottom: 6, lineHeight: 1.6 }}>{inlineNodes(line)}</p>);
    i++;
  }

  flushList();
  return <div style={{ fontSize: 14 }}>{elements}</div>;
}

// ─── Save-to-Part confirmation panel ─────────────────────────────────────────

function SaveToPartPanel({ content, manifest, onClose }) {
  const [selected, setSelected]   = useState(manifest[0]?.filename ?? '');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveError('');
    try {
      await api.parts.updateContent(selected, content);
      setSaved(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      setSaveError(err.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24, width: 480, maxWidth: '90vw',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Save to Part</div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          This will overwrite the selected Part file with the message content below. The change is permanent.
        </div>

        {/* Part selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Target Part</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={saving || saved}
            style={{
              background: 'var(--bg-raised)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              padding: '8px 10px', fontSize: 14,
            }}
          >
            {manifest.map((p) => (
              <option key={p.filename} value={p.filename}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Content preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Content preview</label>
          <pre style={{
            background: 'var(--bg-raised)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '10px 12px',
            fontSize: 12, maxHeight: 200, overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
            color: 'var(--text-primary)',
          }}>
            {content}
          </pre>
        </div>

        {saveError && (
          <div style={{ fontSize: 13, color: 'var(--danger)' }}>{saveError}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving || saved}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || saved || !selected}
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Confirm Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AiChat page ──────────────────────────────────────────────────────────────

export default function AiChat() {
  const { sessions, activeId, activeSession, createSession, updateSession, selectSession, deleteSession }
    = useChatSessions('rs_aichat_sessions');

  const [messages, setMessages] = useState(() => activeSession?.messages ?? []);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [manifest, setManifest] = useState([]);
  const [savePanel, setSavePanel] = useState(null);
  const bottomRef               = useRef(null);
  const textareaRef             = useRef(null);

  // Seed one session on first ever visit so activeId is never null
  useEffect(() => {
    if (sessions.length === 0) createSession('New conversation');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.sources.manifest().then(setManifest).catch(() => {});
  }, []);

  // Sync messages when the user switches sessions
  useEffect(() => {
    setMessages(activeSession?.messages ?? []);
    setError('');
    setInput('');
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleNew = useCallback(() => {
    createSession('New conversation');
  }, [createSession]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const sid = activeId;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const content = await api.aichat.send(next);
      const withReply = [...next, { role: 'assistant', content }];
      setMessages(withReply);
      updateSession(sid, withReply);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)' }}>
      <ConversationSidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={selectSession}
        onNew={handleNew}
        onDelete={deleteSession}
        label="Chats"
      />

      {/* Chat column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <span style={{ fontSize: 18, fontWeight: 700 }}>AI Chat</span>
          <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            Your full profile is loaded as context
          </span>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={handleNew}>
            New chat
          </button>
        )}
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 80, fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
            Start a conversation. Ask about your career, request writing help, prep for interviews, or anything else.
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              padding: '4px 24px',
              marginBottom: 4,
            }}
          >
            <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  color: 'var(--text-primary)',
                  wordBreak: 'break-word',
                }}
              >
                {msg.role === 'user'
                  ? <span style={{ fontSize: 14, lineHeight: 1.6 }}>{msg.content}</span>
                  : <MarkdownBubble text={msg.content} />
                }
              </div>
              {msg.role === 'assistant' && manifest.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ alignSelf: 'flex-start', fontSize: 12, opacity: 0.7 }}
                  onClick={() => setSavePanel({ content: msg.content })}
                >
                  Save to Part…
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '4px 24px' }}>
            <div style={{ padding: '12px 16px', borderRadius: '18px 18px 18px 4px', background: 'var(--bg-surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 14 }}>
              <span className="spinner" /> Thinking…
            </div>
          </div>
        )}

        {error && (
          <div style={{ margin: '8px 24px', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {savePanel && (
        <SaveToPartPanel
          content={savePanel.content}
          manifest={manifest}
          onClose={() => setSavePanel(null)}
        />
      )}

      {/* Input bar */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
          }}
          onKeyDown={handleKeyDown}
          placeholder="Message… (Enter to send, Shift+Enter for new line)"
          disabled={loading}
          rows={1}
          style={{
            flex: 1,
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            padding: '10px 14px',
            fontSize: 14,
            resize: 'none',
            lineHeight: 1.5,
            overflow: 'hidden',
            minHeight: 42,
          }}
        />
        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{ height: 42, minWidth: 72, flexShrink: 0 }}
        >
          Send
        </button>
      </div>
      </div>{/* end chat column */}
    </div>
  );
}
