import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Convert WGS84 (lat/lng) to EPSG:2100 (Greek Grid / GGRS87)
function wgs84ToEpsg2100(lat: number, lng: number): { x: number; y: number } {
  const a = 6378137.0; // GRS80 semi-major axis
  const f = 1 / 298.257222101;
  const e2 = 2 * f - f * f;
  const k0 = 0.9996;
  const lng0 = 24; // central meridian for GGRS87
  const FE = 500000;

  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const lng0R = (lng0 * Math.PI) / 180;

  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);
  const tanLat = Math.tan(latR);

  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = (e2 / (1 - e2)) * cosLat * cosLat;
  const A = (lngR - lng0R) * cosLat;

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * latR -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * latR) +
      ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * latR) -
      ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * latR));

  const x =
    FE +
    k0 *
      N *
      (A +
        ((1 - T + C) * A * A * A) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * (e2 / (1 - e2))) * A * A * A * A * A) / 120);

  const y =
    k0 *
    (M +
      N *
        tanLat *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A * A * A * A) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * (e2 / (1 - e2))) * A * A * A * A * A * A) / 720));

  return { x, y };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { latitude, longitude, assignment_id, radius = 200 } = await req.json();

    if (!latitude || !longitude) {
      return new Response(JSON.stringify({ error: "Απαιτούνται συντεταγμένες (latitude, longitude)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert to EPSG:2100
    const { x, y } = wgs84ToEpsg2100(latitude, longitude);
    const half = radius; // meters

    // Build bounding box polygon for spatial query
    const x1 = x - half, y1 = y - half, x2 = x + half, y2 = y + half;
    const polygon = `SRID=2100;POLYGON((${x1} ${y1},${x2} ${y1},${x2} ${y2},${x1} ${y2},${x1} ${y1}))`;

    // Query geo_coverage_ftth with spatial filter
    const apiUrl = `https://www.broadband-assist.gov.gr/api/geo_coverage_ftth?select=coverid,geom&limit=10&geom=ov.${encodeURIComponent(polygon)}`;

    const geoRes = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!geoRes.ok) {
      throw new Error(`ΧΕΜΔ API error: ${geoRes.status}`);
    }

    const points: Array<{
      coverid: string;
      geom: { coordinates: [number, number] };
    }> = await geoRes.json();

    if (!points || points.length === 0) {
      return new Response(
        JSON.stringify({ error: "Δεν βρέθηκε κτίριο στην περιοχή", results: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate distances and sort by nearest
    const withDist = points.map((p) => {
      const [px, py] = p.geom.coordinates;
      const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
      return { coverid: p.coverid, distance: Math.round(dist), x: px, y: py };
    });
    withDist.sort((a, b) => a.distance - b.distance);

    // Get details for the closest results (max 5)
    const top = withDist.slice(0, 5);
    const results = [];

    for (const item of top) {
      try {
        const detailRes = await fetch(
          `https://www.broadband-assist.gov.gr/api/coverage_ftth_data?id=eq.${encodeURIComponent(item.coverid)}`,
          { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
        );
        if (detailRes.ok) {
          const detailArr = await detailRes.json();
          if (detailArr.length > 0) {
            const details = detailArr[0].details?.[0] || {};
            results.push({
              coverid: item.coverid,
              distance: item.distance,
              address: details["Διεύθυνση"] || "",
              provider: details["Πάροχος"] || "",
              spaces: details["Ανεξάρτητοι χώροι"] || 0,
              connected: details["Έχει συνδεθεί στο δίκτυο FTTH/B"] || "",
              start_date: details["Έναρξη υποδομής"] || "",
            });
          }
        }
      } catch {
        // Skip failed lookups
        results.push({ coverid: item.coverid, distance: item.distance });
      }
    }

    // If assignment_id provided and we found results, update the assignment
    if (assignment_id && results.length > 0) {
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
