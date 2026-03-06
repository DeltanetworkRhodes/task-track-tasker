import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple XLSX parser for Deno - reads the XML inside xlsx zip
async function parseXlsx(data: Uint8Array): Promise<Record<string, string[][]>> {
  // Use a lightweight approach: read zip entries
  const { ZipReader, BlobReader, TextWriter } = await import("https://deno.land/x/zipjs@v2.7.32/index.js");

  const reader = new ZipReader(new BlobReader(new Blob([data])));
  const entries = await reader.getEntries();

  // Read shared strings
  const sharedStringsEntry = entries.find((e: any) => e.filename === "xl/sharedStrings.xml");
  let sharedStrings: string[] = [];
  if (sharedStringsEntry) {
    const xml = await sharedStringsEntry.getData(new TextWriter());
    const matches = xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g);
    for (const m of matches) {
      sharedStrings.push(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    }
  }

  // Read each sheet
  const sheets: Record<string, string[][]> = {};
  const sheetEntries = entries
    .filter((e: any) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.filename))
    .sort((a: any, b: any) => a.filename.localeCompare(b.filename));

  for (const entry of sheetEntries) {
    const xml = await entry.getData(new TextWriter());
    const rows: string[][] = [];

    // Extract rows
    const rowMatches = xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g);
    for (const rowMatch of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowMatch[1].matchAll(/<c\s+r="([A-Z]+)\d+"[^>]*(?:t="([^"]*)")?[^>]*>(?:[\s\S]*?<v>([\s\S]*?)<\/v>)?[\s\S]*?<\/c>/g);

      for (const cellMatch of cellMatches) {
        const colLetter = cellMatch[1];
        const type = cellMatch[2];
        const rawValue = cellMatch[3] || "";

        // Convert column letter to index
        let colIndex = 0;
        for (let i = 0; i < colLetter.length; i++) {
          colIndex = colIndex * 26 + (colLetter.charCodeAt(i) - 64);
        }
        colIndex -= 1;

        // Fill gaps
        while (cells.length <= colIndex) cells.push("");

        if (type === "s") {
          // Shared string reference
          const idx = parseInt(rawValue);
          cells[colIndex] = sharedStrings[idx] || "";
        } else if (type === "b") {
          cells[colIndex] = rawValue === "1" ? "TRUE" : "FALSE";
        } else {
          cells[colIndex] = rawValue;
        }
      }

      if (cells.some((c) => c !== "")) {
        rows.push(cells);
      }
    }

    const sheetNum = entry.filename.match(/sheet(\d+)/)?.[1] || "1";
    sheets[`sheet${sheetNum}`] = rows;
  }

  await reader.close();
  return sheets;
}

function parseBoolean(val: string): boolean {
  return val === "TRUE" || val === "1" || val?.toLowerCase() === "true";
}

function parseNumber(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

// Parse latitude/longitude - GIS stores them without decimal point (e.g., 37966960 = 37.966960)
function parseCoord(val: string): number | null {
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  // If the number is > 180, it's likely stored without decimal
  if (Math.abs(n) > 180) {
    return n / 1000000;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Get form data with file
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const assignmentId = formData.get("assignment_id") as string;
    const srId = formData.get("sr_id") as string;

    if (!file || !assignmentId || !srId) {
      return new Response(
        JSON.stringify({ error: "Missing file, assignment_id, or sr_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify technician owns this assignment
    const { data: assignment, error: assignErr } = await supabase
      .from("assignments")
      .select("id, technician_id")
      .eq("id", assignmentId)
      .single();

    if (assignErr || !assignment || assignment.technician_id !== userId) {
      return new Response(JSON.stringify({ error: "Assignment not found or not yours" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload file to storage
    const fileBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(fileBuffer);
    const storagePath = `gis/${srId}/${file.name}`;

    const { error: uploadErr } = await supabase.storage
      .from("gis-files")
      .upload(storagePath, fileData, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
    if (uploadErr) {
      console.error("Upload error:", uploadErr);
    }

    // Parse the XLSX
    const sheets = await parseXlsx(fileData);
    console.log("Parsed sheets:", Object.keys(sheets));

    // ---- PARSE SHEET 1: Main building data ----
    const sheet1 = sheets["sheet1"] || [];
    const headers1 = sheet1[0] || [];
    const data1 = sheet1[1] || [];

    const getVal = (header: string): string => {
      const idx = headers1.findIndex((h) => h?.toUpperCase().includes(header.toUpperCase()));
      return idx >= 0 ? (data1[idx] || "") : "";
    };

    const buildingData = {
      building_id: getVal("BUILDING ID"),
      area_type: getVal("AREA TYPE"),
      floors: parseInt(getVal("ΟΡΟΦΟΙ")) || 0,
      customer_floor: getVal("ΟΡΟΦΟΣ ΠΕΛΑΤΗ"),
      bep_floor: getVal("ΟΡΟΦΟΣ BEP"),
      admin_signature: parseBoolean(getVal("ΥΠΟΓΡΑΦΗ")),
      bep_only: parseBoolean(getVal("BEP ONLY")),
      bep_template: getVal("BEP TEMPLATE"),
      bep_type: getVal("BEP TYPE"),
      bmo_type: getVal("BMO TYPE"),
      deh_nanotronix: parseBoolean(getVal("ΑΠΟ ΔΕΗ")),
      nanotronix: parseBoolean(getVal("NANOTRONIX")),
      smart_readiness: parseBoolean(getVal("SMART")),
      associated_bcp: getVal("ΣΥΣΧΕΤΙΣΜΕΝΟ"),
      nearby_bcp: getVal("ΚΟΝΤΙΝΟ"),
      new_bcp: getVal("ΝΕΟ BCP"),
      conduit: getVal("CONDUIT"),
      distance_from_cabinet: parseNumber(getVal("ΑΠΟΣΤΑΣΗ")),
      latitude: parseCoord(getVal("LATITUDE")),
      longitude: parseCoord(getVal("LONGITUDE")),
      notes: getVal("NOTES"),
      warning: getVal("WARNING"),
      failure: getVal("FAILURE"),
    };

    // ---- PARSE SHEET 2: Floor details ----
    const sheet2 = sheets["sheet2"] || [];
    const headers2 = sheet2[0] || [];
    const floorDetails = sheet2.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers2.forEach((h, i) => {
        if (h && row[i]) obj[h] = row[i];
      });
      return obj;
    });

    // ---- PARSE SHEET 3: Optical paths ----
    const sheet3 = sheets["sheet3"] || [];
    const headers3 = sheet3[0] || [];
    const opticalPaths = sheet3.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers3.forEach((h, i) => {
        if (h && row[i]) obj[h] = row[i];
      });
      return obj;
    });

    // ---- PARSE SHEET 4: Works ----
    const sheet4 = sheets["sheet4"] || [];
    const headers4 = sheet4[0] || [];
    const gisWorks = sheet4.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers4.forEach((h, i) => {
        if (h && row[i]) obj[h] = row[i];
      });
      return obj;
    });

    // Use service role to insert (technician has INSERT policy)
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if gis_data already exists for this assignment
    const { data: existing } = await adminClient
      .from("gis_data")
      .select("id")
      .eq("assignment_id", assignmentId)
      .maybeSingle();

    let gisRecord;
    const gisPayload = {
      assignment_id: assignmentId,
      sr_id: srId,
      ...buildingData,
      floor_details: floorDetails,
      optical_paths: opticalPaths,
      gis_works: gisWorks,
      raw_data: sheets,
      file_path: storagePath,
    };

    if (existing) {
      // Update
      const { data, error } = await adminClient
        .from("gis_data")
        .update(gisPayload)
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) throw error;
      gisRecord = data;
    } else {
      // Insert
      const { data, error } = await adminClient
        .from("gis_data")
        .insert(gisPayload)
        .select("id")
        .single();
      if (error) throw error;
      gisRecord = data;
    }

    // Update assignment status to pre_committed
    await supabase
      .from("assignments")
      .update({ status: "pre_committed" })
      .eq("id", assignmentId);

    return new Response(
      JSON.stringify({
        success: true,
        gis_data_id: gisRecord.id,
        parsed: {
          building: buildingData,
          floors: floorDetails.length,
          optical_paths: opticalPaths.length,
          works: gisWorks.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Parse GIS error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
