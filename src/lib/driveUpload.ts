import { supabase } from "@/integrations/supabase/client";

export interface DriveUploadResult {
  uploaded: boolean;
  deleted: boolean;
  driveFileId?: string;
  webViewLink?: string;
  error?: string;
}

/**
 * Upload a photo to Google Drive and delete from Supabase Storage.
 * Fire-and-forget — does not block the UI.
 * Returns the result promise for optional chaining.
 */
export function uploadPhotoDrive(
  srId: string,
  category: string,
  filePath: string,
  fileName?: string
): Promise<DriveUploadResult> {
  return supabase.functions
    .invoke("upload-photo-to-drive", {
      body: {
        sr_id: srId,
        category,
        file_path: filePath,
        file_name: fileName || filePath.split("/").pop() || "photo.jpg",
      },
    })
    .then(({ data, error }) => {
      if (error) {
        console.error(`Drive upload failed for ${filePath}:`, error);
        return { uploaded: false, deleted: false, error: error.message };
      }
      const result = data as DriveUploadResult;
      if (result?.uploaded) {
        console.log(`✅ ${filePath} → Drive${result.deleted ? " (deleted from Storage)" : ""}`);
      }
      return result || { uploaded: false, deleted: false };
    })
    .catch((err) => {
      console.error(`Drive upload error for ${filePath}:`, err);
      return { uploaded: false, deleted: false, error: err.message };
    });
}
