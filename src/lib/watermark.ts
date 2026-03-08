/**
 * Smart Photo Watermarking — stamps SR, address, GPS, datetime on images.
 * Uses Canvas API (client-side) before upload to Supabase Storage.
 */

export interface WatermarkData {
  srId: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  datetime?: Date;
}

/**
 * Apply watermark overlay to an image file.
 * Returns a new File with the watermark burned in (bottom-right).
 */
export const applyWatermark = async (
  file: File,
  data: WatermarkData
): Promise<File> => {
  if (!file.type.startsWith("image/")) return file;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Build watermark lines
      const lines: string[] = [];
      lines.push(`SR: ${data.srId}`);
      if (data.address) lines.push(data.address);
      if (data.latitude != null && data.longitude != null) {
        lines.push(`GPS: ${Number(data.latitude).toFixed(6)}, ${Number(data.longitude).toFixed(6)}`);
      }
      const dt = data.datetime || new Date();
      lines.push(dt.toLocaleString("el-GR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }));

      // Dynamic font size based on image dimensions
      const baseFontSize = Math.max(12, Math.round(Math.min(img.width, img.height) * 0.022));
      const lineHeight = baseFontSize * 1.35;
      const padding = baseFontSize * 0.8;
      const blockHeight = lines.length * lineHeight + padding * 2;
      const maxLineWidth = getMaxTextWidth(ctx, lines, baseFontSize);
      const blockWidth = maxLineWidth + padding * 2;

      // Semi-transparent background (bottom-right)
      const x0 = img.width - blockWidth - padding;
      const y0 = img.height - blockHeight - padding;
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      roundRect(ctx, x0, y0, blockWidth, blockHeight, baseFontSize * 0.4);
      ctx.fill();

      // White text with subtle shadow
      ctx.font = `bold ${baseFontSize}px 'Roboto', Arial, sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.textBaseline = "top";

      lines.forEach((line, i) => {
        ctx.fillText(line, x0 + padding, y0 + padding + i * lineHeight);
      });

      // Export as JPEG
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const result = new File(
            [blob],
            file.name,
            { type: "image/jpeg" }
          );
          resolve(result);
        },
        "image/jpeg",
        0.92
      );
    };

    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Apply watermark to multiple files in parallel.
 */
export const applyWatermarkBatch = (
  files: File[],
  data: WatermarkData
): Promise<File[]> => {
  return Promise.all(files.map((f) => applyWatermark(f, data)));
};

// Helpers
function getMaxTextWidth(ctx: CanvasRenderingContext2D, lines: string[], fontSize: number): number {
  ctx.font = `bold ${fontSize}px 'Roboto', Arial, sans-serif`;
  return Math.max(...lines.map((l) => ctx.measureText(l).width));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
