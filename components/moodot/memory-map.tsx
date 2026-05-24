"use client"

import { useEffect, useRef, useState } from "react"
import type { LeafletMouseEvent, Map as LeafletMap, Marker as LeafletMarker } from "leaflet"
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png"
import markerIcon from "leaflet/dist/images/marker-icon.png"
import markerShadow from "leaflet/dist/images/marker-shadow.png"

type LeafletModule = typeof import("leaflet")
type StaticImageLike = { src: string }

type MemoryMapProps = {
  lat: number | null
  lng: number | null
  onLocationSelect?: (lat: number, lng: number) => void | Promise<void>
  readOnly?: boolean
  loadingLabel?: string
}

const DEFAULT_CENTER: [number, number] = [37.5665, 126.978]
const DEFAULT_ZOOM = 12
const SELECTED_ZOOM = 15
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
const TILE_ATTRIBUTION = "&copy; OpenStreetMap contributors"

let leafletPromise: Promise<LeafletModule> | null = null
let leafletIconsConfigured = false

function resolveAssetUrl(asset: string | StaticImageLike) {
  return typeof asset === "string" ? asset : asset.src
}

function configureLeafletIcons(leaflet: LeafletModule) {
  if (leafletIconsConfigured) return

  delete (leaflet.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
  leaflet.Icon.Default.mergeOptions({
    iconRetinaUrl: resolveAssetUrl(markerIcon2x),
    iconUrl: resolveAssetUrl(markerIcon),
    shadowUrl: resolveAssetUrl(markerShadow),
  })

  leafletIconsConfigured = true
}

function loadLeaflet() {
  if (!leafletPromise) {
    leafletPromise = import("leaflet").then((leaflet) => {
      configureLeafletIcons(leaflet)
      return leaflet
    })
  }

  return leafletPromise
}

export function MemoryMap({
  lat,
  lng,
  onLocationSelect,
  readOnly = false,
  loadingLabel = "지도 로딩 중...",
}: MemoryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<LeafletMarker | null>(null)
  const locationRef = useRef({ lat, lng })
  const onLocationSelectRef = useRef(onLocationSelect)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    locationRef.current = { lat, lng }
  }, [lat, lng])

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect
  }, [onLocationSelect])

  useEffect(() => {
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null
    let animationFrame: number | null = null
    const sizeTimers: number[] = []

    const initMap = async () => {
      if (!containerRef.current || mapRef.current) return
      setIsLoading(true)

      try {
        const leaflet = await loadLeaflet()
        if (cancelled || !containerRef.current) return

        const currentLocation = locationRef.current
        const hasLocation = currentLocation.lat !== null && currentLocation.lng !== null
        const center: [number, number] = hasLocation
          ? [currentLocation.lat!, currentLocation.lng!]
          : DEFAULT_CENTER

        const map = leaflet
          .map(containerRef.current, {
            zoomControl: true,
            dragging: !readOnly,
            scrollWheelZoom: !readOnly,
            doubleClickZoom: !readOnly,
            boxZoom: !readOnly,
            keyboard: !readOnly,
          })
          .setView(center, hasLocation ? SELECTED_ZOOM : DEFAULT_ZOOM)

        mapRef.current = map
        const invalidateMapSize = () => {
          if (!cancelled) map.invalidateSize({ animate: false })
        }

        leaflet
          .tileLayer(TILE_URL, {
            attribution: TILE_ATTRIBUTION,
            maxZoom: 19,
          })
          .addTo(map)

        if (hasLocation) {
          markerRef.current = leaflet.marker(center).addTo(map)
        }

        if (!readOnly) {
          map.on("click", (event: LeafletMouseEvent) => {
            const nextLat = event.latlng.lat
            const nextLng = event.latlng.lng
            const nextPosition: [number, number] = [nextLat, nextLng]

            if (!markerRef.current) {
              markerRef.current = leaflet.marker(nextPosition).addTo(map)
            } else {
              markerRef.current.setLatLng(nextPosition)
            }
            map.setView(nextPosition, SELECTED_ZOOM)

            void Promise.resolve(onLocationSelectRef.current?.(nextLat, nextLng)).catch(() => undefined)
          })
        }

        animationFrame = requestAnimationFrame(invalidateMapSize)
        sizeTimers.push(window.setTimeout(invalidateMapSize, 100))
        sizeTimers.push(window.setTimeout(invalidateMapSize, 300))

        resizeObserver = new ResizeObserver(() => {
          if (animationFrame !== null) cancelAnimationFrame(animationFrame)
          animationFrame = requestAnimationFrame(invalidateMapSize)
        })
        resizeObserver.observe(containerRef.current)
      } catch {
        // 지도 로딩 실패 시 저장/수정 흐름은 막지 않는다.
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void initMap()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
      sizeTimers.forEach((timer) => window.clearTimeout(timer))
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [readOnly])

  useEffect(() => {
    let cancelled = false

    const syncMarker = async () => {
      const map = mapRef.current
      if (!map) return

      if (lat === null || lng === null) {
        markerRef.current?.remove()
        markerRef.current = null
        return
      }

      const leaflet = await loadLeaflet()
      if (cancelled) return

      const position: [number, number] = [lat, lng]
      if (!markerRef.current) {
        markerRef.current = leaflet.marker(position).addTo(map)
      } else {
        markerRef.current.setLatLng(position)
      }
      map.setView(position, SELECTED_ZOOM)
    }

    void syncMarker()

    return () => {
      cancelled = true
    }
  }, [lat, lng])

  return (
    <div className="relative h-full w-full">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-mb-muted">
          {loadingLabel}
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
