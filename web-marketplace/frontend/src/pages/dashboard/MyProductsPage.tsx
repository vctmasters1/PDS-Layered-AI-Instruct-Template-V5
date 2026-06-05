import { useState, useEffect, useRef } from 'react'
import { api } from '../../api/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface MyProduct {
  id: string
  name: string
  sku: string
  category: string
  price: number
  description: string
  leadTime: number
  images: string[]
  fulfilledBy: 'self' | 'producer'
  stock: number
  active: boolean
  createdAt: string
}

const CATEGORIES = [
  'Ceramics', 'Furniture', 'Textiles', 'Jewelry', 'Art',
  'Home Goods', 'Apparel', 'Food', 'Software', 'Electronics',
  'Gizmo', 'Other',
]

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--input-bg)',
  color: 'var(--text)', boxSizing: 'border-box', marginTop: 4,
}

const LABEL_STYLE: React.CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', display: 'block' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={LABEL_STYLE}>{label}</label>{children}</div>
}

// ── Confirmation modal ────────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, maxWidth: 360, width: '90%' }}>
        <p style={{ margin: '0 0 20px', fontSize: 15 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', color: 'var(--text)' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: 'white', cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Create/Edit form ──────────────────────────────────────────────────────────

interface ProductFormData {
  name: string; sku: string; category: string; price: string
  description: string; leadTime: string; fulfilledBy: 'self' | 'producer'
  stock: string; imageUrls: string
}

const EMPTY_FORM: ProductFormData = {
  name: '', sku: '', category: 'Other', price: '', description: '',
  leadTime: '7', fulfilledBy: 'self', stock: '1', imageUrls: '',
}

function productToForm(p: MyProduct): ProductFormData {
  return {
    name: p.name, sku: p.sku, category: p.category, price: String(p.price),
    description: p.description, leadTime: String(p.leadTime),
    fulfilledBy: p.fulfilledBy, stock: String(p.stock),
    imageUrls: (p.images ?? []).join('\n'),
  }
}

function ProductForm({ initial, onSave, onCancel, saving, error }: {
  initial: ProductFormData
  onSave: (data: ProductFormData) => void
  onCancel: () => void
  saving: boolean
  error: string | null
}) {
  const [form, setForm] = useState(initial)
  const set = (k: keyof ProductFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form) }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 24 }}>
      <h3 style={{ margin: 0 }}>{initial.name ? 'Edit Product' : 'New Product'}</h3>

      {error && <div style={{ padding: '10px 14px', background: 'var(--danger)', color: 'white', borderRadius: 8, fontSize: 14 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Product Name *">
          <input value={form.name} onChange={set('name')} required style={INPUT_STYLE} placeholder="e.g. Handmade Ceramic Mug" />
        </Field>
        <Field label="SKU *">
          <input value={form.sku} onChange={set('sku')} required style={INPUT_STYLE} placeholder="e.g. MUG-001" />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label="Category">
          <select value={form.category} onChange={set('category')} style={INPUT_STYLE}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Price ($) *">
          <input value={form.price} onChange={set('price')} type="number" min="0" step="0.01" required style={INPUT_STYLE} placeholder="0.00" />
        </Field>
        <Field label="Lead Time (days)">
          <input value={form.leadTime} onChange={set('leadTime')} type="number" min="0" style={INPUT_STYLE} />
        </Field>
      </div>

      <Field label="Description *">
        <textarea value={form.description} onChange={set('description')} rows={3} required
          style={{ ...INPUT_STYLE, resize: 'vertical' }} placeholder="Describe your product…" />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Fulfilled By">
          <select value={form.fulfilledBy} onChange={set('fulfilledBy')} style={INPUT_STYLE}>
            <option value="self">Self (you ship it)</option>
            <option value="producer">Producer (bid to manufacture)</option>
          </select>
        </Field>
        {form.fulfilledBy === 'self' && (
          <Field label="Stock Quantity">
            <input value={form.stock} onChange={set('stock')} type="number" min="0" style={INPUT_STYLE} />
          </Field>
        )}
      </div>

      <Field label="Image URLs (one per line)">
        <textarea value={form.imageUrls} onChange={set('imageUrls')} rows={2}
          style={{ ...INPUT_STYLE, resize: 'vertical' }} placeholder="https://…" />
      </Field>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 12px', background: 'var(--bg)', borderRadius: 6 }}>
        ℹ️ A <strong>$1.00 listing fee</strong> is charged when publishing a new product. Fee is waived for staff accounts.
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '8px 24px' }}>
          {saving ? 'Saving…' : 'Save Product'}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', color: 'var(--text)' }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function MyProductsPage() {
  const [products, setProducts] = useState<MyProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<MyProduct | null>(null)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MyProduct | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<{ products: MyProduct[] }>('/products')
      setProducts(data.products ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function startNew() {
    setEditTarget(null)
    setFormError(null)
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function startEdit(p: MyProduct) {
    setEditTarget(p)
    setFormError(null)
    setShowForm(true)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function handleSave(form: ProductFormData) {
    setFormSaving(true); setFormError(null)
    try {
      const payload = {
        name:       form.name,
        sku:        form.sku,
        category:   form.category,
        price:      parseFloat(form.price),
        description: form.description,
        leadTime:   parseInt(form.leadTime) || 0,
        fulfilledBy: form.fulfilledBy,
        stock:      form.fulfilledBy === 'self' ? parseInt(form.stock) || 0 : 0,
        images:     form.imageUrls.split('\n').map(s => s.trim()).filter(Boolean),
      }

      if (editTarget) {
        await api.put(`/products/${editTarget.id}`, payload)
        setMsg({ type: 'success', text: 'Product updated!' })
      } else {
        await api.post('/products', payload)
        setMsg({ type: 'success', text: 'Product created!' })
      }
      setShowForm(false)
      setEditTarget(null)
      await load()
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setFormSaving(false)
    }
  }

  async function handleDelete(p: MyProduct) {
    try {
      await api.delete(`/products/${p.id}`)
      setProducts(prev => prev.filter(x => x.id !== p.id))
      setMsg({ type: 'success', text: `"${p.name}" deleted.` })
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message })
    } finally {
      setDeleteTarget(null)
    }
  }

  const displayed = products.filter(p => {
    if (filterActive === 'active' && !p.active) return false
    if (filterActive === 'inactive' && p.active) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    }
    return true
  })

  const SELECT: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--input-bg)', color: 'var(--text)', fontSize: 13,
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>My Products</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {loading ? '' : `${products.length} / 50 active listings`}
          </p>
        </div>
        <button onClick={startNew} className="btn-primary" disabled={products.length >= 50}
          style={{ padding: '8px 20px' }}>
          + New Product
        </button>
      </div>

      {msg && (
        <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 16, background: msg.type === 'success' ? 'var(--success)' : 'var(--danger)', color: 'white', fontSize: 14 }}>
          {msg.text}
          <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Form anchor */}
      <div ref={formRef} />
      {showForm && (
        <ProductForm
          initial={editTarget ? productToForm(editTarget) : EMPTY_FORM}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditTarget(null) }}
          saving={formSaving}
          error={formError}
        />
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" placeholder="Search by name, SKU…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...SELECT, flex: '1 1 160px' }} />
        <select value={filterActive} onChange={e => setFilterActive(e.target.value as typeof filterActive)} style={SELECT}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {loading ? 'Loading…' : `${displayed.length} shown`}
        </span>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 16 }}>⚠ {error}</div>}

      {!loading && displayed.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          {products.length === 0
            ? <><div style={{ fontSize: 48, marginBottom: 12 }}>📦</div><div>No products yet. Click <strong>+ New Product</strong> to create your first listing.</div></>
            : 'No products match your filters.'}
        </div>
      )}

      {/* Product table */}
      {displayed.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left' }}>
                {['Product', 'SKU', 'Category', 'Price', 'Stock', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', borderBottom: '2px solid var(--border)', fontWeight: 600, color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Lead: {p.leadTime}d · {p.fulfilledBy === 'self' ? 'Self-fulfilled' : 'Producer'}</div>
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 13 }}>{p.sku}</td>
                  <td style={{ padding: '10px 12px' }}>{p.category}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>${Number(p.price).toFixed(2)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {p.fulfilledBy === 'self' ? (
                      <span style={{ color: p.stock > 10 ? 'var(--success)' : p.stock > 0 ? 'var(--warning)' : 'var(--danger)' }}>
                        {p.stock}
                      </span>
                    ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: p.active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: p.active ? 'var(--success)' : 'var(--danger)' }}>
                      {p.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(p)}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 12, color: 'var(--text)', marginRight: 6 }}>
                      Edit
                    </button>
                    <button onClick={() => setDeleteTarget(p)}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,.4)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--danger)' }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
