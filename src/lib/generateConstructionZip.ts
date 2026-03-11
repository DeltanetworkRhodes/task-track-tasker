import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

/* ────────────────────────────────────────────
   Folder display names (ASCII → Greek for ZIP)
   ──────────────────────────────────────────── */

const PHOTO_FOLDER_MAP: Record<string, string> = {
  SKAMA: "ΣΚΑΜΑ",
  ODEFSI: "ΟΔΕΥΣΗ",
  BCP: "BCP",
  BEP: "BEP",
  BMO: "BMO",
  FB: "FB",
  KAMPINA: "ΚΑΜΠΙΝΑ",
  G_FASI: "Γ_ΦΑΣΗ",
};

const OTDR_FOLDER_MAP: Record<string, string> = {
  OTDR_BMO: "BMO",
  OTDR_KAMPINA: "ΚΑΜΠΙΝΑ",
  OTDR_BEP: "BEP",
  OTDR_BCP: "BCP",
  OTDR_LIVE: "LIVE",
};

/* ────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────── */

function sanitizeFilename(name: string, maxLen = 80): string {
  return name
    .replace(/[^a-zA-Z0-9Α-Ωα-ωά-ώ\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, maxLen);
}

function classifyStorageFolder(folderName: string): { type: "photo" | "otdr" | "unknown"; displayName: string } {
  if (PHOTO_FOLDER_MAP[folderName]) {
    return { type: "photo", displayName: PHOTO_FOLDER_MAP[folderName] };
  }
  // OTDR folders (OTDR_BMO, OTDR_FB_01, etc.)
  if (folderName.startsWith("OTDR_")) {
    const otdrKey = folderName;
    if (OTDR_FOLDER_MAP[otdrKey]) {
      return { type: "otdr", displayName: OTDR_FOLDER_MAP[otdrKey] };
    }
    // FB floor variants: OTDR_FB_00, OTDR_FB_01, etc.
    if (folderName.startsWith("OTDR_FB_")) {
      const floorNum = folderName.replace("OTDR_FB_", "");
      return { type: "otdr", displayName: `FB/${floorNum}` };
    }
    return { type: "otdr", displayName: folderName.replace("OTDR_", "") };
  }
  return { type: "unknown", displayName: folderName };
}

async function downloadStorageFile(path: string): Promise<{ data: ArrayBuffer; name: string } | null> {
  try {
    const { data, error } = await supabase.storage.from("photos").download(path);
    if (error || !data) return null;
    const name = path.split("/").pop() || "file";
    return { data: await data.arrayBuffer(), name };
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────
   List all files in a storage prefix
   ──────────────────────────────────────────── */

interface StorageFileInfo {
  path: string;
  name: string;
  folder: string;
  updatedAt: string;
}

async function listConstructionFiles(prefix: string): Promise<StorageFileInfo[]> {
  const results: StorageFileInfo[] = [];

  // List top-level folders under the construction prefix
  const { data: folders, error } = await supabase.storage.from("photos").list(prefix);
  if (error || !folders) return results;

  for (const item of folders) {
    if (item.id === null) {
      // It's a folder — list its contents
      const folderPath = `${prefix}/${item.name}`;
      const { data: files } = await supabase.storage.from("photos").list(folderPath);
      if (files) {
        for (const file of files) {
          if (file.id !== null) {
            results.push({
              path: `${folderPath}/${file.name}`,
              name: file.name,
              folder: item.name,
              updatedAt: file.updated_at || file.created_at || "",
            });
          }
        }
      }
    } else {
      // It's a file at root level
      results.push({
        path: `${prefix}/${item.name}`,
        name: item.name,
        folder: "",
        updatedAt: item.updated_at || item.created_at || "",
      });
    }
  }

  return results;
}

/* ────────────────────────────────────────────
   Main ZIP generator
   ──────────────────────────────────────────── */

export interface ZipExportResult {
  success: boolean;
  fileCount: number;
  warnings: string[];
}

export async function generateConstructionZip(
  srId: string,
  address: string,
  constructionId: string,
  asBuiltBlob?: Blob | null
): Promise<ZipExportResult> {
  const warnings: string[] = [];
  const zip = new JSZip();

  // Build root folder name
  const rootName = sanitizeFilename(`SR-${srId}_${address || "ΧΩΡΙΣ_ΔΙΕΥΘΥΝΣΗ"}`);

  // 1. List all files in storage for this construction
  const safeSrId = srId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const storagePrefix = `constructions/${safeSrId}/${constructionId}`;
  const storageFiles = await listConstructionFiles(storagePrefix);

  if (storageFiles.length === 0) {
    warnings.push("Δεν βρέθηκαν αρχεία στο storage για αυτή την κατασκευή");
  }

  // 2. Download and organize files
  let photoCount = 0;

  for (const sf of storageFiles) {
    const downloaded = await downloadStorageFile(sf.path);
    if (!downloaded) {
      warnings.push(`Αποτυχία λήψης: ${sf.name}`);
      continue;
    }

    const classification = classifyStorageFolder(sf.folder);
    let zipPath: string;

    if (classification.type === "photo") {
      zipPath = `${rootName}/Φωτογραφίες/${classification.displayName}/${downloaded.name}`;
      photoCount++;
    } else if (classification.type === "otdr") {
      zipPath = `${rootName}/Φωτογραφίες/OTDR/${classification.displayName}/${downloaded.name}`;
      photoCount++;
    } else if (sf.folder) {
      zipPath = `${rootName}/Φωτογραφίες/ΛΟΙΠΕΣ/${downloaded.name}`;
      photoCount++;
    } else {
      zipPath = `${rootName}/${downloaded.name}`;
    }

    zip.file(zipPath, downloaded.data);
  }

  // 3. Add pre-work photos if they exist
  const preWorkPrefix = `pre-work/${constructionId}`;
  const { data: preWorkFiles } = await supabase.storage.from("photos").list(preWorkPrefix);
  if (preWorkFiles && preWorkFiles.length > 0) {
    for (const pf of preWorkFiles) {
      if (pf.id === null) continue;
      const downloaded = await downloadStorageFile(`${preWorkPrefix}/${pf.name}`);
      if (downloaded) {
        zip.file(`${rootName}/Φωτογραφίες/PRE-WORK/${downloaded.name}`, downloaded.data);
        photoCount++;
      }
    }
  }

  // 4. Add AS-BUILD Excel if provided
  if (asBuiltBlob) {
    zip.file(`${rootName}/AS-BUILD/SR-${srId}_AS-BUILD.xlsx`, asBuiltBlob);
  }

  // 5. Add README.txt
  const now = new Date();
  const readmeContent = [
    `SR ID: ${srId}`,
    `Διεύθυνση: ${address || "—"}`,
    `Ημερομηνία Export: ${now.toLocaleString("el-GR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })}`,
    `Σύνολο Φωτογραφιών: ${photoCount}`,
    `Παράχθηκε από: deltanetwork.app`,
  ].join("\n");
  zip.file(`${rootName}/README.txt`, readmeContent);

  // 6. Generate and download ZIP
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const zipFileName = `${rootName}.zip`;

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return {
    success: true,
    fileCount: photoCount + (asBuiltBlob ? 1 : 0),
    warnings,
  };
}
