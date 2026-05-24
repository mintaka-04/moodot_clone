function formatCoordinateLabel(lat: number, lng: number) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      "accept-language": "ko",
    })

    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`)
    if (!res.ok) throw new Error("Reverse geocoding failed")

    const data = await res.json()
    const label = typeof data?.display_name === "string" ? data.display_name : ""

    return label || formatCoordinateLabel(lat, lng)
  } catch {
    return formatCoordinateLabel(lat, lng)
  }
}
