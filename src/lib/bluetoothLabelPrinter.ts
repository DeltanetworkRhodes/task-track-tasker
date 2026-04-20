/**
 * Brother PT-E550W / P-touch Bluetooth Label Printer
 * Web Bluetooth API + Raster bitmap rendering
 *
 * Όλα τα labels εκτυπώνονται με 12mm tape.
 * Η διάκριση flag/flat ενεργοποιεί διαφορετικό layout στον raster
 * (το flag εκτυπώνεται διπλό με κενό στη μέση για δίπλωμα γύρω από ίνα).
 *
 * Για πραγματική ποιότητα και υποστήριξη Ελληνικών, κάνουμε
 * client-side rendering σε canvas → 1bpp bitmap → ESC/P raster bytes.
 */

export interface PrintableLabel {
  section_code: string;
  location: "kampina" | "bep" | "bmo" | "fb";
  label_type: "flag" | "flat";
  section_title: string;
  content: string;
  content_lines?: string[];
  tape_width_mm: number;
  print_order: number;
}

export interface PrintOptions {
  onItemStart?: (idx: number, item: PrintableLabel) => void;
  onItemComplete?: (idx: number, item: PrintableLabel) => void;
  onComplete?: (printed: PrintableLabel[]) => void;
  onError?: (err: Error) => void;
}

// Brother SPP / P-touch BLE service & characteristic
const BROTHER_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
const BROTHER_WRITE_CHAR_UUID = "0000fff1-0000-1000-8000-00805f9b34fb";

let connectedDevice: BluetoothDevice | null = null;
let writeCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

// 12mm tape στο PT-E550W = 70 printable dots ύψος (πρακτικό safe value)
const TAPE_PRINT_HEIGHT_DOTS = 70;
const PRINT_DPI = 180;

export async function connectToPrinter(): Promise<void> {
  const nav = navigator as Navigator & { bluetooth?: Bluetooth };
  if (!nav.bluetooth) {
    throw new Error(
      "Ο browser δεν υποστηρίζει Web Bluetooth. Χρησιμοποίησε Chrome/Edge σε Android ή desktop."
    );
  }

  try {
    const device = await nav.bluetooth.requestDevice({
      filters: [
        { namePrefix: "PT-" },
        { namePrefix: "Brother" },
        { namePrefix: "PT_" },
      ],
      optionalServices: [BROTHER_SERVICE_UUID],
    });

    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(BROTHER_SERVICE_UUID);
    writeCharacteristic = await service.getCharacteristic(BROTHER_WRITE_CHAR_UUID);
    connectedDevice = device;

    device.addEventListener("gattserverdisconnected", () => {
      connectedDevice = null;
      writeCharacteristic = null;
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Σύνδεση απέτυχε: ${msg}`);
  }
}

export function isConnected(): boolean {
  return connectedDevice !== null && connectedDevice.gatt?.connected === true;
}

export async function disconnectPrinter(): Promise<void> {
  if (connectedDevice?.gatt?.connected) {
    connectedDevice.gatt.disconnect();
  }
}

/**
 * Render label σε 1bpp bitmap (rotated 90°: το printer feed direction
 * είναι το X axis, το tape height είναι το Y axis).
 *
 * Επιστρέφει { width (= μήκος label σε dots), heightBytes (= 16 bytes per col για 128 dots) }
 * Standard Brother raster mode: 16 bytes per column = 128 dots ύψος.
 */
function renderLabelToRaster(label: PrintableLabel): {
  bytesPerColumn: number;
  columns: Uint8Array[];
} {
  const lines = label.content_lines?.length
    ? label.content_lines
    : label.content.split("\n");

  // Canvas dimensions (rotated): X = μήκος label (variable), Y = ύψος tape
  // Brother raster head = 128 dots για compact alignment, αλλά μόνο 70 πρώτα
  // είναι printable σε 12mm tape. Centered.
  const headDots = 128;
  const bytesPerColumn = headDots / 8; // = 16

  // Decide font size & total length από το πιο μακρύ line
  const fontPx = lines.length > 2 ? 18 : lines.length === 2 ? 26 : 36;
  const lineGap = 4;
  const blockHeight = lines.length * fontPx + (lines.length - 1) * lineGap;

  // Measure width
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d")!;
  mctx.font = `bold ${fontPx}px "Helvetica", "Arial", sans-serif`;
  const longest = Math.max(...lines.map((l) => mctx.measureText(l).width));
  const padding = 20;
  let labelWidth = Math.ceil(longest) + padding * 2;
  if (labelWidth < 80) labelWidth = 80;

  // Flag mode: διπλό περιεχόμενο + κενό 30px στη μέση για δίπλωμα
  const flagGap = 30;
  const totalWidth =
    label.label_type === "flag" ? labelWidth * 2 + flagGap : labelWidth;

  const canvas = document.createElement("canvas");
  canvas.width = totalWidth;
  canvas.height = headDots;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.font = `bold ${fontPx}px "Helvetica", "Arial", sans-serif`;
  ctx.textBaseline = "top";

  // Y centered στο printable area (πρώτα 70 dots από 128)
  const startY = Math.max(0, Math.floor((TAPE_PRINT_HEIGHT_DOTS - blockHeight) / 2));

  const drawText = (offsetX: number) => {
    let y = startY;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      ctx.fillText(line, offsetX + (labelWidth - w) / 2, y);
      y += fontPx + lineGap;
    }
  };

  drawText(0);
  if (label.label_type === "flag") {
    // Δεύτερο αντίγραφο για το flag (ίδιο κείμενο)
    drawText(labelWidth + flagGap);
  }

  // Convert to columns of 16 bytes (1 = black)
  const imgData = ctx.getImageData(0, 0, totalWidth, headDots);
  const columns: Uint8Array[] = [];
  for (let x = 0; x < totalWidth; x++) {
    const col = new Uint8Array(bytesPerColumn);
    for (let y = 0; y < headDots; y++) {
      const idx = (y * totalWidth + x) * 4;
      const r = imgData.data[idx];
      const g = imgData.data[idx + 1];
      const b = imgData.data[idx + 2];
      const isBlack = r + g + b < 384;
      if (isBlack) {
        const byteIdx = Math.floor(y / 8);
        const bitIdx = 7 - (y % 8);
        col[byteIdx] |= 1 << bitIdx;
      }
    }
    columns.push(col);
  }

  return { bytesPerColumn, columns };
}

/**
 * Build full ESC/P + raster command stream για ένα label.
 * Reference: Brother P-touch raster command reference.
 */
function buildPrintCommand(label: PrintableLabel): Uint8Array {
  const { bytesPerColumn, columns } = renderLabelToRaster(label);

  const cmd: number[] = [];

  // Invalidate (100 null bytes — required reset)
  for (let i = 0; i < 100; i++) cmd.push(0x00);

  // ESC @ — Initialize
  cmd.push(0x1b, 0x40);

  // ESC i a 01 — Switch to raster mode
  cmd.push(0x1b, 0x69, 0x61, 0x01);

  // ESC i M — Mode settings (auto cut OFF between, mirror off)
  cmd.push(0x1b, 0x69, 0x4d, 0x40);

  // ESC i d — Margin (feed) 14 dots
  cmd.push(0x1b, 0x69, 0x64, 0x0e, 0x00);

  // M 02 — No compression mode
  cmd.push(0x4d, 0x00);

  // Send each column: 'G' nn nn data...
  for (const col of columns) {
    cmd.push(0x47, bytesPerColumn, 0x00);
    for (let i = 0; i < col.length; i++) cmd.push(col[i]);
  }

  // 0x1A = print + cut command (έξοδος label)
  cmd.push(0x1a);

  return new Uint8Array(cmd);
}

export async function printLabelQueue(
  queue: PrintableLabel[],
  options: PrintOptions = {}
): Promise<void> {
  if (!isConnected()) {
    await connectToPrinter();
  }

  const printed: PrintableLabel[] = [];

  for (let i = 0; i < queue.length; i++) {
    const label = queue[i];
    options.onItemStart?.(i, label);

    try {
      const cmd = buildPrintCommand(label);

      // Στείλε σε chunks των ~180 bytes (ασφαλές για BLE MTU)
      const CHUNK_SIZE = 180;
      for (let offset = 0; offset < cmd.length; offset += CHUNK_SIZE) {
        const end = Math.min(offset + CHUNK_SIZE, cmd.length);
        const chunk = cmd.slice(offset, end);
        await writeCharacteristic!.writeValue(chunk);
        await new Promise((r) => setTimeout(r, 25));
      }

      // Περίμενε ~2s για να βγει το label από τον cutter
      await new Promise((r) => setTimeout(r, 2000));

      printed.push(label);
      options.onItemComplete?.(i, label);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const error = new Error(`Label #${i + 1} απέτυχε: ${msg}`);
      options.onError?.(error);
      throw error;
    }
  }

  options.onComplete?.(printed);
}

// Export για debugging / future use
export const _internals = { renderLabelToRaster, buildPrintCommand, PRINT_DPI };
