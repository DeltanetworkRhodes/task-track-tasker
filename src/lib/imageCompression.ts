import imageCompression from "browser-image-compression";

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: "image/jpeg" as const,
};

/**
 * Compress a single image using browser-image-compression (Web Worker).
 * Non-image files are returned as-is.
 */
export const compressImage = async (
  file: File,
  opts: Partial<typeof COMPRESSION_OPTIONS> = {}
): Promise<File> => {
  if (!file.type.startsWith("image/")) return file;

  const options = { ...COMPRESSION_OPTIONS, ...opts };

  try {
    const compressed = await imageCompression(file, options);
    // Ensure we get a File (not Blob) with a .jpg name
    const result = new File(
      [compressed],
      file.name.replace(/\.\w+$/, ".jpg"),
      { type: "image/jpeg" }
    );
    console.log(
      `Compressed ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(result.size / 1024).toFixed(0)}KB`
    );
    return result;
  } catch (err) {
    console.error("Compression failed, using original:", err);
    return file;
  }
};

/**
 * Compress multiple images in parallel
 */
export const compressImages = (
  files: File[],
  opts: Partial<typeof COMPRESSION_OPTIONS> = {}
): Promise<File[]> => {
  return Promise.all(files.map((f) => compressImage(f, opts)));
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};
