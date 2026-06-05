import { useState, useEffect } from 'react';
import { api } from '../api-client.js';
import ListingCard from '../components/ListingCard.jsx';

const EMPTY_FORM = { title: '', content: '' };

export default function Dashboard() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await api.listings.list();
      setListings(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (listing) => {
    if (!confirm(`Delete "${listing.title}"? This removes all artifacts.`)) return;
    try {
      await api.listings.delete(listing.id);
      setListings((prev) => prev.filter((l) => l.id !== listing.id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const listing = await api.listings.create(form.title, form.content);
      setListings((prev) => [...prev, listing]);
      setForm(EMPTY_FORM);
      setShowNew(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container" style={{ padding: '32px 20px' }}>
      <div className="page-header">
        <h1 className="page-title">Job Listings</h1>
        <button className="btn btn-primary" onClick={() => setShowNew(!showNew)}>
          {showNew ? 'Cancel' : '+ New Listing'}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {showNew && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>New Listing</h2>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label" htmlFor="new-title">Title</label>
              <input
                id="new-title" className="form-input"
                placeholder="Acme Corp — Senior Engineer"
                value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="new-content">Job Description (paste full text)</label>
              <textarea
                id="new-content" className="form-input form-textarea"
                placeholder="Paste the full job description here…"
                value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Create Listing'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : listings.length === 0 ? (
        <div className="empty-state">
          No listings yet. Create one above or use the Chrome extension to import from Indeed.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
