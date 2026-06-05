import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

function ExtensionModal({ onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopyToken = () => {
    const token = localStorage.getItem('rs_token');
    if (token) {
      navigator.clipboard.writeText(token).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    }
  };

  const serverUrl = window.location.origin;
  const extensionUrl = `http://${window.location.hostname}:38291`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Install Chrome Extension</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Chrome requires extensions to be loaded manually when not from the Web Store.
          Your ZIP has already started downloading — follow these steps:
        </p>
        <ol className="modal-steps">
          <li><strong>Unzip</strong> the downloaded <code>resume-suite-extension.zip</code> to a folder on your computer.</li>
          <li>Open Chrome and go to <code>chrome://extensions</code></li>
          <li>Enable <strong>Developer mode</strong> (toggle in the top-right corner).</li>
          <li>Click <strong>Load unpacked</strong> and select the unzipped folder.</li>
          <li>
            Open the extension, click <strong>Settings</strong>, and fill in:
            <ul style={{ marginTop: 8, marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                <strong>Server URL:</strong>{' '}
                <code
                  style={{ cursor: 'pointer', userSelect: 'all' }}
                  onClick={() => navigator.clipboard.writeText(extensionUrl)}
                  title="Click to copy"
                >{extensionUrl}</code>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>(HTTP — required for extension)</span>
              </li>
              <li style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                <strong>API Token:</strong>{' '}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ display: 'inline-flex', padding: '2px 10px', fontSize: 12 }}
                  onClick={handleCopyToken}
                >
                  {copied ? '✓ Copied!' : 'Copy My Token'}
                </button>
              </li>
            </ul>
          </li>
          <li>The extension icon will appear in your toolbar. Pin it for easy access.</li>
        </ol>
        <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <a
            href="#"
            className="btn btn-ghost btn-sm"
            onClick={(e) => { e.preventDefault(); onClose(); document.querySelector('[data-ext-download]')?.click(); }}
          >
            ↓ Download again
          </a>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function HowToModal({ onClose }) {
  const steps = [
    {
      title: 'Install the Chrome Extension',
      desc: (<>Click the <strong>⬇ Extension</strong> button to download and load it into Chrome. Enables one-click job capture from any listing page.</>),
    },
    {
      title: 'Import Your Indeed Profile',
      desc: (<>Visit your <strong>Indeed Profile</strong> at <code>profile.indeed.com</code>, then click the extension icon and hit <strong>⬆ Import Indeed Profile</strong>. Your skills, experience, and credentials are saved to Sources and used to build richer Parts.</>),
    },
    {
      title: 'Add Sources',
      desc: (<>Go to <strong>Sources</strong> and upload your existing resume, job descriptions, certificates, or any reference files. Supports PDF, Word, images, and plain text.</>),
    },
    {
      title: 'Generate Parts',
      desc: (<>Visit <strong>Sources</strong> → <strong>Generate Parts</strong> to draft your resume sections — summary, skills, experience, and more — using AI built from your uploaded material.</>),
    },
    {
      title: 'Check Insights',
      desc: (<>Open the <strong>Insight</strong> tab for a personalized career assessment. The AI reads your profile and surfaces strengths, gaps, and opportunities.</>),
    },
    {
      title: 'Capture a Job Listing',
      desc: (<>On any job posting, right-click and choose <strong>Capture Job to Resume Suite</strong>. The listing is saved instantly to your account.</>),
    },
    {
      title: 'View Your Tailored Resume',
      desc: (<>Go to the <strong>Dashboard</strong>, open a listing, and run the workflow to generate and export your custom resume for that role.</>),
    },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box how-to-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>✨ Getting Started</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Follow these steps to get the most out of Resume Suite.
        </p>
        <ol className="how-to-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="how-to-num">{i + 1}</span>
              <div>
                <div className="how-to-title">{s.title}</div>
                <div className="how-to-desc">{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showExtModal, setShowExtModal] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleInstallExtension = async () => {
    // Must fetch with Bearer token — plain <a href> navigation can't send it
    try {
      const token = localStorage.getItem('rs_token');
      const res = await fetch('/api/extension/download', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'resume-suite-extension.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Extension download failed:', err.message);
    }
    setShowExtModal(true);
  };

  if (!user) return null;

  return (
    <>
      <nav className="nav">
        <div className="nav-brand-group">
          <span className="nav-brand">Resume Suite</span>
          <button
            className="btn btn-ghost btn-sm how-to-btn"
            onClick={() => setShowHowTo(true)}
            title="Getting Started"
          >
            ✨
          </button>
        </div>
        <div className="nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} end>
            Dashboard
          </NavLink>
          <NavLink to="/insight" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Insight
          </NavLink>
          <NavLink to="/ai-chat" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            AI Chat
          </NavLink>
          <NavLink to="/sources" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Sources
          </NavLink>
          {user.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Admin
            </NavLink>
          )}
          <button className="btn btn-ghost btn-sm" onClick={handleInstallExtension}>
            ⬇ Extension
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ marginLeft: 4 }}>
            Logout
          </button>
        </div>
      </nav>
      {showExtModal && <ExtensionModal onClose={() => setShowExtModal(false)} />}
      {showHowTo && <HowToModal onClose={() => setShowHowTo(false)} />}
    </>
  );
}
