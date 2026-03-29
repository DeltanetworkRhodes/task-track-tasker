import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HEMD_API = "https://www.broadband-assist.gov.gr/api";

// Haversine distance in meters between two WGS84 points
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Lookup by coordinates using spatial bounding box
async function lookupByCoords(lat: number, lng: number, radius: number) {
  // ~0.001 degrees ≈ 111m at equator, adjust for latitude
  const degPerMeter = 1 / 111320;
  const latDelta = radius * degPerMeter;
  const lngDelta = radius * degPerMeter / Math.cos((lat * Math.PI) / 180);

  const x1 = lng - lngDelta, y1 = lat - latDelta;
  const x2 = lng + lngDelta, y2 = lat + latDelta;
  const polygon = `SRID=4326;POLYGON((${x1} ${y1},${x2} ${y1},${x2} ${y2},${x1} ${y2},${x1} ${y1}))`;

  const url = `${HEMD_API}/a3b_coverpointftthcoax?select=coverid,address,point&limit=10&point=ov.${encodeURIComponent(polygon)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`ΧΕΜΔ API error: ${res.status}`);

  const points: Array<{
    coverid: string;
    address: string;
    point: { coordinates: [number, number] };
  }> = await res.json();

  return points.map((p) => {
    const [pLng, pLat] = p.point.coordinates;
    const dist = Math.round(haversine(lat, lng, pLat, pLng));
    return {
      coverid: p.coverid,
      address: p.address,
      distance: dist,
      latitude: pLat,
      longitude: pLng,
    };
  }).sort((a, b) => a.distance - b.distance);
}

// Lookup by address text search
async function lookupByAddress(address: string, area?: string) {
  // Normalize Greek address for search
  const parts = address
    .toUpperCase()
    .replace(/[,.\-\/\\]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1);

  if (parts.length === 0) return [];

  // Build ilike pattern - search for key words
  // Format in DB: "postal_code,street,number,city" e.g. "82132,ΒΕΝΕΤΟΚΛΕΩΝ,71-73,Δ. ΡΟΔΟΥ"
  let pattern = "*" + parts.join("*") + "*";
  
  // If area is provided, add it to narrow results
  let areaFilter = "";
  if (area) {
    const areaUpper = area.toUpperCase();
    if (areaUpper.includes("ΡΟΔΟ") || areaUpper === "ΡΟΔΟΣ") {
      areaFilter = "&address=ilike.*ΡΟΔΟΥ*";
    } else if (areaUpper.includes("ΚΩΣ")) {
      areaFilter = "&address=ilike.*ΚΩ*";
    }
  }

  const url = `${HEMD_API}/a3b_coverpointftthcoax?select=coverid,address,point&limit=10&address=ilike.${encodeURIComponent(pattern)}${areaFilter}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`ΧΕΜΔ API error: ${res.status}`);

  const points: Array<{
    coverid: string;
    address: string;
    point: { coordinates: [number, number] };
  }> = await res.json();

  return points.map((p) => ({
    coverid: p.coverid,
    address: p.address,
    latitude: p.point.coordinates[1],
    longitude: p.point.coordinates[0],
  }));
}

// Enrich results with provider details from coverage_ftth_data
async function enrichResults(results: Array<{ coverid: string; [key: string]: any }>) {
  const enriched = [];
  for (const item of results.slice(0, 5)) {
    try {
      const res = await fetch(
        `${HEMD_API}/coverage_ftth_data?id=eq.${encodeURIComponent(item.coverid)}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const arr = await res.json();
        if (arr.length > 0) {
          const details = arr[0].details?.[0] || {};
          enriched.push({
            ...item,
            provider: details["Πάροχος"] || "",
            spaces: details["Ανεξάρτητοι χώροι"] || 0,
            connected: details["Έχει συνδεθεί στο δίκτυο FTTH/B"] || "",
            start_date: details["Έναρξη υποδομής"] || "",
          });
          continue;
        }
      }
    } catch { /* skip */ }
    enriched.push(item);
  }
  return enriched;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { latitude, longitude, address, area, assignment_id, radius = 200, auto_save = true } = body;

    let results: any[] = [];

    // Strategy 1: Search by coordinates (most accurate)
    if (latitude && longitude) {
      results = await lookupByCoords(latitude, longitude, radius);
    }

    // Strategy 2: Search by address text (fallback or primary when no coords)
    if (results.length === 0 && address) {
      results = await lookupByAddress(address, area);
    }

    if (results.length === 0) {
      return new Response(
        JSON.stringify({ error: "Δεν βρέθηκε κτίριο", results: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enrich with provider details
    results = await enrichResults(results);

    // Auto-save to assignment if requested
    if (auto_save && assignment_id && results.length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, serviceKey);

      await sb
        .from("assignments")
        .update({ building_id_hemd: results[0].coverid })
        .eq("id", assignment_id);
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("lookup-building-id error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
