import { api } from '../api-client.js';

/**
 * Renders a list of artifact files with download links.
 * Used in WorkflowPanel and Sidebar.
 */
export default function FileList({ listingId, files }) {
  if (!files || files.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {files.map((filename) => (
        <a
          key={filename}
          href={api.files.url(listingId, filename)}
          className="btn btn-ghost btn-sm"
          download
          onClick={(e) => e.stopPropagation()}
          style={{ justifyContent: 'flex-start' }}
        >
          ↓ {filename}
        </a>
      ))}
    </div>
  );
}
