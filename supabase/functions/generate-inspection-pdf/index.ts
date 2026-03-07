import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

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
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signatureInput);
  const signatureB64 = uint8ToBase64(new Uint8Array(signature))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${header}.${payload}.${signatureB64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
  return (await tokenRes.json()).access_token;
}

const SHARED_DRIVE_ID = "0AN9VpmNEa7QBUk9PVA";

async function driveSearch(accessToken: string, query: string): Promise<any[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).files || [];
}

async function findOrCreateDriveFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const existing = await driveSearch(
    accessToken,
    `name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  if (existing.length > 0) return existing[0];

  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    }
  );

  if (!createRes.ok) throw new Error(`Create folder failed: ${await createRes.text()}`);
  return await createRes.json();
}

async function uploadFileToDrive(
  accessToken: string, fileName: string, mimeType: string,
  fileData: Uint8Array, parentId: string
): Promise<any> {
  const metadata = { name: fileName, parents: [parentId] };
  const initRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(fileData.byteLength),
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initRes.ok) throw new Error(`Upload init failed: ${await initRes.text()}`);
  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) throw new Error("No upload URL returned");
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "Content-Length": String(fileData.byteLength) },
    body: fileData,
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${await uploadRes.text()}`);
  return await uploadRes.json();
}

// ─── PDF Generation (Template Overlay - Mapping Driven) ─────────────────

const BLACK = rgb(0, 0, 0);

interface FieldDef {
  key: string;
  type: string;
  x?: number;
  y?: number;
  size?: number;
  maxWidth?: number;
  maxW?: number;
  maxH?: number;
  lineHeight?: number;
  maxLines?: number;
  boxWidth?: number;
  boxCount?: number;
  sourceKey?: string;
  match?: any;
  map?: Record<string, { x: number; y: number }>;
  brands?: Record<string, number>;
  sizes?: Record<string, number>;
  capacityX?: number;
}

interface PageDef {
  title: string;
  fields: FieldDef[];
}

interface PdfMapping {
  pages: Record<string, PageDef>;
  defaults: {
    fontSize: number;
    checkSize: number;
    signatureMaxW: number;
    signatureMaxH: number;
  };
}

interface InspectionData {
  [key: string]: any;
}

function normalizeFloor(value: string | null | undefined): string {
  const v = (value || "").toLowerCase().trim();
  if (v.includes("υπογ") && !v.includes("ημι")) return "basement";
  if (v.includes("ημιυπο")) return "semi-basement";
  if (v.includes("ισο")) return "ground";
  if (v.includes("ημιο")) return "half-floor";
  const n = v.replace(/[^0-9]/g, "");
  return n || "";
}

function drawText(page: any, text: string, x: number, y: number, font: any, size = 8.5) {
  if (!text) return;
  page.drawText(text, { x, y, size, font, color: BLACK });
}

function drawCheck(page: any, x: number, y: number, font: any, size = 9) {
  page.drawText("X", { x, y, size, font, color: BLACK });
}

function drawBoxedText(
  page: any,
  text: string,
  x: number,
  y: number,
  font: any,
  size: number,
  boxWidth: number,
  boxCount: number,
) {
  if (!text) return;
  const chars = text.replace(/\s/g, "").split("");
  for (let i = 0; i < Math.min(chars.length, boxCount); i++) {
    const charW = font.widthOfTextAtSize(chars[i], size);
    const cx = x + i * boxWidth + (boxWidth - charW) / 2;
    page.drawText(chars[i], { x: cx, y, size, font, color: BLACK });
  }
}

function drawCircleAround(page: any, x: number, y: number, radius = 7) {
  page.drawEllipse({
    x: x + radius / 2,
    y: y + radius / 2,
    xScale: radius,
    yScale: radius,
    borderColor: BLACK,
    borderWidth: 1.5,
  });
}

function drawWrappedText(
  page: any,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  font: any,
  size: number,
  maxLines = 6,
) {
  if (!text) return;
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let y = startY;
  let lines = 0;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
      continue;
    }

    drawText(page, line, x, y, font, size);
    y -= lineHeight;
    lines += 1;
    if (lines >= maxLines) return;
    line = word;
  }

  if (line && lines < maxLines) drawText(page, line, x, y, font, size);
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; isPng: boolean } | null {
  if (!dataUrl || !dataUrl.includes(",")) return null;
  const isPng = dataUrl.startsWith("data:image/png");
  const isJpg = dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg");
  if (!isPng && !isJpg) return null;

  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, isPng };
}

async function embedImage(
  pdfDoc: any,
  page: any,
  dataUrl: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
) {
  const parsed = dataUrlToBytes(dataUrl);
  if (!parsed) return;

  try {
    const img = parsed.isPng
      ? await pdfDoc.embedPng(parsed.bytes)
      : await pdfDoc.embedJpg(parsed.bytes);

    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    page.drawImage(img, { x, y, width: img.width * scale, height: img.height * scale });
  } catch (error) {
    console.error("Image embed error:", error);
  }
}

async function loadPdfMapping(adminClient: any): Promise<PdfMapping> {
  const { data, error } = await adminClient.storage.from("surveys").download("templates/pdf-mapping.json");
  if (error || !data) {
    throw new Error(`Mapping load failed: ${error?.message || "templates/pdf-mapping.json not found"}`);
  }

  const mappingText = await data.text();
  const mapping = JSON.parse(mappingText) as PdfMapping;

  if (!mapping?.pages || !mapping?.defaults) {
    throw new Error("Invalid pdf-mapping.json format");
  }

  return mapping;
}

async function processField(
  field: FieldDef,
  data: InspectionData,
  page: any,
  pdfDoc: any,
  font: any,
  boldFont: any,
  defaults: PdfMapping["defaults"],
) {
  const val = field.sourceKey ? data[field.sourceKey] : data[field.key];
  const size = field.size ?? defaults.fontSize;

  switch (field.type) {
    case "text": {
      const txt = val != null ? String(val) : "";
      drawText(page, txt, field.x!, field.y!, font, size);
      break;
    }
    case "boxed": {
      const txt = val != null ? String(val) : "";
      drawBoxedText(page, txt, field.x!, field.y!, font, size, field.boxWidth ?? 13.5, field.boxCount ?? 5);
      break;
    }
    case "wrapped": {
      const txt = val != null ? String(val) : "";
      drawWrappedText(page, txt, field.x!, field.y!, field.maxWidth ?? 500, field.lineHeight ?? 12, font, size, field.maxLines ?? 6);
      break;
    }
    case "check": {
      if (val) drawCheck(page, field.x!, field.y!, boldFont, defaults.checkSize);
      break;
    }
    case "check_if": {
      if (val === field.match) drawCircleAround(page, field.x!, field.y!);
      break;
    }
    case "check_if_not": {
      if (val !== field.match && val != null) drawCircleAround(page, field.x!, field.y!);
      break;
    }
    case "check_map": {
      const mapVal = val ? String(val) : "";
      const coord = field.map?.[mapVal];
      if (coord) drawCheck(page, coord.x, coord.y, boldFont, defaults.checkSize);
      break;
    }
    case "check_map_multi": {
      const values = val ? String(val).split(",").map((v: string) => v.trim()) : [];
      for (const v of values) {
        const coord = field.map?.[v];
        if (coord) drawCheck(page, coord.x, coord.y, boldFont, defaults.checkSize);
      }
      break;
    }
    case "floor_check": {
      const normalized = normalizeFloor(val);
      const coord = field.map?.[normalized];
      if (coord) drawCheck(page, coord.x, coord.y, boldFont, defaults.checkSize);
      break;
    }
    case "equipment_grid": {
      const prefix = field.key;
      const sizeVal = (data[`${prefix}_size`] || "").toUpperCase();
      const brandVal = (data[`${prefix}_brand`] || "").toUpperCase();
      const rowY = field.sizes?.[sizeVal];
      const colX = field.brands?.[brandVal];

      if (rowY != null && colX != null) drawCheck(page, colX, rowY, boldFont, defaults.checkSize);

      if (rowY != null && field.capacityX != null) {
        const cap = data[`${prefix}_capacity`] || "";
        if (cap) drawText(page, String(cap), field.capacityX, rowY, font, 8);
      }
      break;
    }
    case "signature": {
      if (val) {
        await embedImage(
          pdfDoc,
          page,
          val,
          field.x!,
          field.y!,
          field.maxW ?? defaults.signatureMaxW,
          field.maxH ?? defaults.signatureMaxH,
        );
      }
      break;
    }
    case "image": {
      if (val) {
        await embedImage(
          pdfDoc,
          page,
          val,
          field.x!,
          field.y!,
          field.maxW ?? 520,
          field.maxH ?? 280,
        );
      }
      break;
    }
    default:
      break;
  }
}

async function generateInspectionPdf(data: InspectionData, templateBytes: Uint8Array, adminClient: any): Promise<Uint8Array> {
  const [fontFile, boldFontFile, mapping] = await Promise.all([
    adminClient.storage.from("surveys").download("fonts/Roboto-Regular.ttf"),
    adminClient.storage.from("surveys").download("fonts/Roboto-Bold.ttf"),
    loadPdfMapping(adminClient),
  ]);

  if (fontFile.error || !fontFile.data) throw new Error(`Font load failed: ${fontFile.error?.message}`);
  if (boldFontFile.error || !boldFontFile.data) throw new Error(`Bold font load failed: ${boldFontFile.error?.message}`);

  const fontBytes = new Uint8Array(await fontFile.data.arrayBuffer());
  const boldFontBytes = new Uint8Array(await boldFontFile.data.arrayBuffer());
  console.log(`Font loaded: regular=${fontBytes.length} bytes, bold=${boldFontBytes.length} bytes`);

  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: true });

  const pages = pdfDoc.getPages();
  if (pages.length < Object.keys(mapping.pages).length) {
    throw new Error(`Το template PDF πρέπει να έχει ${Object.keys(mapping.pages).length} σελίδες`);
  }

  if (pages[0]) {
    console.log(`Page 1 dimensions: ${pages[0].getWidth()} x ${pages[0].getHeight()}`);
  }

  const pageEntries = Object.entries(mapping.pages).sort((a, b) => Number(a[0]) - Number(b[0]));

  for (const [pageNum, pageDef] of pageEntries) {
    const pageIndex = Number(pageNum) - 1;
    const page = pages[pageIndex];
    if (!page) continue;

    for (const field of pageDef.fields) {
      await processField(field, data, page, pdfDoc, font, boldFont, mapping.defaults);
    }
  }

  return new Uint8Array(await pdfDoc.save());
}

// ─── Main handler ────────────────────────────────────────────────────

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

    // Verify auth
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { assignment_id, sr_id, area } = await req.json();
    if (!assignment_id || !sr_id) {
      return new Response(JSON.stringify({ error: "Missing assignment_id or sr_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating inspection PDF for SR ${sr_id}`);

    // Get inspection report data
    const { data: report, error: reportErr } = await adminClient
      .from("inspection_reports")
      .select("*")
      .eq("assignment_id", assignment_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reportErr || !report) {
      return new Response(JSON.stringify({ error: "Inspection report not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load PDF template from storage + generate PDF
    const { data: templateFile, error: templateErr } = await adminClient
      .storage
      .from("surveys")
      .download("templates/inspection_template.pdf");

    if (templateErr || !templateFile) {
      throw new Error(`Template load failed: ${templateErr?.message || "not found"}`);
    }

    const templateBytes = new Uint8Array(await templateFile.arrayBuffer());
    const pdfBytes = await generateInspectionPdf(report, templateBytes, adminClient);
    console.log(`PDF generated: ${(pdfBytes.length / 1024).toFixed(0)}KB`);
    let driveUrl = "";
    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");

    if (serviceAccountKeyStr) {
      try {
        const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
        const accessToken = await getAccessToken(serviceAccountKey);

        // Find the SR folder's ΕΓΓΡΑΦΑ subfolder
        const { data: assignment } = await adminClient
          .from("assignments")
          .select("drive_folder_url, drive_egrafa_url")
          .eq("id", assignment_id)
          .single();

        let targetFolderId = "";

        const extractFolderId = (url?: string | null) => {
          if (!url) return "";
          const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
          return match?.[1] || "";
        };

        // 1) Prefer explicit ΕΓΓΡΑΦΑ URL from assignment
        targetFolderId = extractFolderId(assignment?.drive_egrafa_url);

        // 2) Resolve SR parent folder from assignment or fallback by SR name search
        let parentFolderId = extractFolderId(assignment?.drive_folder_url);
        let parentFolderUrl = assignment?.drive_folder_url || "";

        if (!parentFolderId && sr_id) {
          const safeSrId = String(sr_id).replace(/'/g, "\\'");
          const searchFolderIds = [
            "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO", // ΡΟΔΟΣ
            "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl", // ΚΩΣ
            "1dal55zb0uv5__e1pDk2fLFMB0ogi1OnZ", // ΡΟΔΟΣ/ΜΑΡΤΙΟΣ/ΠΡΟΔΕΣΜΕΥΣΗ ΓΙΑ ΚΑΤΑΣΚΕΥΗ
            "16Dr_1g6AkaypkyoePwcfZ8IanPX5TXeZ", // ΡΟΔΟΣ/ΜΑΡΤΙΟΣ/ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ
            "1azAHjT8LS8R3JOq0jYNh1UdBx4SYn-iM", // ΡΟΔΟΣ/ΜΑΡΤΙΟΣ/ΠΑΡΑΔΩΤΕΑ
            "1pIRjzexYG_JVFkoqfaG2_o_YfziGoFy_", // ΡΟΔΟΣ/ΜΑΡΤΙΟΣ
            "1C2E70l0PkCETaMPqywysYNMrDUcKMO5k", // ΠΑΡΑΔΕΙΓΜΑΤΑ
          ];

          let srFolders: any[] = [];
          for (const folderId of searchFolderIds) {
            srFolders = await driveSearch(
              accessToken,
              `name contains '${safeSrId}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
            );
            if (srFolders.length > 0) break;
          }

          if (srFolders.length > 0) {
            parentFolderId = srFolders[0].id;
            parentFolderUrl = srFolders[0].webViewLink || "";
            console.log(`Resolved SR folder by fallback search: ${srFolders[0].name}`);

            await adminClient
              .from("assignments")
              .update({ drive_folder_url: parentFolderUrl || null })
              .eq("id", assignment_id);
          }
        }

        // 3) Find/create ΕΓΓΡΑΦΑ inside SR folder
        if (!targetFolderId && parentFolderId) {
          const egrafaFolders = await driveSearch(
            accessToken,
            `name = 'ΕΓΓΡΑΦΑ' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
          );

          if (egrafaFolders.length > 0) {
            targetFolderId = egrafaFolders[0].id;

            await adminClient
              .from("assignments")
              .update({ drive_egrafa_url: egrafaFolders[0].webViewLink || null })
              .eq("id", assignment_id);
          } else {
            // If SR folder exists but ΕΓΓΡΑΦΑ does not, create it
            const createdEgrafa = await findOrCreateDriveFolder(accessToken, "ΕΓΓΡΑΦΑ", parentFolderId);
            targetFolderId = createdEgrafa.id;

            await adminClient
              .from("assignments")
              .update({ drive_egrafa_url: createdEgrafa.webViewLink || null })
              .eq("id", assignment_id);
          }
        }

        // 4) Absolute fallback: create SR + ΕΓΓΡΑΦΑ folders by area root
        if (!targetFolderId && sr_id) {
          const areaText = String(area || "").toUpperCase();
          const areaRootId = areaText.includes("ΚΩ")
            ? "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl" // ΚΩΣ
            : "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO"; // ΡΟΔΟΣ (default)

          const createdSrFolder = await findOrCreateDriveFolder(accessToken, String(sr_id), areaRootId);
          const createdEgrafa = await findOrCreateDriveFolder(accessToken, "ΕΓΓΡΑΦΑ", createdSrFolder.id);

          parentFolderId = createdSrFolder.id;
          parentFolderUrl = createdSrFolder.webViewLink || "";
          targetFolderId = createdEgrafa.id;

          await adminClient
            .from("assignments")
            .update({
              drive_folder_url: parentFolderUrl || null,
              drive_egrafa_url: createdEgrafa.webViewLink || null,
            })
            .eq("id", assignment_id);

          console.log(`Created fallback Drive folders for SR ${sr_id}`);
        }

        if (!targetFolderId) {
          console.warn(`No Drive folder resolved for SR ${sr_id}; skipping Drive upload`);
        }

        if (targetFolderId) {
          const uploaded = await uploadFileToDrive(
            accessToken,
            `Deltio_Autopsias_${sr_id}.pdf`,
            "application/pdf",
            pdfBytes,
            targetFolderId
          );
          driveUrl = uploaded.webViewLink || "";
          console.log(`Uploaded inspection PDF to Drive: ${uploaded.name}`);
        }
      } catch (driveErr) {
        console.error("Drive upload error (non-blocking):", driveErr);
      }
    }

    // Update inspection report with PDF status
    await adminClient
      .from("inspection_reports")
      .update({
        pdf_generated: true,
        pdf_drive_url: driveUrl || null,
      })
      .eq("id", report.id);

    return new Response(
      JSON.stringify({
        success: true,
        pdf_size: pdfBytes.length,
        drive_url: driveUrl || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
