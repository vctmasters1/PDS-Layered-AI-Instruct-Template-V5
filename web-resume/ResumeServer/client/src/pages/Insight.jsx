import { useState, useRef, useEffect } from 'react';
import { useChatSessions } from '../hooks/useChatSessions.js';
import ConversationSidebar from '../components/ConversationSidebar.jsx';

const DEFAULT_PROMPT =
  'Based on my background and resume, give me an honest assessment of where I stand in the current job market. ' +
  'What kinds of roles should I be targeting? What are my strongest selling points, and where are my gaps? ' +
  'How should I position myself to stand out to hiring managers?';
import { api } from '../api-client.js';

// ─── Minimal markdown renderer ───────────────────────────────────────────────
// Handles: headings, bold, inline-code, tables, ul/ol, horizontal rules, paragraphs.
// Uses React elements only — no dangerouslySetInnerHTML.

function inlineNodes(text, key) {
  // Split on **bold** and `code` spans
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} style={{ background: 'var(--bg-raised)', borderRadius: 3, padding: '1px 5px', fontSize: '0.9em' }}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function parseTableRow(line) {
  return line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

function MarkdownView({ text }) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  let listBuffer = null; // { type: 'ul'|'ol', items: [] }

  const flushList = () => {
    if (!listBuffer) return;
    const Tag = listBuffer.type;
    elements.push(
      <Tag key={`list-${i}`} style={{ paddingLeft: 24, marginBottom: 12 }}>
        {listBuffer.items.map((item, idx) => (
          <li key={idx} style={{ marginBottom: 4 }}>{inlineNodes(item)}</li>
        ))}
      </Tag>
    );
    listBuffer = null;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushList();
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />);
      i++; continue;
    }

    // Headings
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      flushList();
      const level = h[1].length;
      const sizes = { 1: 22, 2: 19, 3: 16, 4: 14 };
      elements.push(
        <div key={i} style={{ fontSize: sizes[level] ?? 14, fontWeight: 700, marginTop: 20, marginBottom: 6, color: 'var(--text-primary)' }}>
          {inlineNodes(h[2])}
        </div>
      );
      i++; continue;
    }

    // Table: detect header row followed by separator
    if (line.startsWith('|') && i + 1 < lines.length && /^\|[-| :]+\|/.test(lines[i + 1])) {
      flushList();
      const headers = parseTableRow(line);
      i += 2; // skip separator
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      elements.push(
        <div key={`t-${i}`} style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {headers.map((h, ci) => (
                  <th key={ci} style={{ textAlign: 'left', padding: '6px 12px', background: 'var(--bg-raised)', borderBottom: '2px solid var(--border)' }}>
                    {inlineNodes(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: '6px 12px', verticalAlign: 'top' }}>{inlineNodes(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list
    const ul = line.match(/^[-*]\s+(.*)/);
    if (ul) {
      if (!listBuffer || listBuffer.type !== 'ul') { flushList(); listBuffer = { type: 'ul', items: [] }; }
      listBuffer.items.push(ul[1]);
      i++; continue;
    }

    // Ordered list
    const ol = line.match(/^\d+\.\s+(.*)/);
    if (ol) {
      if (!listBuffer || listBuffer.type !== 'ol') { flushList(); listBuffer = { type: 'ol', items: [] }; }
      listBuffer.items.push(ol[1]);
      i++; continue;
    }

    flushList();

    // Blank line
    if (line.trim() === '') {
      i++; continue;
    }

    // Paragraph
    elements.push(
      <p key={i} style={{ marginBottom: 10, lineHeight: 1.65 }}>{inlineNodes(line)}</p>
    );
    i++;
  }

  flushList();
  return <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{elements}</div>;
}

// ─── Insight page ─────────────────────────────────────────────────────────────

export default function Insight() {
  const { sessions, activeId, activeSession, createSession, updateSession, selectSession, deleteSession }
    = useChatSessions('rs_insight_sessions');

  const [messages, setMessages] = useState(() => activeSession?.messages ?? []);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const bottomRef               = useRef(null);
  const textareaRef             = useRef(null);

  // Seed one session on first ever visit so activeId is never null
  useEffect(() => {
    if (sessions.length === 0) createSession('Career Insight');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync messages when switching sessions
  useEffect(() => {
    setMessages(activeSession?.messages ?? []);
    setError('');
    setInput('');
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Fire the initial career insight query
  const handleStartInsight = async () => {
    const sid = activeId;
    const userMsg = { role: 'user', content: DEFAULT_PROMPT };
    const next = [userMsg];
    setMessages(next);
    setLoading(true);
    setError('');
    try {
      const content = await api.insight.query(DEFAULT_PROMPT);
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

  // Follow-up questions use the full conversation as context
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleNew = () => createSession('Career Insight');

  const isEmpty = messages.length === 0;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)' }}>
      <ConversationSidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={selectSession}
        onNew={handleNew}
        onDelete={deleteSession}
        label="Insights"
      />

      {/* Chat column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700 }}>Career Insight</span>
            <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--text-muted)' }}>
              AI assessment of your market position
            </span>
          </div>
          {!isEmpty && !loading && (
            <button className="btn btn-ghost btn-sm" onClick={handleNew}>New insight</button>
          )}
        </div>

        {/* Messages / empty state */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isEmpty ? 0 : '24px 0' }}>

          {isEmpty && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 36 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Career Insight</div>
              <div style={{ fontSize: 13, maxWidth: 380, textAlign: 'center', lineHeight: 1.6 }}>
                Get an honest AI assessment of where you stand — your strengths, role targets, and how to position
                yourself. Your full profile is loaded as context.
              </div>
              <button className="btn btn-primary" onClick={handleStartInsight} style={{ marginTop: 8, minWidth: 200 }}>
                Get My Career Insight
              </button>
            </div>
          )}

          {isEmpty && loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)', fontSize: 14 }}>
              <span className="spinner" /> Consulting the AI… this may take a moment.
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', padding: '4px 24px', marginBottom: 4 }}>
              <div style={{ maxWidth: '80%' }}>
                <div style={{
                  padding: '10px 16px',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  color: 'var(--text-primary)',
                  wordBreak: 'break-word',
                }}>
                  {msg.role === 'user'
                    ? <span style={{ fontSize: 14, lineHeight: 1.6 }}>{msg.content}</span>
                    : <MarkdownView text={msg.content} />
                  }
                </div>
              </div>
            </div>
          ))}

          {!isEmpty && loading && (
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

        {/* Follow-up input — only shown once insight has loaded */}
        {!isEmpty && (
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
              placeholder="Ask a follow-up question… (Enter to send)"
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
        )}

      </div>{/* end chat column */}
    </div>
  );
}
