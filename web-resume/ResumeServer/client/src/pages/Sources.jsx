import { useState, useEffect, useCallback } from 'react';
import { api } from '../api-client.js';
import UploadZone from '../components/UploadZone.jsx';
import FileEditor from '../components/FileEditor.jsx';

// ─── Generate Parts status machine ───────────────────────────────────────────
// 'idle' | 'running' | 'done' | 'error'

export default function Sources() {
  const [sources, setSources]           = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [editingSource, setEditingSource]   = useState(null);
  const [uploading, setUploading]           = useState(false);

  const [parts, setParts]               = useState([]);
  const [partsLoading, setPartsLoading] = useState(true);
  const [editingPart, setEditingPart]   = useState(null);

  const [manifest, setManifest]         = useState([]);

  const [genState, setGenState]         = useState('idle');
  const [genJobId, setGenJobId]         = useState(null);
  const [genError, setGenError]         = useState('');

  // ─── Analyze Skills state ──────────────────────────────────────────────────
  const [otherFiles, setOtherFiles]         = useState([]);
  const [otherLoading, setOtherLoading]     = useState(true);
  const [otherUploading, setOtherUploading] = useState(false);
  const [skillsState, setSkillsState]       = useState('idle'); // 'idle'|'running'|'done'|'error'
  const [skillsJobId, setSkillsJobId]       = useState(null);
  const [skillsError, setSkillsError]       = useState('');
  const [skillsResult, setSkillsResult]     = useState(null);   // string | null
  const [editingSkills, setEditingSkills]   = useState(false);

  // ─── Template state ────────────────────────────────────────────────────────
  const [templateFiles, setTemplateFiles]         = useState([]);
  const [templateLoading, setTemplateLoading]     = useState(true);
  const [templateUploading, setTemplateUploading] = useState(false);
  const [tmplState, setTmplState]                 = useState('idle');
  const [tmplJobId, setTmplJobId]                 = useState(null);
  const [tmplError, setTmplError]                 = useState('');
  const [tmplNotes, setTmplNotes]                 = useState(null);
  const [editingTmplNotes, setEditingTmplNotes]   = useState(false);

  // ─── Loaders ───────────────────────────────────────────────────────────────

  const loadSources = useCallback(async () => {
    try {
      setSources(await api.sources.list());
    } catch {
      // leave previous state on error
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  const loadParts = useCallback(async () => {
    try {
      setParts(await api.parts.list());
    } catch {
      // leave previous state on error
    } finally {
      setPartsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
    loadParts();
    api.sources.manifest().then(setManifest).catch(() => {});
    // Load 'other' files and any existing skills analysis
    api.sources.other.list().then(setOtherFiles).catch(() => {}).finally(() => setOtherLoading(false));
    api.sources.getSkillsAnalysis().then((c) => { if (c) setSkillsResult(c); }).catch(() => {});
    api.sources.template.list().then(setTemplateFiles).catch(() => {}).finally(() => setTemplateLoading(false));
    api.sources.template.getNotes().then((c) => { if (c) setTmplNotes(c); }).catch(() => {});
  }, [loadSources, loadParts]);

  // ─── Job polling ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (genState !== 'running' || !genJobId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await api.sources.buildPartsStatus(genJobId);
        if (cancelled) return;
        if (data.status === 'done') {
          setGenState('done');
          loadParts();
        } else if (data.status === 'error') {
          setGenError(data.error ?? 'Generation failed.');
          setGenState('error');
        } else {
          if (!cancelled) setTimeout(poll, 3000);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 5000);
      }
    };

    const t = setTimeout(poll, 2000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [genState, genJobId, loadParts]);

  // ─── Analyze Skills polling ────────────────────────────────────────────────

  useEffect(() => {
    if (skillsState !== 'running' || !skillsJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await api.sources.analyzeSkillsStatus(skillsJobId);
        if (cancelled) return;
        if (data.status === 'done') {
          setSkillsState('done');
          api.sources.getSkillsAnalysis().then((c) => { if (c) setSkillsResult(c); }).catch(() => {});
        } else if (data.status === 'error') {
          setSkillsError(data.error ?? 'Analysis failed.');
          setSkillsState('error');
        } else {
          if (!cancelled) setTimeout(poll, 3000);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 5000);
      }
    };
    const t = setTimeout(poll, 2000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [skillsState, skillsJobId]);

  // ─── Source file handlers ──────────────────────────────────────────────────

  const handleUpload = async (file) => {
    if (file.size > 2 * 1024 * 1024) { alert('File must be under 2 MB.'); return; }
    setUploading(true);
    try {
      await api.sources.upload(file);
      await loadSources();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSource = async (filename) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await api.sources.delete(filename);
      setSources((prev) => prev.filter((f) => f !== filename));
      if (editingSource === filename) setEditingSource(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUploadOther = async (file) => {
    if (file.size > 2 * 1024 * 1024) { alert('File must be under 2 MB.'); return; }
    setOtherUploading(true);
    try {
      await api.sources.other.upload(file);
      setOtherFiles(await api.sources.other.list());
    } catch (err) {
      alert(err.message);
    } finally {
      setOtherUploading(false);
    }
  };

  const handleDeleteOther = async (filename) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await api.sources.other.delete(filename);
      setOtherFiles((prev) => prev.filter((f) => f !== filename));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAnalyzeSkills = async () => {
    setSkillsState('running');
    setSkillsError('');
    try {
      const { jobId } = await api.sources.analyzeSkills();
      setSkillsJobId(jobId);
    } catch (err) {
      setSkillsError(err.message);
      setSkillsState('error');
    }
  };

  // ─── Template polling ──────────────────────────────────────────────────────

  useEffect(() => {
    if (tmplState !== 'running' || !tmplJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await api.sources.template.analyzeStatus(tmplJobId);
        if (cancelled) return;
        if (data.status === 'done') {
          setTmplState('done');
          api.sources.template.getNotes().then((c) => { if (c) setTmplNotes(c); }).catch(() => {});
        } else if (data.status === 'error') {
          setTmplError(data.error ?? 'Analysis failed.');
          setTmplState('error');
        } else {
          if (!cancelled) setTimeout(poll, 3000);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 5000);
      }
    };
    const t = setTimeout(poll, 2000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tmplState, tmplJobId]);

  const handleUploadTemplate = async (file) => {
    if (file.size > 15 * 1024 * 1024) { alert('File must be under 15 MB.'); return; }
    setTemplateUploading(true);
    try {
      await api.sources.template.upload(file);
      setTemplateFiles(await api.sources.template.list());
    } catch (err) {
      alert(err.message);
    } finally {
      setTemplateUploading(false);
    }
  };

  const handleDeleteTemplate = async (filename) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await api.sources.template.delete(filename);
      setTemplateFiles((prev) => prev.filter((f) => f !== filename));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAnalyzeTemplate = async () => {
    setTmplState('running');
    setTmplError('');
    try {
      const { jobId } = await api.sources.template.analyze();
      setTmplJobId(jobId);
    } catch (err) {
      setTmplError(err.message);
      setTmplState('error');
    }
  };

  // ─── Generate Parts handler ────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (parts.length > 0) {
      const msg = `This will overwrite ${parts.length} existing Part${parts.length === 1 ? '' : 's'}.\n\nExisting Parts will be used as a baseline — the LLM will preserve and improve them rather than starting from scratch.\n\nContinue?`;
      if (!confirm(msg)) return;
    }
    setGenState('running');
    setGenError('');
    try {
      const { jobId } = await api.sources.buildParts();
      setGenJobId(jobId);
    } catch (err) {
      setGenError(err.message);
      setGenState('error');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const manifestCount = manifest.length || 10;

  return (
    <div className="container" style={{ padding: '32px 20px', maxWidth: 900 }}>

      {/* ── Source Documents ─────────────────────────────────────────────── */}
      <div className="page-header">
        <h1 className="page-title">Source Documents</h1>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
        Upload your original documents — CV, old resume, LinkedIn text export, etc. These are
        the raw inputs the AI reads to generate your Resume Parts. Accepted formats: <code>.md</code>, <code>.txt</code>.
      </p>

      <div style={{ marginBottom: 20 }}>
        <UploadZone onFile={handleUpload} accept=".md,.txt" multiple />
        {uploading && (
          <div style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: 13 }}>Uploading…</div>
        )}
      </div>

      {sourcesLoading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : sources.length === 0 ? (
        <div className="empty-state" style={{ marginBottom: 32 }}>
          No source documents yet — upload at least one to enable Part generation.
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 32 }}>
          {sources.map((f, i) => (
            <div key={f}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: editingSource !== f && i < sources.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ fontSize: 14 }}>{f}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditingSource(editingSource === f ? null : f)}
                  >
                    {editingSource === f ? 'Close' : 'Edit'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => handleDeleteSource(f)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {editingSource === f && (
                <FileEditor
                  filename={f}
                  onFetch={() => api.sources.getContent(f)}
                  onSave={(content) => api.sources.updateContent(f, content)}
                  onClose={() => setEditingSource(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Resume Template ──────────────────────────────────────────────── */}
      <div style={{ borderTop: '2px solid var(--border)', paddingTop: 32, marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Resume Template</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Upload one or more example resumes you like — <code>.docx</code>, <code>.pdf</code>, or <code>.txt</code>.
          The first <code>.docx</code> file you upload is used directly as the style template when building your final document (fonts, spacing, and heading styles will match).
          Click <strong>Analyze Style</strong> to have the AI read your examples and generate a writing-style guide that shapes all future drafts.
        </p>

        <div style={{ marginBottom: 16 }}>
          <UploadZone onFile={handleUploadTemplate} accept=".docx,.pdf,.md,.txt" multiple />
          {templateUploading && (
            <div style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: 13 }}>Uploading…</div>
          )}
        </div>

        {!templateLoading && templateFiles.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            {templateFiles.map((f, i) => (
              <div
                key={f}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: i < templateFiles.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div>
                  <span style={{ fontSize: 14 }}>{f}</span>
                  {f.endsWith('.docx') && i === templateFiles.indexOf(templateFiles.find((x) => x.endsWith('.docx'))) && (
                    <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 8 }}>★ active style template</span>
                  )}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => handleDeleteTemplate(f)}
                >Delete</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <button
            className="btn btn-primary"
            onClick={handleAnalyzeTemplate}
            disabled={templateFiles.length === 0 || tmplState === 'running'}
          >
            {tmplState === 'running' ? 'Analyzing…' : tmplNotes ? 'Re-analyze Style' : 'Analyze Style'}
          </button>
          {tmplState === 'running' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 13 }}>
              <span className="spinner" /> Reading templates and inferring style…
            </span>
          )}
          {tmplState === 'done' && (
            <span style={{ fontSize: 13, color: '#22c55e' }}>✓ Style guide generated — see below.</span>
          )}
          {tmplState === 'error' && (
            <span style={{ fontSize: 13, color: 'var(--danger)' }}>✗ {tmplError}</span>
          )}
        </div>

        {tmplNotes !== null && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>template-notes.md</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingTmplNotes(!editingTmplNotes)}>
                {editingTmplNotes ? 'Close' : 'Edit'}
              </button>
            </div>
            {editingTmplNotes ? (
              <FileEditor
                filename="template-notes.md"
                onFetch={() => api.sources.template.getNotes()}
                onSave={(content) => { api.sources.template.updateNotes(content); setTmplNotes(content); }}
                onClose={() => setEditingTmplNotes(false)}
              />
            ) : (
              <pre style={{
                background: 'var(--surface-alt, #f8fafc)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '12px 16px',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 400,
                overflowY: 'auto',
              }}>{tmplNotes}</pre>
            )}
          </div>
        )}
      </div>

      {/* ── Analyze For Skills ───────────────────────────────────────────── */}
      <div style={{ borderTop: '2px solid var(--border)', paddingTop: 32, marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Analyze For Skills</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Drop any documents here — code files, emails, project notes, anything text-based.
          The AI will read them and extract a comprehensive skills profile. Results are saved
          and can be edited below.
        </p>

        <div style={{ marginBottom: 16 }}>
          <UploadZone
            onFile={handleUploadOther}
            accept=".md,.txt,.js,.ts,.jsx,.tsx,.py,.rb,.go,.rs,.java,.cs,.cpp,.c,.h,.html,.css,.json,.yaml,.yml,.sh,.ps1,.sql,.eml,.csv"
            multiple
          />
          {otherUploading && (
            <div style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: 13 }}>Uploading…</div>
          )}
        </div>

        {!otherLoading && otherFiles.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            {otherFiles.map((f, i) => (
              <div
                key={f}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: i < otherFiles.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 14 }}>{f}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => handleDeleteOther(f)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <button
            className="btn btn-primary"
            onClick={handleAnalyzeSkills}
            disabled={otherFiles.length === 0 || skillsState === 'running'}
          >
            {skillsState === 'running' ? 'Analyzing…' : skillsResult ? 'Re-analyze' : 'Analyze'}
          </button>
          {skillsState === 'running' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 13 }}>
              <span className="spinner" />
              Reading documents and extracting skills…
            </span>
          )}
          {skillsState === 'done' && (
            <span style={{ fontSize: 13, color: '#22c55e' }}>✓ Analysis complete — see results below.</span>
          )}
          {skillsState === 'error' && (
            <span style={{ fontSize: 13, color: 'var(--danger)' }}>✗ {skillsError}</span>
          )}
        </div>

        {skillsResult !== null && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>skills-analysis.md</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingSkills(!editingSkills)}
              >
                {editingSkills ? 'Close' : 'Edit'}
              </button>
            </div>
            {editingSkills ? (
              <FileEditor
                filename="skills-analysis.md"
                onFetch={() => api.sources.getSkillsAnalysis()}
                onSave={(content) => { api.sources.updateSkillsAnalysis(content); setSkillsResult(content); }}
                onClose={() => setEditingSkills(false)}
              />
            ) : (
              <pre style={{
                background: 'var(--surface-alt, #f8fafc)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '12px 16px',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 400,
                overflowY: 'auto',
              }}>{skillsResult}</pre>
            )}
          </div>
        )}
      </div>

      {/* ── Generate Parts ───────────────────────────────────────────────── */}
      <div style={{ borderTop: '2px solid var(--border)', paddingTop: 32, marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Generate Parts</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          The AI will read all source documents and write each of the {manifestCount} standard Resume Parts.
          If a Part already exists it will be used as a starting point and preserved — only new or improved
          information from the sources is merged in. This takes several minutes.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={sources.length === 0 || genState === 'running'}
          >
            {genState === 'running'
              ? 'Generating…'
              : (genState === 'done' || parts.length > 0)
                ? 'Re-generate Parts'
                : 'Generate Parts'}
          </button>

          {genState === 'running' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 13 }}>
              <span className="spinner" />
              Processing {manifestCount} parts — this may take several minutes…
            </span>
          )}
          {genState === 'done' && (
            <span style={{ fontSize: 13, color: '#22c55e' }}>
              ✓ Parts generated — scroll down to review and edit.
            </span>
          )}
          {genState === 'error' && (
            <span style={{ fontSize: 13, color: 'var(--danger)' }}>
              ✗ {genError}
            </span>
          )}
        </div>
      </div>

      {/* ── Resume Parts ─────────────────────────────────────────────────── */}
      <div style={{ borderTop: '2px solid var(--border)', paddingTop: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Resume Parts</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
          Review and edit the generated Parts. These building blocks are used when generating
          tailored resumes from job listings.
        </p>

        {partsLoading ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : parts.length === 0 ? (
          <div className="empty-state">
            No Parts yet — generate them above or upload directly on the{' '}
            <a href="/parts" style={{ color: 'var(--primary, #2563eb)' }}>Parts page</a>.
          </div>
        ) : (
          <div className="card">
            {parts.map((f, i) => {
              const meta = manifest.find((m) => m.filename === f);
              return (
                <div key={f}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: editingPart !== f && i < parts.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{f}</span>
                      {meta && (
                        <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 10 }}>
                          {meta.name}
                        </span>
                      )}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditingPart(editingPart === f ? null : f)}
                    >
                      {editingPart === f ? 'Close' : 'Edit'}
                    </button>
                  </div>
                  {editingPart === f && (
                    <FileEditor
                      filename={f}
                      onFetch={() => api.parts.getContent(f)}
                      onSave={(content) => api.parts.updateContent(f, content)}
                      onClose={() => setEditingPart(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
