import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget upload of a photo to Google Drive.
 * Called after a successful Supabase Storage upload.
 */
export function uploadPhotoDrive(
  srId: string,
  category: string,
  filePath: string,
  fileName?: string
): void {
  supabase.functions
    .invoke("upload-photo-to-drive", {
      body: {
        sr_id: srId,
        category,
        file_path: filePath,
        file_name: fileName || filePath.split("/").pop() || "photo.jpg",
      },
    })
    .then(({ error }) => {
      if (error) {
        console.error(`Drive upload failed for ${filePath}:`, error);
      }
    })
    .catch((err) => {
      console.error(`Drive upload error for ${filePath}:`, err);
    });
}
