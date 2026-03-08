/**
 * Compress/resize image using canvas
 * @param file - The image file to compress
 * @param maxWidth - Maximum width in pixels (default: 1600)
 * @param quality - JPEG quality 0-1 (default: 0.7)
 * @returns Compressed file (or original if not an image or already small)
 */
export const compressImage = (file: File, maxWidth = 1600, quality = 0.7): Promise<File> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Skip if already small enough
      if (width <= maxWidth && file.size < 500 * 1024) {
        resolve(file);
        return;
      }

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressed = new File(
              [blob],
              file.name.replace(/\.\w+$/, ".jpg"),
              { type: "image/jpeg" }
            );
            console.log(
              `Compressed ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`
            );
            resolve(compressed);
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
};

/**
 * Compress multiple images in parallel
 */
export const compressImages = (files: File[], maxWidth = 1600, quality = 0.7): Promise<File[]> => {
  return Promise.all(files.map((f) => compressImage(f, maxWidth, quality)));
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};
