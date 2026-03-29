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
  const degPerMeter = 1 / 111320;
  const latDelta = radius * degPerMeter;
  const lngDelta = radius * degPerMeter / Math.cos((lat * Math.PI) / 180);

  const x1 = lng - lngDelta, y1 = lat - latDelta;
  const x2 = lng + lngDelta, y2 = lat + latDelta;
  const polygon = `SRID=4326;POLYGON((${x1} ${y1},${x2} ${y1},${x2} ${y2},${x1} ${y2},${x1} ${y1}))`;

  const url = `${HEMD_API}/a3b_coverpointftthcoax?select=coverid,address,point&limit=10&point=ov.${encodeURIComponent(polygon)}`;

  console.log("Coords lookup URL:", url);

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("ΧΕΜΔ coords API error:", res.status, body);
    throw new Error(`ΧΕΜΔ API error: ${res.status}`);
  }

  const points: Array<{
    coverid: string;
    address: string;
    point: { coordinates: [number, number] };
  }> = await res.json();

  console.log(`Coords lookup found ${points.length} results`);

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

// Clean and normalize Greek address for search
function normalizeGreekAddress(address: string): string {
  return address
    .toUpperCase()
    .replace(/Ά/g, "Α").replace(/Έ/g, "Ε").replace(/Ή/g, "Η")
    .replace(/Ί/g, "Ι").replace(/Ό/g, "Ο").replace(/Ύ/g, "Υ").replace(/Ώ/g, "Ω")
    .replace(/Ϊ/g, "Ι").replace(/Ϋ/g, "Υ");
}

// Extract street name and number from a full address like "ΕΥΣΤΑΘΙΟΥ ΓΕΩΡΓΙΟΥ 11" or "ΒΕΝΕΤΟΚΛΕΩΝ 71-73"
function parseAddress(address: string): { street: string; number: string } {
  const normalized = normalizeGreekAddress(address.trim());
  // Remove common prefixes
  const cleaned = normalized
    .replace(/^(ΟΔΟΣ|ΟΔ\.|ΛΕΩΦ\.|ΛΕΩΦΟΡΟΣ)\s+/i, "")
    .replace(/[,.\-\/\\]/g, " ")
    .trim();

  // Try to split street name from number - number is usually at the end
  const match = cleaned.match(/^(.+?)\s+(\d+[\-\d]*)$/);
  if (match) {
    return { street: match[1].trim(), number: match[2].trim() };
  }
  return { street: cleaned, number: "" };
}

// Lookup by address text search - ΧΕΜΔ format: "postal_code,street,number,municipality"
async function lookupByAddress(address: string, area?: string) {
  const { street, number } = parseAddress(address);
  console.log(`Parsed address: street="${street}", number="${number}", area="${area}"`);

  if (!street || street.length < 2) return [];

  const results: Array<{
    coverid: string;
    address: string;
    latitude: number;
    longitude: number;
  }> = [];

  // Build area filter once
  let areaFilter = "";
  if (area) {
    const areaUpper = normalizeGreekAddress(area);
    if (areaUpper.includes("ΡΟΔΟ") || areaUpper === "ΡΟΔΟΣ") {
      areaFilter = "&address=ilike.*ΡΟΔΟΥ*";
    } else if (areaUpper.includes("ΚΩΣ") || areaUpper === "ΚΩΣ") {
      areaFilter = "&address=ilike.*ΚΩ*";
    } else if (areaUpper.includes("ΚΑΛΥΜΝ")) {
      areaFilter = "&address=ilike.*ΚΑΛΥΜΝ*";
    } else if (areaUpper.includes("ΛΕΡ")) {
      areaFilter = "&address=ilike.*ΛΕΡ*";
    } else if (areaUpper.includes("ΠΑΤΜ")) {
      areaFilter = "&address=ilike.*ΠΑΤΜ*";
    }
  }

  // Strategy 1: Search by street name + number (most specific)
  if (number) {
    const pattern1 = `*${street}*${number}*`;
    const url1 = `${HEMD_API}/a3b_coverpointftthcoax?select=coverid,address,point&limit=10&address=ilike.${encodeURIComponent(pattern1)}${areaFilter}`;
    console.log("Address search (street+number):", url1);
    try {
      const res = await fetch(url1, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`Street+number search found ${data.length} results`);
        if (data.length > 0) {
          for (const p of data) {
            results.push({
              coverid: p.coverid,
              address: p.address,
              latitude: p.point.coordinates[1],
              longitude: p.point.coordinates[0],
            });
          }
        }
      } else {
        await res.text();
      }
    } catch (e) {
      console.error("Street+number search failed:", e);
    }
  }

  // Strategy 2: Search by street name only (broader)
  if (results.length === 0) {
    // Use only the main street name words (skip very short words)
    const streetWords = street.split(/\s+/).filter(w => w.length > 2);
    const pattern2 = `*${streetWords.join("*")}*`;

    const url2 = `${HEMD_API}/a3b_coverpointftthcoax?select=coverid,address,point&limit=10&address=ilike.${encodeURIComponent(pattern2)}${areaFilter}`;
    console.log("Address search (street only):", url2);
    try {
      const res = await fetch(url2, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`Street-only search found ${data.length} results`);
        for (const p of data) {
          results.push({
            coverid: p.coverid,
            address: p.address,
            latitude: p.point.coordinates[1],
            longitude: p.point.coordinates[0],
          });
        }
      } else {
        await res.text();
      }
    } catch (e) {
      console.error("Street-only search failed:", e);
    }
  }

  // If we have a number, sort results to prioritize exact number matches
  if (number && results.length > 1) {
    results.sort((a, b) => {
      const aHasNumber = a.address.includes(`,${number},`) || a.address.includes(`,${number}-`) || a.address.includes(`-${number},`);
      const bHasNumber = b.address.includes(`,${number},`) || b.address.includes(`,${number}-`) || b.address.includes(`-${number},`);
      if (aHasNumber && !bHasNumber) return -1;
      if (!aHasNumber && bHasNumber) return 1;
      return 0;
    });
  }

  return results;
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
      } else {
        await res.text();
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

    console.log("Lookup request:", { latitude, longitude, address, area, assignment_id, radius });

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

    console.log(`Returning ${results.length} enriched results, best: ${results[0].coverid} - ${results[0].address}`);

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
