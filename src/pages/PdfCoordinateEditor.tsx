import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff, Copy, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { toast } from "sonner";
import { generateInspectionPdfBytes } from "@/lib/generateInspectionPdf";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Sample data that fills all fields so you can see where X/○ marks land
const PREVIEW_SAMPLE_DATA: Record<string, any> = {
  // Page 1
  customer_name: "ΔΟΚΙΜΑΣΤΙΚΟΣ ΠΕΛΑΤΗΣ",
  customer_father_name: "ΙΩΑΝΝΗΣ",
  customer_mobile: "69012345678",
  customer_phone: "21012345678",
  customer_email: "test@example.com",
  customer_street: "Λεωφ. Αλεξάνδρας",
  customer_number: "15",
  customer_postal_code: "114 73",
  customer_floor: "3ος",
  customer_apartment_code: "Δ2",
  customer_county: "Αττικής",
  customer_municipality: "Αθηνών",
  customer_notes: "Δοκιμαστικές παρατηρήσεις πελάτη για έλεγχο wrapped text και αλλαγή γραμμής στο PDF.",
  manager_name: "ΔΙΑΧΕΙΡΙΣΤΗΣ ΔΟΚΙΜΗΣ",
  manager_mobile: "69087654321",
  manager_email: "manager@test.gr",
  service_address: "Οδός Σταδίου 10, Αθήνα",
  service_phone: "21098765432",
  service_email: "service@test.gr",
  technician_name: "ΤΕΧΝΙΚΟΣ ΔΟΚΙΜΗΣ",
  // Page 2
  routing_escalit: true,
  routing_external_pipe: true,
  routing_aerial: true,
  routing_other: true,
  ext_pipe_sidewalk_excavation: true,
  sidewalk_excavation: true,
  excavation_to_pipe: true,
  excavation_to_rg: false,
  pipe_placement: true,
  wall_mount: true,
  fence_building_mount: true,
  excavation_to_building: true,
  bep_position: "internal,external,pole",
  vertical_routing: "shaft",
  vertical_routing_other_notes: "Σημείωση κατακόρυφης",
  routing_aerial_notes: "Εναέρια σημείωση",
  routing_other_notes: "Άλλη σημείωση",
  entry_pipe_notes: "Σημείωση σωλήνα εισαγωγής",
  sketch_notes: "Σημειώσεις σκαριφήματος δοκιμής",
  optical_socket_position: "Σαλόνι",
  // Page 3
  declarant_name: "ΔΗΛΩΝ ΔΟΚΙΜΗΣ",
  declarant_id_number: "ΑΒ123456",
  declarant_city: "Αθήνα",
  declarant_street: "Ερμού",
  declarant_number: "25",
  declarant_postal_code: "105 63",
  cost_option: "ote_covers",
  declaration_date: "07/03/2026",
  // Page 4
  building_address: "Λεωφ. Αλεξάνδρας 15, Αθήνα 114 73",
  building_id: "BLD-12345",
  customer_floor_select: "3ος",
  total_apartments: "12",
  total_shops: "2",
  total_spaces: "14",
  total_floors: "6",
  sr_id: "SR-2026-001",
  cabinet: "CAB-100",
  pipe_code: "PIPE-555",
  bcp_brand: "RAYCAP",
  bcp_size: "SMALL",
  bcp_floorbox: true,
  bcp_drop_4: true,
  bcp_drop_6: false,
  bcp_drop_12: false,
  bep_brand: "ZTT",
  bep_size: "MEDIUM",
  bep_capacity: "24",
  bmo_brand: "RAYCAP",
  bmo_size: "LARGE",
  bmo_capacity: "48",
};

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
  check_map_multi: "#f97316",
  floor_check: "#f97316",
  equipment_grid: "#06b6d4",
  signature: "#10b981",
  image: "#ec4899",
};

// Greek labels for the PDF editor
const FIELD_LABELS: Record<string, string> = {
  // Page 1 - Στοιχεία Πελάτη
  customer_name: "Ονοματεπώνυμο Πελάτη",
  customer_father_name: "Πατρώνυμο",
  customer_mobile: "Κινητό Πελάτη",
  customer_phone: "Σταθερό Πελάτη",
  customer_email: "Email Πελάτη",
  customer_street: "Οδός Πελάτη",
  customer_number: "Αριθμός",
  customer_postal_code: "Τ.Κ. Πελάτη",
  customer_floor: "Όροφος Πελάτη",
  customer_apartment_code: "Κωδ. Διαμερίσματος",
  customer_county: "Νομός",
  customer_municipality: "Δήμος",
  customer_notes: "Παρατηρήσεις Πελάτη",
  manager_name: "Όνομα Διαχειριστή",
  manager_mobile: "Κινητό Διαχειριστή",
  manager_email: "Email Διαχειριστή",
  service_address: "Διεύθυνση Υπηρεσίας",
  service_phone: "Τηλ. Υπηρεσίας",
  service_email: "Email Υπηρεσίας",
  technician_name: "Όνομα Τεχνικού",

  // Page 2 - Τεχνική Περιγραφή
  routing_escalit: "Δρομολόγηση: Εσκαλίτ",
  routing_external_pipe: "Δρομολόγηση: Εξωτ. Σωλήνα",
  routing_aerial: "Δρομολόγηση: Εναέρια",
  routing_other: "Δρομολόγηση: Άλλο",
  routing_aerial_notes: "Σημειώσεις Εναέριας",
  routing_other_notes: "Σημειώσεις Άλλου",
  sidewalk_excavation_yes: "Εκσκαφή Πεζοδρομίου: ΝΑΙ",
  sidewalk_excavation_no: "Εκσκαφή Πεζοδρομίου: ΟΧΙ",
  entry_pipe_notes: "Σημ. Σωλήνα Εισαγωγής",
  ext_pipe_sidewalk_excavation_yes: "Εκσκαφή Πεζοδρ. Σιδηροσωλ.: ΝΑΙ",
  ext_pipe_sidewalk_excavation_no: "Εκσκαφή Πεζοδρ. Σιδηροσωλ.: ΟΧΙ",
  excavation_to_pipe_yes: "Εκσκαφή→Σωλήνα: ΝΑΙ",
  excavation_to_pipe_no: "Εκσκαφή→Σωλήνα: ΟΧΙ",
  excavation_to_rg_yes: "Εκσκαφή→RG: ΝΑΙ",
  excavation_to_rg_no: "Εκσκαφή→RG: ΟΧΙ",
  wall_mount: "Επίτοιχη Στήριξη",
  pipe_placement: "Τοποθέτηση Σιδηροσωλήνα",
  excavation_to_building: "Εκσκαφή έως Κτίριο",
  fence_building_mount: "Στήριξη Περίφραξη/Κτίριο",
  sketch_notes: "Σημειώσεις Σκαριφήματος",
  optical_socket_position: "Θέση Οπτικής Πρίζας",
  sketch_image: "Εικόνα Σκαριφήματος",
  engineer_signature: "Υπογραφή Μηχανικού",
  customer_signature: "Υπογραφή Πελάτη",
  manager_signature: "Υπογραφή Διαχειριστή",

  // Page 2 - check_map sub-keys
  "bep_position.internal": "BEP: Εσωτερικό",
  "bep_position.external": "BEP: Εξωτερικό",
  "bep_position.fence": "BEP: Περίφραξη",
  "bep_position.building": "BEP: Κτίριο",
  "bep_position.pole": "BEP: Στύλος",
  "bep_position.pillar": "BEP: Πυλώνας",
  "bep_position.basement": "BEP: Υπόγειο",
  "bep_position.ground": "BEP: Ισόγειο",
  "bep_position.rooftop": "BEP: Ταράτσα",
  "bep_position.piloti": "BEP: Πιλοτή",
  "vertical_routing.shaft": "Κατακ. Δρομ.: Φρεάτιο",
  "vertical_routing.elevator": "Κατακ. Δρομ.: Ασανσέρ",
  "vertical_routing.staircase": "Κατακ. Δρομ.: Κλιμ/σιο",
  "vertical_routing.internal_external": "Κατακ. Δρομ.: Εσωτ/Εξωτ",
  "vertical_routing.lightwell": "Κατακ. Δρομ.: Φωταγωγός",
  "vertical_routing.lantern": "Κατακ. Δρομ.: Φανάρι",
  "vertical_routing.other": "Κατακ. Δρομ.: Άλλο",
  vertical_routing_other_notes: "Σημ. Κατακ. Δρομ. Άλλο",

  // Page 3 - Υπεύθυνη Δήλωση
  declarant_name: "Όνομα Δηλούντος",
  declarant_id_number: "Αρ. Ταυτότητας",
  declarant_city: "Πόλη Δηλούντος",
  declarant_street: "Οδός Δηλούντος",
  declarant_number: "Αριθμός Δηλούντος",
  declarant_postal_code: "Τ.Κ. Δηλούντος",
  cost_option_ote: "Κόστος: Καλύπτει ΟΤΕ",
  cost_option_other: "Κόστος: Άλλο",
  declaration_date: "Ημερομηνία Δήλωσης",
  declaration_signature: "Υπογραφή Δηλούντος",

  // Page 4 - Στοιχεία Κτιρίου / Εξοπλισμός
  building_address: "Διεύθυνση Κτιρίου",
  building_id: "Κωδ. Κτιρίου",
  customer_floor_select: "Όροφος Πελάτη (Επιλογή)",
  total_floors: "Σύνολο Ορόφων",
  total_apartments: "Σύνολο Διαμερισμάτων",
  total_shops: "Σύνολο Καταστημάτων",
  total_spaces: "Σύνολο Χώρων",
  cabinet: "Καμπίνα",
  pipe_code: "Κωδ. Σωλήνα",
  sr_id: "Αριθμός SR",
  bcp_floorbox: "BCP: Floorbox",
  bcp_drop_4: "BCP: Drop 4",
  bcp_drop_6: "BCP: Drop 6",
  bcp_drop_12: "BCP: Drop 12",
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
  
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
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
        const loadingTask = pdfjsLib.getDocument(`/templates/inspection_template.pdf?v=${Date.now()}`);
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
    const items: { key: string; subKey?: string; label: string; x: number; y: number; type: string; color: string; mark?: string }[] = [];
    for (const field of currentFields) {
      if (field.type === "check_map" || field.type === "check_map_multi" || field.type === "floor_check") {
        if (field.map) {
          for (const [mapKey, coords] of Object.entries(field.map)) {
            const fullKey = `${field.key}.${mapKey}`;
            items.push({
              key: field.key,
              subKey: mapKey,
              label: FIELD_LABELS[fullKey] || fullKey,
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
                  label: FIELD_LABELS[`${field.key}.${brand}.${size}`] || `${field.key}.${brand}.${size}`,
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
          label: FIELD_LABELS[field.key] || field.key,
          x: field.x,
          y: field.y,
          type: field.type,
          color: FIELD_COLORS[field.type] || "#888",
          mark: (field as any).mark,
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
          if ((field.type === "check_map" || field.type === "check_map_multi" || field.type === "floor_check") && field.map && field.map[dragging.subKey]) {
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
        if ((field.type === "check_map" || field.type === "check_map_multi" || field.type === "floor_check") && field.map && field.map[subKey]) {
          field.map[subKey][axis] = value;
        }
      } else {
        if (axis === "x") field.x = value;
        else field.y = value;
      }
      return updated;
    });
  };

  const handlePreviewPdf = async () => {
    if (!mapping) return;
    setPreviewLoading(true);
    try {
      const { generateInspectionPdfBytes: genPdf, clearMappingCache } = await import("@/lib/generateInspectionPdf");
      clearMappingCache();

      const pdfBytes = await genPdf(PREVIEW_SAMPLE_DATA, mapping);

      // Render PDF pages as images using pdf.js
      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
      const pdf = await loadingTask.promise;
      const rendered: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        rendered.push(canvas.toDataURL("image/png"));
      }

      setPreviewImages(rendered);
      setPreviewPage(currentPage);
      setShowPreview(true);
      toast.success("Preview δημιουργήθηκε!");
    } catch (err) {
      console.error("Preview error:", err);
      toast.error("Σφάλμα preview: " + (err as Error).message);
    } finally {
      setPreviewLoading(false);
    }
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
          {showLabels ? "Κρύψε ετικέτες" : "Δείξε ετικέτες"}
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
          <Button 
            onClick={handlePreviewPdf} 
            className="w-full" 
            size="sm" 
            variant="default"
            disabled={previewLoading || !mapping}
          >
            <FileText className="h-4 w-4 mr-2" />
            {previewLoading ? "Δημιουργία..." : "Preview PDF"}
          </Button>
          <Button onClick={exportMapping} className="w-full" size="sm" variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Εξαγωγή JSON
          </Button>
          <Button variant="outline" onClick={copyToClipboard} className="w-full" size="sm">
            <Copy className="h-4 w-4 mr-2" />
            Αντιγραφή JSON
          </Button>
        </div>
      </div>

      {/* Canvas + Preview side by side */}
      <div className={`flex-1 flex ${showPreview ? "gap-0" : ""} overflow-hidden`}>
        {/* Editor Canvas */}
        <div className={`${showPreview ? "w-1/2 border-r" : "flex-1"} overflow-auto bg-muted/50 p-4`}>
          <div className="text-xs text-muted-foreground text-center mb-2 font-medium">📐 Editor — Σελίδα {currentPage}</div>
          <div
            ref={canvasRef}
            className="relative mx-auto shadow-2xl"
            style={{
              width: pdfDims.width * zoom,
              height: pdfDims.height * zoom,
              background: "#fff",
            }}
          >
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
                  {(item.type === "check_if" || item.type === "check_if_not") && item.mark !== "x" ? (
                    <div
                      className="flex items-center justify-center transition-transform"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        border: `2.5px solid ${item.color}`,
                        backgroundColor: isSelected ? `${item.color}30` : "transparent",
                        transform: isSelected ? "scale(1.4)" : "scale(1)",
                        boxShadow: isSelected ? `0 0 0 3px ${item.color}40, 0 2px 8px rgba(0,0,0,0.3)` : "0 1px 3px rgba(0,0,0,0.3)",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: item.color, lineHeight: 1 }}>○</span>
                    </div>
                  ) : (item.type === "check" || item.type === "check_map" || item.type === "check_map_multi" || item.type === "floor_check" || ((item.type === "check_if" || item.type === "check_if_not") && item.mark === "x")) ? (
                    <div
                      className="flex items-center justify-center transition-transform"
                      style={{
                        width: 18,
                        height: 18,
                        backgroundColor: isSelected ? item.color : `${item.color}cc`,
                        transform: isSelected ? "scale(1.4)" : "scale(1)",
                        boxShadow: isSelected ? `0 0 0 3px ${item.color}40, 0 2px 8px rgba(0,0,0,0.3)` : "0 1px 3px rgba(0,0,0,0.3)",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 900, color: "#fff", lineHeight: 1 }}>✕</span>
                    </div>
                  ) : item.type === "signature" ? (
                    <div
                      className="flex items-center justify-center transition-transform"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 4,
                        border: `2px dashed ${item.color}`,
                        backgroundColor: isSelected ? `${item.color}30` : `${item.color}15`,
                        transform: isSelected ? "scale(1.4)" : "scale(1)",
                        boxShadow: isSelected ? `0 0 0 3px ${item.color}40, 0 2px 8px rgba(0,0,0,0.3)` : "0 1px 3px rgba(0,0,0,0.3)",
                      }}
                    >
                      <span style={{ fontSize: 11, color: item.color, lineHeight: 1 }}>✎</span>
                    </div>
                  ) : (
                    <div
                      className="w-3 h-3 rounded-full border-2 border-white shadow-md transition-transform"
                      style={{
                        backgroundColor: item.color,
                        transform: isSelected ? "scale(1.5)" : "scale(1)",
                        boxShadow: isSelected ? `0 0 0 3px ${item.color}40, 0 2px 8px rgba(0,0,0,0.3)` : "0 1px 3px rgba(0,0,0,0.3)",
                      }}
                    />
                  )}
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

        {/* Preview Panel */}
        {showPreview && previewImages.length > 0 && (
          <div className="w-1/2 overflow-auto bg-muted/30 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-muted-foreground">👁 Preview — Σελίδα {previewPage}</div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={previewPage <= 1} onClick={() => setPreviewPage(p => p - 1)}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-xs text-muted-foreground">{previewPage}/{previewImages.length}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={previewPage >= previewImages.length} onClick={() => setPreviewPage(p => p + 1)}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-2" onClick={() => setShowPreview(false)}>
                  <span className="text-xs font-bold">✕</span>
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex justify-center">
              <img
                src={previewImages[previewPage - 1]}
                className="shadow-lg max-w-full h-auto"
                alt={`Preview Page ${previewPage}`}
                draggable={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfCoordinateEditor;
