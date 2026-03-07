import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zipSync } from "https://esm.sh/fflate@0.8.2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

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
    "authorization, x-client-info, apikey, content-type",
};

const greekMonths: Record<number, string> = {
  0: "ΙΑΝΟΥΑΡΙΟΣ", 1: "ΦΕΒΡΟΥΑΡΙΟΣ", 2: "ΜΑΡΤΙΟΣ",
  3: "ΑΠΡΙΛΙΟΣ", 4: "ΜΑΙΟΣ", 5: "ΙΟΥΝΙΟΣ",
  6: "ΙΟΥΛΙΟΣ", 7: "ΑΥΓΟΥΣΤΟΣ", 8: "ΣΕΠΤΕΜΒΡΙΟΣ",
  9: "ΟΚΤΩΒΡΙΟΣ", 10: "ΝΟΕΜΒΡΙΟΣ", 11: "ΔΕΚΕΜΒΡΙΟΣ",
};

const SHARED_DRIVE_ID = "0AN9VpmNEa7QBUk9PVA";

const areaRootFolders: Record<string, string> = {
  "ΡΟΔΟΣ": "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO",
  "ΚΩΣ": "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl",
};

// Required file types for a complete survey
const REQUIRED_FILE_TYPES = ["building_photo", "screenshot", "inspection_form"];

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
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink)&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${SHARED_DRIVE_ID}`;
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

async function uploadFileToDrive(
  accessToken: string, fileName: string, mimeType: string,
  fileData: Uint8Array, parentId: string
): Promise<any> {
  // Step 1: Initiate resumable upload session
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

  // Step 2: Upload file content
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileData.byteLength),
    },
    body: fileData,
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${await uploadRes.text()}`);
  return await uploadRes.json();
}

async function moveDriveFile(accessToken: string, fileId: string, fromParentId: string, toParentId: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${toParentId}&removeParents=${fromParentId}&supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    }
  );
  if (!res.ok) throw new Error(`Move failed: ${await res.text()}`);
}

// Find or create a subfolder inside a parent
async function findOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const existing = await driveSearch(
    accessToken,
    `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  if (existing.length > 0) return existing[0];
  return await createDriveFolder(accessToken, name, parentId);
}

// Get the target parent folder (ΑΝΑΜΟΝΗ or ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ) under area → month
async function getTargetParentFolder(
  accessToken: string, area: string, isComplete: boolean
): Promise<{ folderId: string; folderType: string } | null> {
  const rootId = areaRootFolders[area];
  if (!rootId) return null;

  const currentMonth = greekMonths[new Date().getMonth()];
  console.log(`Looking for month folder: ${currentMonth} under root ${rootId}`);

  // Find month folder
  const monthFolder = await findOrCreateFolder(accessToken, currentMonth, rootId);
  console.log(`Month folder: ${monthFolder.name} (${monthFolder.id})`);

  // Determine target subfolder
  const targetName = isComplete ? "ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ" : "ΑΝΑΜΟΝΗ";
  const targetFolder = await findOrCreateFolder(accessToken, targetName, monthFolder.id);
  console.log(`Target folder: ${targetFolder.name} (${targetFolder.id})`);

  return { folderId: targetFolder.id, folderType: targetName };
}

// ─── PDF Generation (from inspection form photos) ───────────────────

async function generateInspectionPDF(
  inspectionImages: { fileName: string; data: Uint8Array }[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const img of inspectionImages) {
    const ext = img.fileName.split(".").pop()?.toLowerCase() || "";
    let embeddedImage;
    try {
      if (ext === "png") {
        embeddedImage = await pdfDoc.embedPng(img.data);
      } else {
        // Try JPEG for jpg/jpeg/webp and any other format
        embeddedImage = await pdfDoc.embedJpg(img.data);
      }
    } catch (embedErr) {
      console.error(`Failed to embed image ${img.fileName}:`, embedErr);
      continue;
    }

    // Create A4 page and fit image inside with aspect ratio
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 30;
    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - margin * 2;

    const imgAspect = embeddedImage.width / embeddedImage.height;
    let drawW = maxW;
    let drawH = drawW / imgAspect;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH * imgAspect;
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embeddedImage, {
      x: (pageWidth - drawW) / 2,
      y: (pageHeight - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  // If no images were embedded, create a blank page with a note
  if (pdfDoc.getPageCount() === 0) {
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText("No inspection form images available", { x: 50, y: 400, font, size: 14 });
  }

  return await pdfDoc.save();
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === serviceRoleKey;
    if (!isServiceRole) {
      const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { survey_id, sr_id, area } = await req.json();
    if (!survey_id || !sr_id || !area) {
      return new Response(JSON.stringify({ error: "Missing survey_id, sr_id or area" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing survey: SR ${sr_id}, area ${area}`);

    // 1. Get assignment info
    const { data: assignment } = await adminClient
      .from("assignments")
      .select("customer_name, address, phone")
      .eq("sr_id", sr_id)
      .limit(1)
      .single();

    const customerName = assignment?.customer_name || "UNKNOWN";
    const address = assignment?.address || "";
    const phone = assignment?.phone || "";

    // 2. Get survey info (for technician name)
    const { data: survey } = await adminClient
      .from("surveys")
      .select("technician_id, comments")
      .eq("id", survey_id)
      .single();

    let technicianName = "Technician";
    if (survey?.technician_id) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("user_id", survey.technician_id)
        .single();
      technicianName = profile?.full_name || "Technician";
    }

    // 3. Get survey files & check completeness
    const { data: surveyFiles } = await adminClient
      .from("survey_files")
      .select("*")
      .eq("survey_id", survey_id);

    if (!surveyFiles || surveyFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No files found for survey" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const presentTypes = [...new Set(surveyFiles.map((f: any) => f.file_type))];
    const missingTypes = REQUIRED_FILE_TYPES.filter((t) => !presentTypes.includes(t));
    const isComplete = missingTypes.length === 0;

    console.log(`File check: present=${presentTypes.join(",")}, missing=${missingTypes.join(",")}, complete=${isComplete}`);

    // 4. Download all files from storage
    const fileEntries: Record<string, Uint8Array> = {};
    for (const sf of surveyFiles) {
      const { data: fileData, error: dlError } = await adminClient.storage
        .from("surveys")
        .download(sf.file_path);
      if (dlError || !fileData) {
        console.error(`Failed to download ${sf.file_path}:`, dlError);
        continue;
      }
      const arrayBuf = await fileData.arrayBuffer();
      fileEntries[sf.file_name] = new Uint8Array(arrayBuf);
    }

    if (Object.keys(fileEntries).length === 0) {
      return new Response(JSON.stringify({ error: "Failed to download files" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Generate PDF from inspection form photos
    const inspectionFiles = surveyFiles.filter((f: any) => f.file_type === "inspection_form");
    const inspectionImages: { fileName: string; data: Uint8Array }[] = [];
    for (const sf of inspectionFiles) {
      if (fileEntries[sf.file_name]) {
        inspectionImages.push({ fileName: sf.file_name, data: fileEntries[sf.file_name] });
      }
    }

    const pdfBytes = await generateInspectionPDF(inspectionImages);
    const pdfFileName = `Deltio_Autopsias_${sr_id}.pdf`;
    fileEntries[pdfFileName] = pdfBytes;
    console.log(`Generated PDF from ${inspectionImages.length} inspection photos: ${pdfFileName} (${pdfBytes.length} bytes)`);

    // 6. Google Drive: create folder in correct location
    const folderName = `${sr_id} - ${customerName}`;
    let driveFolderUrl = "";
    let driveTargetType = "";

    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (serviceAccountKeyStr) {
      try {
        const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
        const accessToken = await getAccessToken(serviceAccountKey);

        const target = await getTargetParentFolder(accessToken, area, isComplete);
        if (target) {
          driveTargetType = target.folderType;

          // Check if folder already exists (e.g. was in ΑΝΑΜΟΝΗ, now moving to ΟΛΟΚΛΗΡΩΜΕΝΕΣ)
          const existingInTarget = await driveSearch(
            accessToken,
            `name = '${folderName}' and '${target.folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
          );

          let folder: any;
          if (existingInTarget.length > 0) {
            folder = existingInTarget[0];
            console.log(`Found existing folder in ${target.folderType}: ${folder.id}`);
          } else {
            // Check if it exists in the OTHER folder (needs moving)
            const otherTargetName = isComplete ? "ΑΝΑΜΟΝΗ" : "ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ";
            const rootId = areaRootFolders[area];
            const currentMonth = greekMonths[new Date().getMonth()];
            const monthFolders = await driveSearch(
              accessToken,
              `name = '${currentMonth}' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
            );

            let movedFromOther = false;
            if (monthFolders.length > 0) {
              const otherFolders = await driveSearch(
                accessToken,
                `name = '${otherTargetName}' and '${monthFolders[0].id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
              );
              if (otherFolders.length > 0) {
                const existingInOther = await driveSearch(
                  accessToken,
                  `name = '${folderName}' and '${otherFolders[0].id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
                );
                if (existingInOther.length > 0) {
                  // Move from other folder to target
                  await moveDriveFile(accessToken, existingInOther[0].id, otherFolders[0].id, target.folderId);
                  folder = existingInOther[0];
                  movedFromOther = true;
                  console.log(`Moved folder from ${otherTargetName} to ${target.folderType}`);
                }
              }
            }

            if (!folder) {
              folder = await createDriveFolder(accessToken, folderName, target.folderId);
              console.log(`Created folder: ${folder.name} in ${target.folderType}`);
            }
          }

          driveFolderUrl = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;

          // Create subfolders: ΕΓΓΡΑΦΑ and ΠΡΟΜΕΛΕΤΗ
          const egrafaFolder = await findOrCreateFolder(accessToken, "ΕΓΓΡΑΦΑ", folder.id);
          const promelethFolder = await findOrCreateFolder(accessToken, "ΠΡΟΜΕΛΕΤΗ", folder.id);
          console.log(`Created subfolders: ΕΓΓΡΑΦΑ (${egrafaFolder.id}), ΠΡΟΜΕΛΕΤΗ (${promelethFolder.id})`);

          // Build a map of file_name → file_type from surveyFiles
          const fileTypeMap: Record<string, string> = {};
          for (const sf of surveyFiles) {
            fileTypeMap[sf.file_name] = sf.file_type;
          }

          const mimeMap: Record<string, string> = {
            jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
            gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
          };

          // Generate PDF from building photos (all building_photo images → single PDF)
          const buildingFiles = surveyFiles.filter((f: any) => f.file_type === "building_photo");
          const buildingImages: { fileName: string; data: Uint8Array }[] = [];
          for (const sf of buildingFiles) {
            if (fileEntries[sf.file_name]) {
              buildingImages.push({ fileName: sf.file_name, data: fileEntries[sf.file_name] });
            }
          }
          if (buildingImages.length > 0) {
            const buildingPdfBytes = await generateInspectionPDF(buildingImages);
            const buildingPdfName = `Photos_Ktiriou_${sr_id}.pdf`;
            await uploadFileToDrive(accessToken, buildingPdfName, "application/pdf", buildingPdfBytes, promelethFolder.id);
            console.log(`Uploaded building photos PDF to ΠΡΟΜΕΛΕΤΗ: ${buildingPdfName}`);
          }

          // Also upload individual building photos to ΠΡΟΜΕΛΕΤΗ
          for (const sf of buildingFiles) {
            if (fileEntries[sf.file_name]) {
              const ext = sf.file_name.split(".").pop()?.toLowerCase() || "";
              const mimeType = mimeMap[ext] || "application/octet-stream";
              await uploadFileToDrive(accessToken, sf.file_name, mimeType, fileEntries[sf.file_name], promelethFolder.id);
              console.log(`Uploaded to ΠΡΟΜΕΛΕΤΗ: ${sf.file_name}`);
            }
          }

          // Upload screenshots (ΧΕΜΔ & AutoCAD) to ΕΓΓΡΑΦΑ
          const screenshotFiles = surveyFiles.filter((f: any) => f.file_type === "screenshot");
          for (const sf of screenshotFiles) {
            if (fileEntries[sf.file_name]) {
              const ext = sf.file_name.split(".").pop()?.toLowerCase() || "";
              const mimeType = mimeMap[ext] || "application/octet-stream";
              await uploadFileToDrive(accessToken, sf.file_name, mimeType, fileEntries[sf.file_name], egrafaFolder.id);
              console.log(`Uploaded to ΕΓΓΡΑΦΑ: ${sf.file_name}`);
            }
          }

          // Upload inspection PDF (Δελτίο Αυτοψίας) to ΕΓΓΡΑΦΑ
          await uploadFileToDrive(accessToken, pdfFileName, "application/pdf", pdfBytes, egrafaFolder.id);
          console.log(`Uploaded inspection PDF to ΕΓΓΡΑΦΑ: ${pdfFileName}`);

          // Update assignment with Drive folder URL
          await adminClient
            .from("assignments")
            .update({ drive_folder_url: driveFolderUrl })
            .eq("sr_id", sr_id);
        }
      } catch (driveErr) {
        console.error("Drive error (non-blocking):", driveErr);
      }
    }

    // 7. Update status based on completeness
    let newAssignmentStatus = isComplete ? "construction" : "pending";
    const newSurveyStatus = isComplete ? "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ" : "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ";

    // If survey still incomplete, check if GIS was already uploaded → keep pre_committed
    if (!isComplete) {
      const { data: gisExists } = await adminClient
        .from("gis_data")
        .select("id")
        .eq("sr_id", sr_id)
        .maybeSingle();
      if (gisExists) {
        newAssignmentStatus = "pre_committed";
      }
    }
    
    await adminClient
      .from("assignments")
      .update({ status: newAssignmentStatus })
      .eq("sr_id", sr_id);
    
    await adminClient
      .from("surveys")
      .update({ status: newSurveyStatus })
      .eq("id", survey_id);
    
    console.log(`Assignment ${sr_id} status → ${newAssignmentStatus}, Survey → ${newSurveyStatus}`);

    // 8. Send email only if COMPLETE
    let emailSent = false;
    if (isComplete) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      
      // Get org settings for email recipients
      const { data: orgEmailSettings } = await adminClient
        .from("org_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", orgId);

      const emailSettingsMap: Record<string, string> = {};
      (orgEmailSettings || []).forEach((s: any) => {
        emailSettingsMap[s.setting_key] = s.setting_value;
      });

      const toEmails = emailSettingsMap["report_to_emails"] || "";
      const ccEmails = emailSettingsMap["report_cc_emails"] || "";
      const recipients = toEmails.split(",").map((e: string) => e.trim()).filter(Boolean);
      const ccRecipients = ccEmails.split(",").map((e: string) => e.trim()).filter(Boolean);

      if (resendApiKey && recipients.length > 0) {
        try {
          const zipData = zipSync(fileEntries);
          const zipBase64 = uint8ToBase64(zipData);
          const zipFileName = `${folderName}.zip`;

          const escapedSrId = sr_id.replace(/[<>&"']/g, (c: string) => `&#${c.charCodeAt(0)};`);
          const escapedName = customerName.replace(/[<>&"']/g, (c: string) => `&#${c.charCodeAt(0)};`);
          const escapedAddress = address.replace(/[<>&"']/g, (c: string) => `&#${c.charCodeAt(0)};`);
          const escapedPhone = phone.replace(/[<>&"']/g, (c: string) => `&#${c.charCodeAt(0)};`);

          const emailHtml = `
            <div style="font-family:Arial,sans-serif;padding:20px;">
              <h2 style="color:#1a73e8;">Ολοκληρωμένη Αυτοψία - ${escapedSrId}</h2>
              <table style="border-collapse:collapse;margin:16px 0;">
                <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">SR ID:</td><td>${escapedSrId}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Πελάτης:</td><td>${escapedName}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Διεύθυνση:</td><td>${escapedAddress || "—"}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Τηλέφωνο:</td><td>${escapedPhone || "—"}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Περιοχή:</td><td>${area}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Τεχνικός:</td><td>${technicianName}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Αρχεία:</td><td>${surveyFiles.length} αρχεία + PDF δελτίο</td></tr>
                ${driveFolderUrl ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Drive:</td><td><a href="${driveFolderUrl}">Άνοιγμα φακέλου</a></td></tr>` : ""}
              </table>
              <p style="color:#666;font-size:13px;">Το συνημμένο ZIP περιέχει όλα τα αρχεία αυτοψίας και το PDF δελτίο.</p>
            </div>
          `;

          const emailPayload: any = {
            from: `DeltaNet FTTH <${emailSettingsMap["email_from"] || "onboarding@resend.dev"}>`,
            to: recipients,
            subject: `Αυτοψία ${sr_id} - ${customerName} - ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ`,
            html: emailHtml,
            attachments: [{ filename: zipFileName, content: zipBase64 }],
          };

          if (ccRecipients.length > 0) {
            emailPayload.cc = ccRecipients;
          }

          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(emailPayload),
          });

          if (!emailRes.ok) {
            console.error("Resend error:", await emailRes.text());
          } else {
            console.log(`Email sent to: ${recipients.join(", ")}`);
            emailSent = true;
            await adminClient
              .from("surveys")
              .update({ email_sent: true })
              .eq("id", survey_id);
          }
        } catch (emailErr) {
          console.error("Email error (non-blocking):", emailErr);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        is_complete: isComplete,
        missing_types: missingTypes,
        folder_name: folderName,
        drive_folder_url: driveFolderUrl || null,
        drive_target: driveTargetType,
        email_sent: emailSent,
        files_count: Object.keys(fileEntries).length,
        pdf_generated: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process survey error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
