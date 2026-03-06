import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple XLSX parser for Deno - reads the XML inside xlsx zip
async function parseXlsx(data: Uint8Array): Promise<{ sheetsByName: Record<string, string[][]>; sheetsByIndex: Record<string, string[][]> }> {
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

  // Read sheet names from workbook.xml
  const workbookEntry = entries.find((e: any) => e.filename === "xl/workbook.xml");
  const sheetNames: string[] = [];
  if (workbookEntry) {
    const wbXml = await workbookEntry.getData(new TextWriter());
    const sheetMatches = wbXml.matchAll(/<sheet\s[^>]*name="([^"]*)"[^>]*\/>/g);
    for (const sm of sheetMatches) {
      sheetNames.push(sm[1]);
    }
  }
  console.log("Sheet names from workbook:", JSON.stringify(sheetNames));

  // Read each sheet
  const sheetsByIndex: Record<string, string[][]> = {};
  const sheetsByName: Record<string, string[][]> = {};
  const sheetEntries = entries
    .filter((e: any) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.filename))
    .sort((a: any, b: any) => a.filename.localeCompare(b.filename));

  for (let si = 0; si < sheetEntries.length; si++) {
    const entry = sheetEntries[si];
    const xml = await entry.getData(new TextWriter());
    const rows: string[][] = [];

    const rowMatches = xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g);
    for (const rowMatch of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowMatch[1].matchAll(/<c\s([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g);

      for (const cellMatch of cellMatches) {
        const attrs = cellMatch[1];
        const inner = cellMatch[2] || "";

        const refMatch = attrs.match(/r="([A-Z]+)\d+"/);
        if (!refMatch) continue;
        const colLetter = refMatch[1];

        const typeMatch = attrs.match(/t="([^"]*)"/);
        const type = typeMatch ? typeMatch[1] : "";

        const valMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        const rawValue = valMatch ? valMatch[1] : "";

        let colIndex = 0;
        for (let i = 0; i < colLetter.length; i++) {
          colIndex = colIndex * 26 + (colLetter.charCodeAt(i) - 64);
        }
        colIndex -= 1;

        while (cells.length <= colIndex) cells.push("");

        if (type === "s") {
          const idx = parseInt(rawValue);
          cells[colIndex] = sharedStrings[idx] || "";
        } else if (type === "b") {
          cells[colIndex] = rawValue === "1" ? "TRUE" : "FALSE";
        } else if (type === "inlineStr") {
          const isMatch = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
          cells[colIndex] = isMatch ? isMatch[1] : rawValue;
        } else {
          cells[colIndex] = rawValue;
        }
      }

      if (cells.some((c) => c !== "")) {
        rows.push(cells);
      }
    }

    const sheetKey = `sheet${si + 1}`;
    sheetsByIndex[sheetKey] = rows;
    if (si < sheetNames.length) {
      sheetsByName[sheetNames[si].toUpperCase()] = rows;
    }
  }

  await reader.close();
  return { sheetsByName, sheetsByIndex };
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
    const { sheetsByName, sheetsByIndex } = await parseXlsx(fileData);
    console.log("Parsed sheets by name:", Object.keys(sheetsByName));
    console.log("Parsed sheets by index:", Object.keys(sheetsByIndex));
    
    // Sheet 1: Main building data
    const sheet1 = sheetsByIndex["sheet1"] || [];
    console.log("Sheet1 rows:", sheet1.length);
    console.log("Sheet1 headers:", JSON.stringify(sheet1[0]));
    console.log("Sheet1 data:", JSON.stringify(sheet1[1]));

    const headers1 = sheet1[0] || [];
    const data1 = sheet1[1] || [];

    const getVal = (header: string): string => {
      const idx = headers1.findIndex((h) => h?.toUpperCase().includes(header.toUpperCase()));
      if (idx >= 0) {
        console.log(`getVal("${header}") -> idx=${idx}, value="${data1[idx]}"`);
      }
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

    // ---- PARSE "ΟΡΟΦΟΙ" SHEET: Floor details with FB info ----
    const floorSheet = sheetsByName["ΟΡΟΦΟΙ"] || sheetsByIndex["sheet2"] || [];
    console.log("Floor sheet (ΟΡΟΦΟΙ) rows:", floorSheet.length);
    if (floorSheet.length > 0) {
      console.log("Floor sheet headers:", JSON.stringify(floorSheet[0]));
      if (floorSheet.length > 1) console.log("Floor sheet row 1:", JSON.stringify(floorSheet[1]));
    }
    const floorHeaders = floorSheet[0] || [];
    const floorDetails = floorSheet.slice(1)
      .filter((row) => row.some((c) => c !== ""))
      .map((row) => {
        const obj: Record<string, string> = {};
        floorHeaders.forEach((h, i) => {
          if (h) obj[h] = row[i] || "";
        });
        return obj;
      });
    console.log("Floor details parsed:", JSON.stringify(floorDetails));

    // ---- PARSE Optical paths sheet ----
    const opticalSheet = sheetsByName["ΟΠΤΙΚΕΣ ΔΙΑΔΡΟΜΕΣ"] || sheetsByName["OPTICAL PATHS"] || sheetsByIndex["sheet3"] || [];
    const opticalHeaders = opticalSheet[0] || [];
    const opticalPaths = opticalSheet.slice(1)
      .filter((row) => row.some((c) => c !== ""))
      .map((row) => {
        const obj: Record<string, string> = {};
        opticalHeaders.forEach((h, i) => {
          if (h && row[i]) obj[h] = row[i];
        });
        return obj;
      });

    // ---- PARSE Works sheet ----
    const worksSheet = sheetsByName["ΕΡΓΑΣΙΕΣ"] || sheetsByName["WORKS"] || sheetsByIndex["sheet4"] || [];
    const worksHeaders = worksSheet[0] || [];
    const gisWorks = worksSheet.slice(1)
      .filter((row) => row.some((c) => c !== ""))
      .map((row) => {
        const obj: Record<string, string> = {};
        worksHeaders.forEach((h, i) => {
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
      raw_data: { sheetsByName, sheetsByIndex },
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

    // Check if survey is complete (all required file types exist)
    const { data: survey } = await adminClient
      .from("surveys")
      .select("id, status")
      .eq("sr_id", srId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let newStatus = "pre_committed"; // Default: incomplete survey
    if (survey && survey.status !== "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ") {
      // Survey is complete → go directly to construction
      newStatus = "construction";
    }

    // Update assignment status
    await supabase
      .from("assignments")
      .update({ status: newStatus })
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
