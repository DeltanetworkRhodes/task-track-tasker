import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff, Copy, ChevronLeft, ChevronRight } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { toast } from "sonner";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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
  format?: string;
}

interface PageDef {
  title: string;
  fields: FieldDef[];
}

interface PdfMapping {
  template: string;
  version: string;
  pages: Record<string, PageDef>;
  fonts: { regular: string; bold: string };
  defaults: { fontSize: number; checkSize: number; signatureMaxW: number; signatureMaxH: number };
}

const FIELD_COLORS: Record<string, string> = {
  text: "#3b82f6",
  boxed: "#8b5cf6",
  wrapped: "#f59e0b",
  check: "#ef4444",
  check_if: "#ef4444",
  check_if_not: "#ef4444",
  check_map: "#f97316",
  floor_check: "#f97316",
  equipment_grid: "#06b6d4",
  signature: "#10b981",
  image: "#ec4899",
};

const PdfCoordinateEditor = () => {
  const [mapping, setMapping] = useState<PdfMapping | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ key: string; subKey?: string; offsetX: number; offsetY: number } | null>(null);
  const [pdfDims, setPdfDims] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Load mapping
  useEffect(() => {
    fetch("/templates/pdf-mapping.json")
      .then((r) => r.json())
      .then((data) => setMapping(data))
      .catch(() => toast.error("Δεν βρέθηκε το pdf-mapping.json"));
  }, []);

  // Render PDF pages as images using pdf.js
  useEffect(() => {
    (async () => {
      try {
        const loadingTask = pdfjsLib.getDocument("/templates/inspection_template.pdf");
        const pdf = await loadingTask.promise;
        const totalPagesCount = pdf.numPages;
        const rendered: string[] = [];

        for (let i = 1; i <= totalPagesCount; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 }); // render at 2x for sharpness
          if (i === 1) {
            setPdfDims({ width: viewport.width / 2, height: viewport.height / 2 });
          }
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          rendered.push(canvas.toDataURL("image/png"));
        }

        setPageImages(rendered);
      } catch (err) {
        console.error("PDF render error:", err);
        toast.error("Δεν φορτώθηκε το PDF template");
      }
    })();
  }, []);

  const currentFields = mapping?.pages[String(currentPage)]?.fields || [];

  // Get all positionable items (including sub-items from maps)
  const getPositionableItems = useCallback(() => {
    const items: { key: string; subKey?: string; label: string; x: number; y: number; type: string; color: string }[] = [];
    for (const field of currentFields) {
      if (field.type === "check_map" || field.type === "floor_check") {
        if (field.map) {
          for (const [mapKey, coords] of Object.entries(field.map)) {
            items.push({
              key: field.key,
              subKey: mapKey,
              label: `${field.key}.${mapKey}`,
              x: coords.x,
              y: coords.y,
              type: field.type,
              color: FIELD_COLORS[field.type] || "#888",
            });
          }
        }
      } else if (field.type === "equipment_grid") {
        // Show brand columns and size rows as separate markers
        if (field.brands) {
          for (const [brand, bx] of Object.entries(field.brands)) {
            if (field.sizes) {
              for (const [size, sy] of Object.entries(field.sizes)) {
                items.push({
                  key: field.key,
                  subKey: `${brand}_${size}`,
                  label: `${field.key}.${brand}.${size}`,
                  x: bx,
                  y: sy,
                  type: field.type,
                  color: FIELD_COLORS[field.type] || "#888",
                });
              }
            }
          }
        }
      } else if (field.x != null && field.y != null) {
        items.push({
          key: field.key,
          label: field.key,
          x: field.x,
          y: field.y,
          type: field.type,
          color: FIELD_COLORS[field.type] || "#888",
        });
      }
    }
    return items;
  }, [currentFields]);

  // Convert PDF coords (origin bottom-left) to screen coords (origin top-left)
  const pdfToScreen = (x: number, y: number) => ({
    left: x * zoom,
    top: (pdfDims.height - y) * zoom,
  });

  // Convert screen coords to PDF coords
  const screenToPdf = (left: number, top: number) => ({
    x: Math.round(left / zoom),
    y: Math.round(pdfDims.height - top / zoom),
  });

  const handleMouseDown = (e: React.MouseEvent, key: string, subKey?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const items = getPositionableItems();
    const item = items.find((i) => i.key === key && i.subKey === subKey);
    if (!item) return;
    const screen = pdfToScreen(item.x, item.y);
    setDragging({
      key,
      subKey,
      offsetX: e.clientX - rect.left - screen.left,
      offsetY: e.clientY - rect.top - screen.top,
    });
    setSelectedField(subKey ? `${key}.${subKey}` : key);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging || !canvasRef.current || !mapping) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const left = e.clientX - rect.left - dragging.offsetX;
      const top = e.clientY - rect.top - dragging.offsetY;
      const pdfCoords = screenToPdf(left, top);

      setMapping((prev) => {
        if (!prev) return prev;
        const updated = JSON.parse(JSON.stringify(prev)) as PdfMapping;
        const pageFields = updated.pages[String(currentPage)]?.fields;
        if (!pageFields) return prev;

        const field = pageFields.find((f) => f.key === dragging.key);
        if (!field) return prev;

        if (dragging.subKey) {
          if ((field.type === "check_map" || field.type === "floor_check") && field.map && field.map[dragging.subKey]) {
            field.map[dragging.subKey] = { x: pdfCoords.x, y: pdfCoords.y };
          } else if (field.type === "equipment_grid" && dragging.subKey.includes("_")) {
            const [brand, size] = dragging.subKey.split("_");
            if (field.brands && brand in field.brands) field.brands[brand] = pdfCoords.x;
            if (field.sizes && size in field.sizes) field.sizes[size] = pdfCoords.y;
          }
        } else {
          field.x = pdfCoords.x;
          field.y = pdfCoords.y;
        }

        return updated;
      });
    },
    [dragging, currentPage, zoom, pdfDims.height]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleManualCoordChange = (key: string, subKey: string | undefined, axis: "x" | "y", value: number) => {
    setMapping((prev) => {
      if (!prev) return prev;
      const updated = JSON.parse(JSON.stringify(prev)) as PdfMapping;
      const pageFields = updated.pages[String(currentPage)]?.fields;
      if (!pageFields) return prev;

      const field = pageFields.find((f) => f.key === key);
      if (!field) return prev;

      if (subKey) {
        if ((field.type === "check_map" || field.type === "floor_check") && field.map && field.map[subKey]) {
          field.map[subKey][axis] = value;
        }
      } else {
        if (axis === "x") field.x = value;
        else field.y = value;
      }
      return updated;
    });
  };

  const exportMapping = () => {
    if (!mapping) return;
    const json = JSON.stringify(mapping, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pdf-mapping.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Εξαγωγή pdf-mapping.json ολοκληρώθηκε!");
  };

  const copyToClipboard = () => {
    if (!mapping) return;
    navigator.clipboard.writeText(JSON.stringify(mapping, null, 2));
    toast.success("Αντιγράφηκε στο clipboard!");
  };

  const items = getPositionableItems();
  const totalPages = mapping ? Object.keys(mapping.pages).length : 0;

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-80 border-r bg-card overflow-y-auto p-4 space-y-4 flex-shrink-0">
        <h1 className="text-lg font-bold text-foreground">Επεξεργαστής Συντεταγμένων PDF</h1>
        <p className="text-xs text-muted-foreground">Σύρε τα πεδία στη σωστή θέση πάνω στο template</p>

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium flex-1 text-center">
            Σελίδα {currentPage} / {totalPages}
          </span>
          <Button variant="outline" size="icon" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {mapping && (
          <p className="text-xs text-muted-foreground italic">{mapping.pages[String(currentPage)]?.title}</p>
        )}

        {/* Zoom */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium flex-1 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.min(3, z + 0.1))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setZoom(1)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Toggle labels */}
        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowLabels((v) => !v)}>
          {showLabels ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
          {showLabels ? "Κρύψε labels" : "Δείξε labels"}
        </Button>

        {/* Field list */}
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Πεδία ({items.length})</h3>
          {items.map((item) => {
            const fullKey = item.subKey ? `${item.key}.${item.subKey}` : item.key;
            const isSelected = selectedField === fullKey;
            return (
              <div
                key={fullKey}
                className={`flex items-center gap-2 text-xs p-1.5 rounded cursor-pointer transition-colors ${
                  isSelected ? "bg-accent" : "hover:bg-muted"
                }`}
                onClick={() => setSelectedField(fullKey)}
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="truncate flex-1 font-mono">{item.label}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {item.x},{item.y}
                </span>
              </div>
            );
          })}
        </div>

        {/* Selected field manual edit */}
        {selectedField && (() => {
          const parts = selectedField.split(".");
          const key = parts[0];
          const subKey = parts.length > 1 ? parts.slice(1).join(".") : undefined;
          const item = items.find((i) => i.key === key && (subKey ? i.subKey === subKey : !i.subKey));
          if (!item) return null;
          return (
            <Card className="p-3 space-y-2">
              <p className="text-xs font-semibold">{selectedField}</p>
              <Badge variant="secondary" className="text-[10px]">{item.type}</Badge>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">X</label>
                  <Input
                    type="number"
                    value={item.x}
                    onChange={(e) => handleManualCoordChange(key, subKey, "x", parseInt(e.target.value) || 0)}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Y</label>
                  <Input
                    type="number"
                    value={item.y}
                    onChange={(e) => handleManualCoordChange(key, subKey, "y", parseInt(e.target.value) || 0)}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            </Card>
          );
        })()}

        {/* Export */}
        <div className="space-y-2 pt-2 border-t">
          <Button onClick={exportMapping} className="w-full" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Εξαγωγή JSON
          </Button>
          <Button variant="outline" onClick={copyToClipboard} className="w-full" size="sm">
            <Copy className="h-4 w-4 mr-2" />
            Αντιγραφή JSON
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto bg-muted/50 p-8">
        <div
          ref={canvasRef}
          className="relative mx-auto shadow-2xl"
          style={{
            width: pdfDims.width * zoom,
            height: pdfDims.height * zoom,
            background: "#fff",
          }}
        >
          {/* PDF background rendered as image */}
          {pageImages[currentPage - 1] ? (
            <img
              src={pageImages[currentPage - 1]}
              className="absolute inset-0 w-full h-full pointer-events-none"
              alt={`PDF Page ${currentPage}`}
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              Φόρτωση σελίδας...
            </div>
          )}

          {/* Field markers */}
          {items.map((item) => {
            const fullKey = item.subKey ? `${item.key}.${item.subKey}` : item.key;
            const isSelected = selectedField === fullKey;
            const screen = pdfToScreen(item.x, item.y);
            return (
              <div
                key={fullKey}
                className="absolute cursor-grab active:cursor-grabbing group"
                style={{
                  left: screen.left - 6,
                  top: screen.top - 6,
                  zIndex: isSelected ? 100 : 10,
                }}
                onMouseDown={(e) => handleMouseDown(e, item.key, item.subKey)}
              >
                {/* Dot */}
                <div
                  className="w-3 h-3 rounded-full border-2 border-white shadow-md transition-transform"
                  style={{
                    backgroundColor: item.color,
                    transform: isSelected ? "scale(1.5)" : "scale(1)",
                    boxShadow: isSelected ? `0 0 0 3px ${item.color}40, 0 2px 8px rgba(0,0,0,0.3)` : "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                />
                {/* Label */}
                {showLabels && (
                  <div
                    className="absolute left-4 top-[-4px] whitespace-nowrap text-[9px] font-mono px-1 py-0.5 rounded shadow-sm pointer-events-none"
                    style={{
                      backgroundColor: item.color,
                      color: "#fff",
                      opacity: isSelected ? 1 : 0.8,
                    }}
                  >
                    {item.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PdfCoordinateEditor;
