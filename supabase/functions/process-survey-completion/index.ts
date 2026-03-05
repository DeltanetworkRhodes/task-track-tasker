import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2";
import { encode as base64Encode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Greek month names for folder search
const greekMonths: Record<number, string> = {
  0: "ΙΑΝΟΥΑΡΙΟΣ", 1: "ΦΕΒΡΟΥΑΡΙΟΣ", 2: "ΜΑΡΤΙΟΣ",
  3: "ΑΠΡΙΛΙΟΣ", 4: "ΜΑΙΟΣ", 5: "ΙΟΥΝΙΟΣ",
  6: "ΙΟΥΛΙΟΣ", 7: "ΑΥΓΟΥΣΤΟΣ", 8: "ΣΕΠΤΕΜΒΡΙΟΣ",
  9: "ΟΚΤΩΒΡΙΟΣ", 10: "ΝΟΕΜΒΡΙΟΣ", 11: "ΔΕΚΕΜΒΡΙΟΣ",
};

// Area root folder IDs in Drive
const areaRootFolders: Record<string, string> = {
  "ΡΟΔΟΣ": "1JvcSG3tiOplSujXhb3yj_ELQLjfrgOzO",
  "ΚΩΣ": "1X1mtK4tV_sgGM9IdizNSK7AS19qX1nYl",
};

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
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signatureInput
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
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
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink)&pageSize=50`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).files || [];
}

async function createDriveFolder(accessToken: string, name: string, parentId: string): Promise<any> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
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
  accessToken: string,
  fileName: string,
  mimeType: string,
  fileData: Uint8Array,
  parentId: string
): Promise<any> {
  const metadata = JSON.stringify({ name: fileName, parents: [parentId] });
  const boundary = "===boundary===";
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
    base64Encode(fileData) +
    `\r\n--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
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

async function findOlokliromenesFolderId(
  accessToken: string,
  area: string
): Promise<string | null> {
  const rootId = areaRootFolders[area];
  if (!rootId) return null;

  const currentMonth = greekMonths[new Date().getMonth()];

  // Search for current month folder under area root
  const monthFolders = await driveSearch(
    accessToken,
    `name = '${currentMonth}' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );

  if (monthFolders.length === 0) {
    // Try direct search for ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ under root
    const direct = await driveSearch(
      accessToken,
      `name = 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    );
    return direct.length > 0 ? direct[0].id : null;
  }

  // Search for ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ inside month folder
  const olokFolders = await driveSearch(
    accessToken,
    `name = 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ' and '${monthFolders[0].id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );

  return olokFolders.length > 0 ? olokFolders[0].id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { survey_id, sr_id, area } = await req.json();
    if (!survey_id || !sr_id || !area) {
      return new Response(JSON.stringify({ error: "Missing survey_id, sr_id or area" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing survey completion: SR ${sr_id}, area ${area}`);

    // 1. Get assignment info for customer details
    const { data: assignment } = await adminClient
      .from("assignments")
      .select("customer_name, address, phone")
      .eq("sr_id", sr_id)
      .limit(1)
      .single();

    const customerName = assignment?.customer_name || "ΑΓΝΩΣΤΟ";
    const address = assignment?.address || "";
    const phone = assignment?.phone || "";

    // 2. Get survey files from DB
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

    // 3. Download all files from Supabase storage
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

    // Folder name: SR_ID - ΟΝΟΜΑ - ΔΙΕΥΘΥΝΣΗ
    const folderName = `${sr_id} - ${customerName}${address ? ` - ${address}` : ""}`;

    // 4. Google Drive: Create folder in ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ
    let driveFolderUrl = "";
    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (serviceAccountKeyStr) {
      try {
        const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
        const accessToken = await getAccessToken(serviceAccountKey);

        const parentFolderId = await findOlokliromenesFolderId(accessToken, area);
        if (parentFolderId) {
          const folder = await createDriveFolder(accessToken, folderName, parentFolderId);
          driveFolderUrl = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;
          console.log(`Created Drive folder: ${folder.name} (${folder.id})`);

          // Upload files to Drive folder
          for (const [fileName, fileData] of Object.entries(fileEntries)) {
            const ext = fileName.split(".").pop()?.toLowerCase() || "";
            const mimeMap: Record<string, string> = {
              jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
              gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
            };
            const mimeType = mimeMap[ext] || "application/octet-stream";
            await uploadFileToDrive(accessToken, fileName, mimeType, fileData, folder.id);
            console.log(`Uploaded to Drive: ${fileName}`);
          }

          // Update assignment with Drive folder URL
          await adminClient
            .from("assignments")
            .update({ drive_folder_url: driveFolderUrl })
            .eq("sr_id", sr_id);
        } else {
          console.warn(`ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΑΥΤΟΨΙΕΣ folder not found for area: ${area}`);
        }
      } catch (driveErr) {
        console.error("Drive error (non-blocking):", driveErr);
      }
    }

    // 5. Update assignment status to pre_committed
    await adminClient
      .from("assignments")
      .update({ status: "pre_committed" })
      .eq("sr_id", sr_id);
    console.log(`Assignment ${sr_id} status → pre_committed`);

    // 6. Create ZIP file
    const zipData = zipSync(fileEntries);
    const zipFileName = `${folderName}.zip`;

    // 7. Send email with ZIP via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const { data: emailSetting } = await adminClient
      .from("email_settings")
      .select("setting_value")
      .eq("setting_key", "survey_recipients")
      .single();

    const recipients = emailSetting?.setting_value?.split(",").map((e: string) => e.trim()).filter(Boolean) || [];

    if (resendApiKey && recipients.length > 0) {
      try {
        const zipBase64 = base64Encode(zipData);

        const emailHtml = `
          <div style="font-family:Arial,sans-serif;padding:20px;">
            <h2 style="color:#1a73e8;">Ολοκληρωμένη Αυτοψία - ${sr_id}</h2>
            <table style="border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">SR ID:</td><td>${sr_id}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Πελάτης:</td><td>${customerName}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Διεύθυνση:</td><td>${address || "—"}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Τηλέφωνο:</td><td>${phone || "—"}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Περιοχή:</td><td>${area}</td></tr>
              <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Αρχεία:</td><td>${surveyFiles.length} αρχεία</td></tr>
              ${driveFolderUrl ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Drive:</td><td><a href="${driveFolderUrl}">Άνοιγμα φακέλου</a></td></tr>` : ""}
            </table>
            <p style="color:#666;font-size:13px;">Το συνημμένο ZIP περιέχει όλα τα αρχεία αυτοψίας.</p>
          </div>
        `;

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "DeltaNet FTTH <onboarding@resend.dev>",
            to: recipients,
            subject: `Αυτοψία ${sr_id} - ${customerName} - ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ`,
            html: emailHtml,
            attachments: [
              {
                filename: zipFileName,
                content: zipBase64,
              },
            ],
          }),
        });

        if (!emailRes.ok) {
          console.error("Resend error:", await emailRes.text());
        } else {
          console.log(`Email sent to: ${recipients.join(", ")}`);
          // Mark survey email_sent
          await adminClient
            .from("surveys")
            .update({ email_sent: true })
            .eq("id", survey_id);
        }
      } catch (emailErr) {
        console.error("Email error (non-blocking):", emailErr);
      }
    } else {
      console.warn("No Resend API key or no recipients configured");
    }

    return new Response(
      JSON.stringify({
        success: true,
        folder_name: folderName,
        drive_folder_url: driveFolderUrl || null,
        email_sent: resendApiKey && recipients.length > 0,
        files_count: Object.keys(fileEntries).length,
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
