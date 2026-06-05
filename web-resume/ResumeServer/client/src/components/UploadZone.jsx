import { useCallback, useRef } from 'react';

export default function UploadZone({ onFile, accept = '.md,.txt', multiple = false }) {
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    files.forEach(onFile);
  }, [onFile]);

  const handleChange = (e) => {
    Array.from(e.target.files).forEach(onFile);
    e.target.value = '';
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
      style={{
        border: '2px dashed var(--border)',
        borderRadius: 'var(--radius)',
        padding: '32px',
        textAlign: 'center',
        cursor: 'pointer',
        color: 'var(--text-dim)',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>+</div>
      <div style={{ fontSize: 14 }}>Drop files here or click to upload</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>{accept} · max 2 MB</div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}
