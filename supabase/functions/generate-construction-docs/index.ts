import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const areaRootFolders: Record<string, string> = {
  "ΡΟΔΟΣ": "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO",
  "ΚΩΣ": "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl",
};

const greekMonths: Record<number, string> = {
  0: "ΙΑΝΟΥΑΡΙΟΣ", 1: "ΦΕΒΡΟΥΑΡΙΟΣ", 2: "ΜΑΡΤΙΟΣ",
  3: "ΑΠΡΙΛΙΟΣ", 4: "ΜΑΙΟΣ", 5: "ΙΟΥΝΙΟΣ",
  6: "ΙΟΥΛΙΟΣ", 7: "ΑΥΓΟΥΣΤΟΣ", 8: "ΣΕΠΤΕΜΒΡΙΟΣ",
  9: "ΟΚΤΩΒΡΙΟΣ", 10: "ΝΟΕΜΒΡΙΟΣ", 11: "ΔΕΚΕΜΒΡΙΟΣ",
};

// ─── Google Drive helpers ────────────────────────────────────────────

async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: serviceAccountKey.client_email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const pemContent = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInput);

  const signatureB64 = uint8ToBase64(new Uint8Array(signature))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${signatureB64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
  return (await tokenRes.json()).access_token;
}

async function driveSearch(accessToken: string, query: string): Promise<any[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).files || [];
}

async function createDriveFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!res.ok) throw new Error(`Create folder failed: ${await res.text()}`);
  return await res.json();
}

async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const existing = await driveSearch(
    accessToken,
    `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  if (existing.length > 0) return existing[0];
  return await createDriveFolder(accessToken, name, parentId);
}

async function uploadFileToDrive(
  accessToken: string, fileName: string, mimeType: string,
  fileData: Uint8Array, parentId: string
): Promise<any> {
  const metadata = JSON.stringify({ name: fileName, parents: [parentId] });
  const boundary = "===boundary===";
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
    uint8ToBase64(fileData) +
    `\r\n--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
  return await res.json();
}

// ─── XLSX Generation ─────────────────────────────────────────────────

function generateConstructionXlsx(
  assignment: any,
  construction: any,
  works: any[],
  oteMaterials: any[],
  deltaMaterials: any[]
): Uint8Array {
  const wb = XLSX.utils.book_new();
  
  // Header rows
  const data: any[][] = [
    ["ΦΥΛΛΟ ΑΠΟΛΟΓΙΣΜΟΥ ΕΡΓΑΣΙΩΝ FTTH Β ΦΑΣΗ"],
    [],
    ["SR ID:", assignment.sr_id, "", "SES ID:", construction.ses_id || "", "", "Α/Κ:", construction.ak || ""],
    ["CAB:", construction.cab || "", "", "ΟΡΟΦΟΙ:", construction.floors || 0, "", "ΠΕΡΙΟΧΗ:", assignment.area],
    ["ΔΙΕΥΘΥΝΣΗ:", assignment.address || "", "", "ΠΕΛΑΤΗΣ:", assignment.customer_name || ""],
    ["ΗΜΕΡΟΜΗΝΙΑ:", new Date().toLocaleDateString("el-GR")],
    [],
    // Works header
    ["Άρθρο", "ΚΑΤΑΣΚΕΥΕΣ", "ΠΟΣΟΤΗΤΑ", "ΤΙΜΗ ΜΟΝΑΔΟΣ", "ΜΕΡΙΚΟ ΣΥΝΟΛΟ", "", "ΚΑΥ", "ΠΕΡΙΓΡΑΦΗ ΥΛΙΚΩΝ", "ΜΜ", "ΠΟΣΟΤΗΤΑ", "ΠΗΓΗ"],
  ];

  // Find max rows between works and all materials
  const allMaterials = [...oteMaterials, ...deltaMaterials];
  const maxRows = Math.max(works.length, allMaterials.length);

  for (let i = 0; i < maxRows; i++) {
    const row: any[] = [];
    
    // Works columns
    if (i < works.length) {
      const w = works[i];
      row.push(w.code, w.description, w.quantity, w.unit_price, w.subtotal);
    } else {
      row.push("", "", "", "", "");
    }
    
    row.push(""); // spacer
    
    // Materials columns
    if (i < allMaterials.length) {
      const m = allMaterials[i];
      row.push(m.code, m.name, m.unit, m.quantity, m.source);
    } else {
      row.push("", "", "", "", "");
    }
    
    data.push(row);
  }

  // Totals
  data.push([]);
  const totalRevenue = works.reduce((s: number, w: any) => s + (w.subtotal || 0), 0);
  const totalMaterialCost = deltaMaterials.reduce((s: number, m: any) => s + (m.price || 0) * (m.quantity || 0), 0);
  data.push(["", "ΣΥΝΟΛΟ ΕΡΓΑΣΙΩΝ:", "", "", totalRevenue]);
  data.push(["", "ΚΟΣΤΟΣ ΥΛΙΚΩΝ (DELTANETWORK):", "", "", totalMaterialCost]);
  data.push(["", "ΚΕΡΔΟΣ:", "", "", totalRevenue - totalMaterialCost]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Set column widths
  ws["!cols"] = [
    { wch: 12 }, { wch: 50 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
    { wch: 3 },
    { wch: 12 }, { wch: 50 }, { wch: 8 }, { wch: 10 }, { wch: 14 },
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, "ΑΠΟΛΟΓΙΣΜΟΣ");
  const xlsxData = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(xlsxData);
}

// ─── PDF Generation ──────────────────────────────────────────────────

async function generateWorksPdf(
  assignment: any,
  construction: any,
  works: any[]
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  
  let page = pdf.addPage([595, 842]); // A4
  let y = 800;
  const margin = 40;

  // Title
  page.drawText("TIMOLOGHSH ERGASION FTTH", {
    x: margin, y, font: boldFont, size: 14, color: rgb(0, 0, 0.6),
  });
  y -= 25;

  // Header info
  const headerLines = [
    `SR ID: ${assignment.sr_id}    SES ID: ${construction.ses_id || "-"}`,
    `CAB: ${construction.cab || "-"}    A/K: ${construction.ak || "-"}    Orofoi: ${construction.floors || 0}`,
    `Pelatis: ${assignment.customer_name || "-"}    Periohi: ${assignment.area}`,
    `Hmeromhnia: ${new Date().toLocaleDateString("el-GR")}`,
  ];
  for (const line of headerLines) {
    page.drawText(line, { x: margin, y, font, size: 9, color: rgb(0.2, 0.2, 0.2) });
    y -= 15;
  }
  y -= 10;

  // Table header
  page.drawRectangle({ x: margin, y: y - 2, width: 515, height: 16, color: rgb(0.9, 0.9, 0.95) });
  const cols = [margin, margin + 70, margin + 330, margin + 390, margin + 440, margin + 490];
  const headers = ["Kodikos", "Perigrafi", "Posotita", "Timi", "Sinolo"];
  headers.forEach((h, i) => {
    page.drawText(h, { x: cols[i], y, font: boldFont, size: 8, color: rgb(0, 0, 0) });
  });
  y -= 18;

  // Works rows
  let totalRevenue = 0;
  for (const w of works) {
    if (y < 60) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    const subtotal = (w.unit_price || 0) * (w.quantity || 0);
    totalRevenue += subtotal;
    
    // Truncate description to fit
    const desc = (w.description || "").substring(0, 55);
    
    page.drawText(w.code || "", { x: cols[0], y, font, size: 7.5 });
    page.drawText(desc, { x: cols[1], y, font, size: 7 });
    page.drawText(String(w.quantity || 0), { x: cols[2], y, font, size: 7.5 });
    page.drawText(`${(w.unit_price || 0).toFixed(2)}`, { x: cols[3], y, font, size: 7.5 });
    page.drawText(`${subtotal.toFixed(2)}`, { x: cols[4], y, font, size: 7.5 });
    y -= 14;
  }

  // Total
  y -= 10;
  page.drawRectangle({ x: margin, y: y - 2, width: 515, height: 18, color: rgb(0.85, 0.92, 0.85) });
  page.drawText(`SYNOLO ERGASION: ${totalRevenue.toFixed(2)} EUR`, {
    x: cols[3] - 60, y, font: boldFont, size: 10, color: rgb(0, 0.4, 0),
  });

  return pdf.save();
}

async function generateMaterialsPdf(
  assignment: any,
  construction: any,
  materials: any[],
  source: string,
  title: string
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const margin = 40;

  // Title
  page.drawText(title, {
    x: margin, y, font: boldFont, size: 14, color: rgb(0, 0, 0.6),
  });
  y -= 25;

  // Header
  const headerLines = [
    `SR ID: ${assignment.sr_id}    CAB: ${construction.cab || "-"}`,
    `Pelatis: ${assignment.customer_name || "-"}    Periohi: ${assignment.area}`,
    `Hmeromhnia: ${new Date().toLocaleDateString("el-GR")}`,
  ];
  for (const line of headerLines) {
    page.drawText(line, { x: margin, y, font, size: 9, color: rgb(0.2, 0.2, 0.2) });
    y -= 15;
  }
  y -= 10;

  // Table header
  page.drawRectangle({ x: margin, y: y - 2, width: 515, height: 16, color: rgb(0.9, 0.9, 0.95) });
  const cols = [margin, margin + 80, margin + 370, margin + 420, margin + 470];
  const headers = ["Kodikos", "Perigrafi", "MM", "Posotita"];
  headers.forEach((h, i) => {
    page.drawText(h, { x: cols[i], y, font: boldFont, size: 8 });
  });
  y -= 18;

  for (const m of materials) {
    if (y < 60) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    const desc = (m.name || "").substring(0, 60);
    
    page.drawText(m.code || "", { x: cols[0], y, font, size: 7.5 });
    page.drawText(desc, { x: cols[1], y, font, size: 7 });
    page.drawText(m.unit || "", { x: cols[2], y, font, size: 7.5 });
    page.drawText(String(m.quantity || 0), { x: cols[3], y, font, size: 7.5 });
    y -= 14;
  }

  // Total count
  y -= 10;
  const totalItems = materials.reduce((s: number, m: any) => s + (m.quantity || 0), 0);
  page.drawText(`Sinolo eidon: ${materials.length} | Sinolo posotitas: ${totalItems}`, {
    x: margin, y, font: boldFont, size: 9,
  });

  return pdf.save();
}

// ─── Main Handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { construction_id, photo_paths } = body;

    if (!construction_id) {
      return new Response(JSON.stringify({ error: "construction_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch construction with assignment
    const { data: construction, error: constErr } = await adminClient
      .from("constructions")
      .select("*")
      .eq("id", construction_id)
      .single();
    if (constErr || !construction) throw new Error("Construction not found");

    const { data: assignment, error: assignErr } = await adminClient
      .from("assignments")
      .select("*")
      .eq("id", construction.assignment_id)
      .single();
    if (assignErr || !assignment) throw new Error("Assignment not found");

    // Fetch works with pricing info
    const { data: worksRaw } = await adminClient
      .from("construction_works")
      .select("*, work_pricing:work_pricing_id(code, description, unit)")
      .eq("construction_id", construction_id);

    const works = (worksRaw || []).map((w: any) => ({
      code: w.work_pricing?.code || "",
      description: w.work_pricing?.description || "",
      unit: w.work_pricing?.unit || "",
      unit_price: w.unit_price,
      quantity: w.quantity,
      subtotal: w.subtotal,
    }));

    // Fetch materials with material info
    const { data: matsRaw } = await adminClient
      .from("construction_materials")
      .select("*, material:material_id(code, name, unit, price, source)")
      .eq("construction_id", construction_id);

    const allMaterials = (matsRaw || []).map((m: any) => ({
      code: m.material?.code || "",
      name: m.material?.name || "",
      unit: m.material?.unit || "",
      price: m.material?.price || 0,
      source: m.material?.source || m.source,
      quantity: m.quantity,
    }));

    const oteMaterials = allMaterials.filter((m: any) => m.source === "OTE");
    const deltaMaterials = allMaterials.filter((m: any) => m.source === "DELTANETWORK");

    console.log(`Generating docs for SR ${assignment.sr_id}: ${works.length} works, ${oteMaterials.length} OTE mats, ${deltaMaterials.length} DN mats`);

    // Generate files
    const xlsxData = generateConstructionXlsx(assignment, construction, works, oteMaterials, deltaMaterials);
    const worksPdf = await generateWorksPdf(assignment, construction, works);
    const otePdf = oteMaterials.length > 0
      ? await generateMaterialsPdf(assignment, construction, oteMaterials, "OTE", "DELTIO APOSTOLIS YLIKON OTE")
      : null;
    const deltaPdf = deltaMaterials.length > 0
      ? await generateMaterialsPdf(assignment, construction, deltaMaterials, "DELTANETWORK", "DELTIO APOSTOLIS YLIKON DELTANETWORK")
      : null;

    // Google Drive upload
    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyStr) {
      return new Response(JSON.stringify({
        success: true,
        drive_uploaded: false,
        message: "Files generated but Google Drive not configured",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
    const accessToken = await getAccessToken(serviceAccountKey);

    // Find existing SR folder
    const rootId = areaRootFolders[assignment.area];
    if (!rootId) throw new Error(`Unknown area: ${assignment.area}`);

    const currentMonth = greekMonths[new Date().getMonth()];
    const monthFolder = await findOrCreateFolder(accessToken, currentMonth, rootId);

    // Search in all possible parent folders for the SR folder
    const searchParents = [monthFolder.id];
    const subfolderNames = ["ΑΝΑΜΟΝΗ", "ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ", "ΠΡΟΔΕΣΜΕΥΣΗ ΓΙΑ ΚΑΤΑΣΚΕΥΗ", "ΠΑΡΑΔΩΤΕΑ"];
    for (const sfName of subfolderNames) {
      const sf = await driveSearch(
        accessToken,
        `name = '${sfName}' and '${monthFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );
      if (sf.length > 0) searchParents.push(sf[0].id);
    }

    let srFolder: any = null;
    for (const parentId of searchParents) {
      const found = await driveSearch(
        accessToken,
        `name contains '${assignment.sr_id}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );
      if (found.length > 0) {
        srFolder = found[0];
        break;
      }
    }

    // If no SR folder found, create one
    if (!srFolder) {
      const folderName = `${assignment.sr_id} - ${assignment.customer_name || "ΠΕΛΑΤΗΣ"} - ${assignment.address || ""}`.trim();
      // Create under the month folder directly
      srFolder = await createDriveFolder(accessToken, folderName, monthFolder.id);
      console.log(`Created new SR folder: ${srFolder.name}`);
    }

    // Create ΚΑΤΑΣΚΕΥΗ subfolder
    const constructionFolder = await findOrCreateFolder(accessToken, "ΚΑΤΑΣΚΕΥΗ", srFolder.id);
    console.log(`Construction folder: ${constructionFolder.id}`);

    // Upload all files
    const srId = assignment.sr_id;
    const uploadResults: any[] = [];

    // 1. XLSX
    const xlsxResult = await uploadFileToDrive(
      accessToken, `ΦΥΛΛΟ_ΑΠΟΛΟΓΙΣΜΟΥ_${srId}.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xlsxData, constructionFolder.id
    );
    uploadResults.push({ type: "xlsx", name: xlsxResult.name, id: xlsxResult.id });

    // 2. Works PDF
    const worksPdfResult = await uploadFileToDrive(
      accessToken, `ΤΙΜΟΛΟΓΗΣΗ_ΕΡΓΑΣΙΩΝ_${srId}.pdf`,
      "application/pdf",
      new Uint8Array(worksPdf), constructionFolder.id
    );
    uploadResults.push({ type: "works_pdf", name: worksPdfResult.name, id: worksPdfResult.id });

    // 3. OTE Materials PDF
    if (otePdf) {
      const oteResult = await uploadFileToDrive(
        accessToken, `ΔΕΛΤΙΟ_ΑΠΟΣΤΟΛΗΣ_ΟΤΕ_${srId}.pdf`,
        "application/pdf",
        new Uint8Array(otePdf), constructionFolder.id
      );
      uploadResults.push({ type: "ote_pdf", name: oteResult.name, id: oteResult.id });
    }

    // 4. DELTANETWORK Materials PDF
    if (deltaPdf) {
      const deltaResult = await uploadFileToDrive(
        accessToken, `ΔΕΛΤΙΟ_ΑΠΟΣΤΟΛΗΣ_DELTANETWORK_${srId}.pdf`,
        "application/pdf",
        new Uint8Array(deltaPdf), constructionFolder.id
      );
      uploadResults.push({ type: "delta_pdf", name: deltaResult.name, id: deltaResult.id });
    }

    // 5. Upload photos from Supabase storage
    if (photo_paths && photo_paths.length > 0) {
      for (const photoPath of photo_paths) {
        try {
          const { data: fileData, error: dlErr } = await adminClient.storage
            .from("photos")
            .download(photoPath);
          if (dlErr || !fileData) {
            console.error(`Failed to download photo ${photoPath}:`, dlErr);
            continue;
          }
          const arrayBuf = await fileData.arrayBuffer();
          const fileName = photoPath.split("/").pop() || `photo_${Date.now()}.jpg`;
          const mimeType = fileName.endsWith(".png") ? "image/png" : "image/jpeg";
          
          const photoResult = await uploadFileToDrive(
            accessToken, fileName, mimeType,
            new Uint8Array(arrayBuf), constructionFolder.id
          );
          uploadResults.push({ type: "photo", name: photoResult.name, id: photoResult.id });
        } catch (photoErr: any) {
          console.error(`Photo upload error: ${photoErr.message}`);
        }
      }
    }

    // Update construction drive folder URL
    await adminClient
      .from("constructions")
      .update({ status: "completed" })
      .eq("id", construction_id);

    // Update assignment drive_folder_url if not set
    if (!assignment.drive_folder_url) {
      await adminClient
        .from("assignments")
        .update({ drive_folder_url: srFolder.webViewLink || `https://drive.google.com/drive/folders/${srFolder.id}` })
        .eq("id", assignment.id);
    }

    return new Response(JSON.stringify({
      success: true,
      drive_uploaded: true,
      sr_folder: { id: srFolder.id, name: srFolder.name, url: srFolder.webViewLink },
      construction_folder: { id: constructionFolder.id, url: constructionFolder.webViewLink },
      files: uploadResults,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
