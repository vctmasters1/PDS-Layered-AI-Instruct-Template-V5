/**
 * ZIP Code Geocoding Service
 * Resolves US ZIP codes to lat/lng coordinates using Nominatim (OpenStreetMap).
 * Results are cached in-memory for the server lifetime to avoid repeated lookups.
 */

// Simple in-memory cache: ZIP → { lat, lng, city, state }
const cache = new Map<string, { lat: number; lng: number; city: string; state: string } | null>();

/**
 * Geocode a US ZIP code to coordinates + city/state.
 * Returns null if the ZIP cannot be resolved.
 */
export async function geocodeZip(zip: string): Promise<{ lat: number; lng: number; city: string; state: string } | null> {
  const cleaned = (zip || "").trim().replace(/\D/g, "").substring(0, 5);
  if (cleaned.length < 5) return null;

  // Check cache first
  if (cache.has(cleaned)) {
    return cache.get(cleaned) || null;
  }

  try {
    // Use Nominatim (OpenStreetMap) — same service frontend uses for buyer location
    const url = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleaned}&country=us&limit=1`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "PipeDreamMarketplace/1.0 (marketplace@pipedreamsystems.com)",
      },
    });

    if (!resp.ok) {
      console.warn(`Nominatim returned ${resp.status} for ZIP ${cleaned}`);
      cache.set(cleaned, null);
      return null;
    }

    const results = (await resp.json()) as any[];
    if (!results || results.length === 0) {
      cache.set(cleaned, null);
      return null;
    }

    const result = results[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    // Extract city/state from display_name (format: "ZIP, City, County, State, USA")
    const parts = (result.display_name || "").split(",").map((s: string) => s.trim());
    // Nominatim for US ZIPs typically returns: "ZIP, City, County, State Abbr, USA"
    // or "ZIP, City, State, ZIP, USA" — varies, so we do best-effort parsing
    let city = "";
    let state = "";
    if (parts.length >= 4) {
      city = parts[1] || "";
      // State is usually the second-to-last before "United States"
      state = parts[parts.length - 2] || "";
    }

    const entry = { lat, lng, city, state };
    cache.set(cleaned, entry);
    return entry;
  } catch (err: any) {
    console.warn(`Failed to geocode ZIP ${cleaned}:`, err.message);
    cache.set(cleaned, null);
    return null;
  }
}

/**
 * Geocode a full address to coordinates.
 * Uses Nominatim free-text search with structured components for best accuracy.
 * Falls back to ZIP-only geocoding if address lookup fails.
 */
export async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<{ lat: number; lng: number; city: string; state: string } | null> {
  const query = [address, city, state, zip].filter(Boolean).join(", ");
  if (!query.trim()) return null;

  // Build a cache key from all components
  const cacheKey = `addr:${query.toLowerCase()}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) || null;
  }

  try {
    const params = new URLSearchParams({
      format: "json",
      q: query + ", USA",
      limit: "1",
      countrycodes: "us",
    });
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "PipeDreamMarketplace/1.0 (marketplace@pipedreamsystems.com)",
      },
    });

    if (!resp.ok) {
      console.warn(`Nominatim address search returned ${resp.status}`);
      // Fall back to ZIP geocoding
      return geocodeZip(zip);
    }

    const results = (await resp.json()) as any[];
    if (!results || results.length === 0) {
      // Fall back to ZIP geocoding
      return geocodeZip(zip);
    }

    const result = results[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    const entry = { lat, lng, city: city || "", state: state || "" };
    cache.set(cacheKey, entry);
    return entry;
  } catch (err: any) {
    console.warn(`Address geocode failed, falling back to ZIP:`, err.message);
    return geocodeZip(zip);
  }
}

/**
 * Utility endpoint: GET /v1/geo/zip/:zip
 * Returns { lat, lng, city, state } for a given ZIP code.
 * Used by the frontend for buyer-side ZIP-to-location as well.
 */
export function getGeoZipHandler() {
  return async (req: any, res: any) => {
    const { zip } = req.params;
    const result = await geocodeZip(zip);
    if (!result) {
      return res.status(404).json({ error: "ZIP code not found" });
    }
    res.json(result);
  };
}
