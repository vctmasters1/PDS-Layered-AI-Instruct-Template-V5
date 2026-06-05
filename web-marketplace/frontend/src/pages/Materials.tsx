import { useState, useMemo } from 'react'
import { useAsyncData } from '../hooks/useAsyncData'
import { fetchProducts, fetchMaterialListings, type SupplierMaterialListing } from '../api/search'
import { ProductCard } from '../components/cards/ProductCard'
import { useUserLocation, haversineKm } from '../hooks/useUserLocation'

type MatCategory = { icon: string; label: string; key: string; keywords: string[] }

const MATERIAL_CATEGORIES: MatCategory[] = [
  // 3D Printing & Digital Fabrication
  { icon: '🧵', label: 'FDM Filament',         key: 'fdm-filament',     keywords: ['filament', 'pla', 'petg', 'abs', 'tpu', 'asa', 'nylon'] },
  { icon: '🪣', label: 'Resin (SLA/MSLA)',      key: 'resin',            keywords: ['resin', 'sla', 'msla', 'dlp'] },
  { icon: '🖨️', label: 'SLS / Powder',          key: 'sls-powder',       keywords: ['sls', 'powder', 'sintering'] },
  // Electronics
  { icon: '🔌', label: 'Electronic Components', key: 'electronics',      keywords: ['component', 'resistor', 'capacitor', 'ic', 'transistor', 'diode', 'mosfet'] },
  { icon: '🟩', label: 'PCB & PCB Blanks',      key: 'pcb',              keywords: ['pcb', 'circuit board', 'fr4', 'copper clad'] },
  { icon: '🔋', label: 'Batteries & Power',     key: 'batteries',        keywords: ['battery', 'batteries', 'lipo', 'liion', 'li-ion', 'power cell'] },
  { icon: '📡', label: 'Sensors & Modules',     key: 'sensors',          keywords: ['sensor', 'module', 'arduino', 'esp', 'raspberry', 'breakout'] },
  { icon: '🔗', label: 'Wire & Cable',          key: 'wire',             keywords: ['wire', 'cable', 'hookup', 'coax', 'ethernet', 'awg'] },
  { icon: '🔩', label: 'Connectors & Pins',     key: 'connectors',       keywords: ['connector', 'header', 'terminal', 'jst', 'dupont', 'pin'] },
  // Wood & Lumber
  { icon: '🪵', label: 'Hardwood Lumber',       key: 'hardwood',         keywords: ['hardwood', 'oak', 'maple', 'walnut', 'cherry', 'birch', 'ash'] },
  { icon: '🌲', label: 'Softwood Lumber',       key: 'softwood',         keywords: ['softwood', 'pine', 'cedar', 'fir', 'spruce', '2x4', '2x6'] },
  { icon: '🗂️', label: 'Plywood & Sheet Wood',  key: 'plywood',          keywords: ['plywood', 'sheet wood', 'osb', 'lauan'] },
  { icon: '📋', label: 'MDF / Particle Board',  key: 'mdf',              keywords: ['mdf', 'particle board', 'particleboard', 'medium density'] },
  { icon: '🪚', label: 'Veneers & Trim',        key: 'veneer',           keywords: ['veneer', 'trim', 'molding', 'dowel', 'edge banding'] },
  // Construction & Building
  { icon: '🧱', label: 'Bricks & Masonry',      key: 'masonry',          keywords: ['brick', 'block', 'masonry', 'cinder', 'concrete block', 'stone'] },
  { icon: '🪨', label: 'Concrete & Cement',     key: 'concrete',         keywords: ['concrete', 'cement', 'mortar', 'grout', 'quikrete'] },
  { icon: '⛏️', label: 'Sand & Gravel',         key: 'sand-gravel',      keywords: ['sand', 'gravel', 'aggregate', 'pea gravel', 'crushed stone'] },
  { icon: '🏗️', label: 'Steel & Rebar',         key: 'steel-rebar',      keywords: ['steel', 'rebar', 'angle iron', 'i-beam', 'channel', 'tube steel'] },
  { icon: '🧊', label: 'Insulation',            key: 'insulation',       keywords: ['insulation', 'foam board', 'fiberglass', 'rockwool', 'spray foam'] },
  { icon: '🏠', label: 'Roofing Materials',     key: 'roofing',          keywords: ['roofing', 'shingle', 'underlayment', 'flashing', 'felt'] },
  // Landscaping & Garden
  { icon: '🌿', label: 'Mulch & Wood Chips',    key: 'mulch',            keywords: ['mulch', 'wood chip', 'bark', 'compost mulch'] },
  { icon: '🌱', label: 'Topsoil & Compost',     key: 'topsoil',          keywords: ['topsoil', 'compost', 'soil', 'loam', 'peat'] },
  { icon: '🪨', label: 'Decorative Rock',       key: 'deco-rock',        keywords: ['decorative rock', 'landscaping rock', 'river rock', 'pebble', 'flagstone'] },
  { icon: '🌾', label: 'Sod, Seed & Plants',   key: 'sod-seed',         keywords: ['sod', 'seed', 'grass seed', 'plant', 'shrub', 'sapling'] },
  // Hardware & Fasteners
  { icon: '🔩', label: 'Screws, Bolts & Nuts',  key: 'fasteners',        keywords: ['screw', 'bolt', 'nut', 'washer', 'fastener', 'lag', 'hex'] },
  { icon: '⚓', label: 'Anchors & Inserts',     key: 'anchors',          keywords: ['anchor', 'insert', 'toggle bolt', 'mollybolt', 'sleeve anchor'] },
  { icon: '🔧', label: 'Brackets & Hardware',   key: 'brackets',         keywords: ['bracket', 'hinge', 'latch', 'handle', 'pull', 'joist hanger'] },
  // Finishing & Coatings
  { icon: '🎨', label: 'Paint & Primer',        key: 'paint',            keywords: ['paint', 'primer', 'latex', 'enamel', 'acrylic paint'] },
  { icon: '🪵', label: 'Stain & Sealer',        key: 'stain',            keywords: ['stain', 'sealer', 'varnish', 'polyurethane', 'lacquer', 'shellac'] },
  { icon: '🫙', label: 'Epoxy & Adhesive',      key: 'epoxy',            keywords: ['epoxy', 'adhesive', 'glue', 'construction adhesive', 'liquid nails'] },
  { icon: '🧴', label: 'Caulk & Sealants',      key: 'caulk',            keywords: ['caulk', 'sealant', 'silicone', 'weatherstrip'] },
  // Metals & Sheet Stock
  { icon: '🪙', label: 'Sheet Metal',           key: 'sheet-metal',      keywords: ['sheet metal', 'aluminum sheet', 'galvanized', 'steel sheet', 'stainless'] },
  { icon: '🔩', label: 'Bar & Tube Stock',      key: 'bar-stock',        keywords: ['bar stock', 'round bar', 'square tube', 'flat bar', 'aluminum bar'] },
  { icon: '🌀', label: 'Wire Stock & Mesh',     key: 'wire-mesh',        keywords: ['wire mesh', 'hardware cloth', 'expanded metal', 'screen', 'chicken wire'] },
  // Plastics & Composites
  { icon: '🧪', label: 'Acrylic / Plexiglass',  key: 'acrylic',          keywords: ['acrylic', 'plexiglass', 'perspex', 'cast acrylic'] },
  { icon: '🟦', label: 'PVC & HDPE Stock',      key: 'pvc-hdpe',         keywords: ['pvc', 'hdpe', 'polypropylene', 'nylon rod', 'delrin'] },
  { icon: '✈️', label: 'Carbon Fiber / FRP',    key: 'carbon-fiber',     keywords: ['carbon fiber', 'carbon fibre', 'fiberglass', 'frp', 'composite'] },
  { icon: '🧽', label: 'Foam & Foam Board',     key: 'foam',             keywords: ['foam', 'foam board', 'XPS', 'EPS', 'closed cell', 'open cell'] },
  // Textiles & Soft Goods
  { icon: '🧶', label: 'Fabric & Cloth',        key: 'fabric',           keywords: ['fabric', 'cloth', 'canvas', 'muslin', 'cotton', 'polyester fabric'] },
  { icon: '🛋️', label: 'Foam & Padding',        key: 'upholstery-foam',  keywords: ['upholstery foam', 'batting', 'padding', 'cushion foam'] },
  { icon: '🧣', label: 'Leather & Vinyl',       key: 'leather',          keywords: ['leather', 'vinyl', 'faux leather', 'pleather'] },
  // Chemicals & Raw Materials
  { icon: '🧪', label: 'Resins & Polymers',     key: 'resins-polymers',  keywords: ['casting resin', 'polyurethane foam', 'polymer', 'two part'] },
  { icon: '💧', label: 'Solvents & Cleaners',   key: 'solvents',         keywords: ['solvent', 'acetone', 'mineral spirits', 'denatured alcohol', 'cleaner'] },
  { icon: '🔶', label: 'Rubber & Silicone',     key: 'rubber-silicone',  keywords: ['rubber', 'silicone sheet', 'silicone tubing', 'neoprene', 'o-ring'] },
  // Abrasives & Consumables
  { icon: '🟫', label: 'Sandpaper & Abrasives', key: 'abrasives',        keywords: ['sandpaper', 'abrasive', 'grinding wheel', 'sanding disc', 'flap disc'] },
  { icon: '🔪', label: 'Cutting Blades & Bits', key: 'cutting',          keywords: ['blade', 'drill bit', 'router bit', 'end mill', 'saw blade', 'cutting disk'] },
  // Tools & Equipment (sourcing)
  { icon: '🔨', label: 'Hand Tools',            key: 'hand-tools',       keywords: ['hand tool', 'hammer', 'wrench', 'chisel', 'pliers', 'screwdriver'] },
  { icon: '⚙️', label: 'Power Tools',           key: 'power-tools',      keywords: ['power tool', 'drill', 'saw', 'grinder', 'router', 'sander'] },
  { icon: '🦺', label: 'Safety Equipment',      key: 'safety',           keywords: ['safety', 'ppe', 'gloves', 'goggles', 'respirator', 'hard hat', 'ear protection'] },
]

export function Materials() {
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const userLocation = useUserLocation()
  const { data, loading, error } = useAsyncData(() => fetchProducts({ limit: 200 }), [])
  const { data: mlData } = useAsyncData(() => fetchMaterialListings({ limit: 100 }), [])

  const activeCat = MATERIAL_CATEGORIES.find(c => c.key === selected)

  const visibleCategories = useMemo(() =>
    !search.trim()
      ? MATERIAL_CATEGORIES
      : MATERIAL_CATEGORIES.filter(c => c.label.toLowerCase().includes(search.toLowerCase())),
    [search]
  )

  // Filter keyword-matched product listings
  const filteredProducts = useMemo(() => {
    let list = data?.results ?? []
    if (activeCat) {
      const kws = activeCat.keywords
      list = list.filter(p => kws.some(kw => (p.category ?? '').toLowerCase().includes(kw) || p.name.toLowerCase().includes(kw)))
    } else {
      // When no category selected, show only product-type listings that match any material keyword
      const allKeywords = MATERIAL_CATEGORIES.flatMap(c => c.keywords)
      list = list.filter(p => allKeywords.some(kw => (p.category ?? '').toLowerCase().includes(kw) || p.name.toLowerCase().includes(kw)))
    }
    if (search.trim() && !activeCat) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q))
    }
    if (userLocation) {
      list = [...list].sort((a, b) => {
        const da = a.designerLatitude && a.designerLongitude ? haversineKm(userLocation.lat, userLocation.lng, Number(a.designerLatitude), Number(a.designerLongitude)) : Infinity
        const db = b.designerLatitude && b.designerLongitude ? haversineKm(userLocation.lat, userLocation.lng, Number(b.designerLatitude), Number(b.designerLongitude)) : Infinity
        return da - db
      })
    }
    return list
  }, [data, activeCat, search, userLocation])

  // Filter supplier material listings by search/category
  const filteredSupplierListings = useMemo<SupplierMaterialListing[]>(() => {
    let list = mlData?.listings ?? []
    if (activeCat) {
      const kws = activeCat.keywords.map(k => k.toLowerCase())
      list = list.filter(l =>
        l.materialTypes.some(t => kws.some(kw => t.toLowerCase().includes(kw))) ||
        kws.some(kw => l.title.toLowerCase().includes(kw))
      )
    }
    if (search.trim() && !activeCat) {
      const q = search.toLowerCase()
      list = list.filter(l =>
        l.title.toLowerCase().includes(q) ||
        l.materialTypes.some(t => t.toLowerCase().includes(q)) ||
        l.description.toLowerCase().includes(q)
      )
    }
    if (userLocation) {
      list = [...list].sort((a, b) => {
        const da = a.seller.lat && a.seller.lng ? haversineKm(userLocation.lat, userLocation.lng, a.seller.lat, a.seller.lng) : Infinity
        const db = b.seller.lat && b.seller.lng ? haversineKm(userLocation.lat, userLocation.lng, b.seller.lat, b.seller.lng) : Infinity
        return da - db
      })
    }
    return list
  }, [mlData, activeCat, search, userLocation])

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700 }}>Materials & Supplies</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
          Source raw materials, components, and supplies from local and online sellers.
        </p>
      </div>

      {/* Search + clear */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="search" placeholder="Search categories or materials…" value={search}
          onChange={e => { setSearch(e.target.value); if (selected) setSelected(null) }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', flex: '1 1 200px', minWidth: 140 }}
        />
        {selected && (
          <button onClick={() => setSelected(null)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', cursor: 'pointer', fontSize: 13 }}>
            ✕ Clear filter
          </button>
        )}
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, alignSelf: 'center' }}>
          {loading ? 'Loading…' : `${filteredProducts.length} listing${filteredProducts.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Category grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 28 }}>
        {visibleCategories.map(c => (
          <button key={c.key} onClick={() => setSelected(s => s === c.key ? null : c.key)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '14px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
              border: selected === c.key ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: selected === c.key ? 'rgba(37,99,235,0.08)' : 'var(--card-bg)',
              color: selected === c.key ? 'var(--primary)' : 'var(--text)',
              fontWeight: selected === c.key ? 700 : 400,
              fontSize: 12, transition: 'all 0.15s', lineHeight: 1.3,
            }}>
            <span style={{ fontSize: 22 }}>{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 16 }}>⚠ {error}</div>}

      {/* Results */}
      {!loading && filteredProducts.length === 0 ? (
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: 40, textAlign: 'center', background: 'var(--card-bg)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{activeCat?.icon ?? '📦'}</div>
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>
            {activeCat ? `No ${activeCat.label} listings yet` : 'No material listings found'}
          </h3>
          <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14 }}>
            Be the first to list materials in this category.
          </p>
          <button className="btn-primary" style={{ padding: '10px 24px', fontSize: 14 }}
            onClick={() => alert('Material listing coming soon!')}>
            List Your Materials
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 280, background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)' }} />
              ))
            : filteredProducts.map(p => <ProductCard key={p.id} product={p} />)
          }
        </div>
      )}

      {/* ── Supplier Listings (from MaterialListing entity) ──────────────── */}
      {filteredSupplierListings.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>🧱 From Suppliers</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
            Raw materials, components, and inputs listed directly by verified suppliers.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filteredSupplierListings.map(l => (
              <div key={l.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column' }}>
                {l.imageUrl
                  ? <img src={l.imageUrl} alt={l.title} style={{ width: '100%', height: 140, objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  : <div style={{ height: 60, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🧱</div>
                }
                <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                    <strong style={{ fontSize: 15, lineHeight: 1.3 }}>{l.title}</strong>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0, background: l.condition === 'new' ? 'rgba(34,197,94,.15)' : l.condition === 'surplus' ? 'rgba(234,179,8,.15)' : 'rgba(99,102,241,.15)' }}>
                      {l.condition}
                    </span>
                  </div>
                  {l.materialTypes.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {l.materialTypes.map(t => (
                        <span key={t} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{t}</span>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {l.description}
                  </p>
                  <div style={{ display: 'flex', gap: 12, fontSize: 13, flexWrap: 'wrap', marginTop: 4 }}>
                    <span style={{ fontWeight: 700 }}>${l.pricePerUnit.toFixed(2)}<span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>/{l.unit}</span></span>
                    <span style={{ color: 'var(--text-secondary)' }}>Qty: {Number(l.amountAvailable).toLocaleString()}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>Lead: {l.leadTimeDays}d</span>
                  </div>
                  {l.seller.businessName && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      🏪 {l.seller.businessName}{l.seller.city ? ` · ${l.seller.city}${l.seller.state ? `, ${l.seller.state}` : ''}` : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
