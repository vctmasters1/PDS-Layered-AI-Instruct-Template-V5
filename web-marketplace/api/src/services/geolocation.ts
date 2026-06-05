/**
 * GeolocationService
 * Handles location-based queries and distance calculations
 */

/** Location shape used by geolocation helpers (decoupled from ORM entities) */
export interface GeoLocation {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number;
  longitude: number;
  serviceRadius?: number;
}

/** Minimal shape required by radius/state filters */
interface GeoLocatable {
  active: boolean;
  verified: boolean;
  location: GeoLocation;
}

export class GeolocationService {
  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in miles
   */
  static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 3959; // Earth's radius in miles
    const dLat = this.degreesToRadians(lat2 - lat1);
    const dLon = this.degreesToRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degreesToRadians(lat1)) *
        Math.cos(this.degreesToRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Find designers within a radius from a location
   */
  static findDesignersByRadius<T extends GeoLocatable>(
    designers: T[],
    latitude: number,
    longitude: number,
    radiusMiles: number
  ): (T & { distance: number })[] {
    return designers
      .filter((designer) => designer.active && designer.verified)
      .map((designer) => ({
        ...designer,
        distance: this.calculateDistance(
          latitude,
          longitude,
          designer.location.latitude,
          designer.location.longitude
        ),
      }))
      .filter((designer) => designer.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Find producers within a radius from a location
   */
  static findProducersByRadius<T extends GeoLocatable>(
    producers: T[],
    latitude: number,
    longitude: number,
    radiusMiles: number
  ): (T & { distance: number })[] {
    return producers
      .filter((mfg) => mfg.active && mfg.verified)
      .map((mfg) => ({
        ...mfg,
        distance: this.calculateDistance(
          latitude,
          longitude,
          mfg.location.latitude,
          mfg.location.longitude
        ),
      }))
      .filter((mfg) => mfg.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Find designers by state
   */
  static findDesignersByState<T extends GeoLocatable>(
    designers: T[],
    state: string
  ): T[] {
    return designers.filter(
      (designer) =>
        designer.active && designer.verified && designer.location.state.toUpperCase() === state.toUpperCase()
    );
  }

  /**
   * Find producers by state
   */
  static findProducersByState<T extends GeoLocatable>(
    producers: T[],
    state: string
  ): T[] {
    return producers.filter(
      (mfg) =>
        mfg.active && mfg.verified && mfg.location.state.toUpperCase() === state.toUpperCase()
    );
  }

  /**
   * Validate and geocode a location.
   *
   * When GEOCODING_API_KEY env var is set, calls the Google Maps Geocoding API
   * to resolve real latitude/longitude from the address.  Otherwise returns the
   * address fields with null coordinates so callers can handle the unresolved
   * state explicitly (e.g. hide map pin, skip radius filter).
   */
  static async validateLocation(
    address: string,
    city: string,
    state: string,
    zipCode: string
  ): Promise<GeoLocation | null> {
    const apiKey = process.env.GEOCODING_API_KEY;

    if (apiKey) {
      try {
        const query = encodeURIComponent(`${address}, ${city}, ${state} ${zipCode}, USA`);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json() as any;
          if (data.status === "OK" && data.results?.length > 0) {
            const loc = data.results[0].geometry.location as { lat: number; lng: number };
            return { address, city, state, zipCode, country: "USA", latitude: loc.lat, longitude: loc.lng };
          }
        }
      } catch {
        // fall through to null-coord fallback
      }
    }

    // No API key or geocoding failed — return address without coordinates.
    // Callers must handle null lat/lng (skip radius filtering, hide map pin, etc.)
    return {
      address,
      city,
      state,
      zipCode,
      country: "USA",
      latitude: null as any,
      longitude: null as any,
    };
  }

  /**
   * Get map bounds for a region
   */
  static getRegionBounds(
    latitude: number,
    longitude: number,
    radiusMiles: number
  ): {
    north: number;
    south: number;
    east: number;
    west: number;
  } {
    const latDelta = radiusMiles / 69; // 1 degree latitude ≈ 69 miles
    const lonDelta = radiusMiles / (69 * Math.cos(latitude * (Math.PI / 180)));

    return {
      north: latitude + latDelta,
      south: latitude - latDelta,
      east: longitude + lonDelta,
      west: longitude - lonDelta,
    };
  }
}

export default GeolocationService;
