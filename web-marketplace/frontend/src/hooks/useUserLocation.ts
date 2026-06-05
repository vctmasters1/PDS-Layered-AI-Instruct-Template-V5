import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

export interface UserCoords {
  lat: number
  lng: number
  source: 'profile' | 'browser'
}

/**
 * Returns the best available location for the current user.
 * Priority: logged-in user's business location > browser geolocation > null.
 * Used to sort search results by distance (closest first).
 */
export function useUserLocation(): UserCoords | null {
  const { user } = useAuth()
  const [browserCoords, setBrowserCoords] = useState<UserCoords | null>(null)

  // Use profile coords if available — no async needed
  const profileCoords: UserCoords | null =
    user?.businessLatitude && user?.businessLongitude
      ? { lat: user.businessLatitude, lng: user.businessLongitude, source: 'profile' }
      : null

  // Fall back to browser geolocation only when profile coords are absent
  useEffect(() => {
    if (profileCoords) return
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => setBrowserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'browser' }),
      () => setBrowserCoords(null),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [!!profileCoords]) // re-run only if profileCoords presence changes

  return profileCoords ?? browserCoords
}

/** Haversine distance in km between two lat/lng points */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
