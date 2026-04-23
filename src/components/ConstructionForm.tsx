import { useState, useMemo, useRef, useEffect, useCallback } from "react"; // BEP door fix v2
import { uploadPhotoDrive } from "@/lib/driveUpload";
import { hapticFeedback } from "@/lib/haptics";
import { compressImage } from "@/lib/imageCompression";
import { applyWatermark, type WatermarkData } from "@/lib/watermark";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTimeTracking } from "@/hooks/useTimeTracking";
import { Trash2, Loader2, CheckCircle, HardHat, Package, Wrench, Camera, X, ChevronDown, ChevronRight, Plus, Minus, MapPin, Route, AlertTriangle, Save, GitMerge, Building2, Copy, LogOut, RefreshCw, Maximize2, Check, TrendingUp, Bluetooth, BluetoothConnected, BluetoothOff, Printer } from "lucide-react";
import {
  printLabelQueue,
  connectToPrinter,
  disconnectPrinter,
  subscribePrinterState,
  setDemoMode,
  getPrinterState,
} from "@/lib/bluetoothLabelPrinter";
import { motion } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { isOnline, enqueueConstruction, fileToOfflineFile, type OfflineConstructionPayload } from "@/lib/offlineQueue";
import { usePhotoChecklist } from "@/hooks/usePhotoChecklist";
import PhotoChecklist from "@/components/PhotoChecklist";
import { useDiagnosticLogger } from "@/hooks/useDiagnosticLogger";

import { useUserRole } from "@/hooks/useUserRole";
import {
  getCodePrefix,
  suggestArticleForPrefix,
  calculateDefaultQuantity,
  type OteArticleRow,
  type SuggestionInput,
} from "@/lib/oteArticleCategories";
import {
  computeAutoBilling,
  mergeAutoBilling,
  isTierManagedCode,
  type AutoBillingInput,
} from "@/lib/oteAutoBilling";
import {
  computeAutoMaterials,
  mergeAutoMaterials,
  isAutoManagedMaterialCode,
  type AutoMaterialsInput,
} from "@/lib/oteAutoMaterials";
import {
  computeAutoMaterials as computeLiveMaterials,
  mergeAutoMaterials as mergeLiveMaterials,
  type MaterialsAutoFillInput,
} from "@/lib/oteMaterialsAutoFill";
import { Sparkles, Zap } from "lucide-react";

interface WorkItem {
  work_pricing_id: string;
  code: string;
  description: string;
  unit: string;
  unit_price: number;
  quantity: number;
}

interface MaterialItem {
  material_id: string;
  code: string;
  name: string;
  unit: string;
  price: number;
  source: string;
  quantity: number;
}

interface Props {
  assignment: any;
  onComplete: () => void;
  /** Crew mode: filter photo/OTDR sections to these keys from ALL_PHOTO_CATEGORIES */
  filterPhotoCatKeys?: string[];
  /** Crew mode: update these sr_crew_assignments on save */
  crewAssignmentIds?: string[];
  /** Crew mode: lighter save (no assignment status change, no emails) */
  isCrewMode?: boolean;
  /** Crew mode: only show works whose code starts with these prefixes */
  filterWorkPrefixes?: string[];
  /** Crew mode: only show materials whose code matches these codes */
  filterMaterialCodes?: string[];
  /** 3-Phase workflow: which phase the current technician is responsible for (1, 2, 3). undefined = admin / sees all */
  phase?: 1 | 2 | 3;
  /** Phase status snapshot used for the lock UI */
  phaseStatus?: {
    phase1_status?: string;
    phase2_status?: string;
    phase3_status?: string;
  } | null;
}

const PHASE_INFO = {
  1: { icon: "🚜", title: "Φάση 1 — Χωματουργικά", sub: "Σκάμμα · Εμφύσηση · Σωληνίσκος" },
  2: { icon: "🔧", title: "Φάση 2 — Οδεύσεις", sub: "BEP · BMO · FB · Κάθετη Όδευση" },
  3: { icon: "🔬", title: "Φάση 3 — Κόλληση", sub: "OTDR · Labels · AS-BUILD" },
} as const;

// Category definitions for works based on code prefix
// `prefix` παραμένει το κύριο prefix (για backward compat & matching),
// `prefixes` περιλαμβάνει ΟΛΑ τα prefixes που ανήκουν στην κατηγορία.
const WORK_CATEGORIES: { prefix: string; prefixes: string[]; label: string; icon: string }[] = [
  { prefix: "1956", prefixes: ["1956", "1951", "1968"], label: "Αυτοψία", icon: "🔍" },
  { prefix: "1991", prefixes: ["1991", "1915", "1959", "1969"], label: "BCP – Σκάψιμο έως BCP", icon: "⛏️" },
  { prefix: "1993", prefixes: ["1993", "1994"], label: "BCP – Από BCP έως BEP", icon: "🔗" },
  { prefix: "1963", prefixes: ["1963"], label: "BEP – ΕΣΚΑΛΙΤ σωλήνωση", icon: "🕳️" },
  { prefix: "1965", prefixes: ["1965", "1966"], label: "BEP – Σκάψιμο έως BEP", icon: "⛏️" },
  { prefix: "1970", prefixes: ["1970", "1971", "1973"], label: "BEP – Τοποθέτηση BEP/ΚΟΙ", icon: "📦" },
  { prefix: "1984", prefixes: ["1984"], label: "FB–BEP στο ίδιο επίπεδο", icon: "↔️" },
  { prefix: "1985", prefixes: ["1985"], label: "FB – Τοποθέτηση & Κατακόρυφη ΚΟΙ", icon: "📋" },
  { prefix: "1986", prefixes: ["1986", "1998", "1999"], label: "FB – Κολλήσεις & Διασυνδέσεις", icon: "🔧" },
  { prefix: "1980", prefixes: ["1980"], label: "Εμφύσηση CAB", icon: "💨" },
  { prefix: "1955", prefixes: ["1955", "1988", "1989"], label: "Γ' Φάση – Σύνδεση Πελάτη", icon: "👤" },
  { prefix: "1997", prefixes: ["1997", "1977", "1995", "1996"], label: "Διασύνδεση Σωληνίσκου Φρεατίου", icon: "🔗" },
];

// Helper: επιστρέφει την κατηγορία στην οποία ανήκει ένας κωδικός εργασίας
const getCategoryForCode = (code: string) =>
  WORK_CATEGORIES.find((c) => c.prefixes.some((p) => code.startsWith(p)));

// Material categories based on description patterns
const MATERIAL_CATEGORIES: { label: string; match: (name: string, code: string) => boolean }[] = [
  { label: "Καλώδια & Ίνες", match: (n) => /cable|καλώδ|ίν|fiber|FO |KOI/i.test(n) },
  { label: "Microduct & Σωληνίσκοι", match: (n) => /duct|σωλην|multi-duct/i.test(n) },
  { label: "BEP & BMO & Floor-box", match: (n) => /BEP|BMO|Floor|OTO|outlet/i.test(n) },
  { label: "Splitter & Pigtail & Patchcord", match: (n) => /splitter|pigtail|patchcord|connector|HUA/i.test(n) },
  { label: "Στηρίγματα & Αναρτήσεις", match: (n) => /στηρ|θηλε|κρικ|αγγιστ|στεφαν|ροδαντζ|σφιγκ|τσερκ|σύρμα|hook|clamp/i.test(n) },
  { label: "Σήμανση & Ταινίες", match: (n) => /σήμαν|ταιν|marker|ball|endcap|ταπ/i.test(n) },
  { label: "Σωλήνες & Στύλοι", match: (n) => /σωλήν|σιδηρ|δακτύλ|στύλ|ξύλιν/i.test(n) },
];

const ConstructionForm = ({ assignment, onComplete, filterPhotoCatKeys, crewAssignmentIds, isCrewMode, filterWorkPrefixes, filterMaterialCodes, phase, phaseStatus }: Props) => {
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const orgName = organization?.name || "DELTANETWORK";
  const queryClient = useQueryClient();
  
  const { activeEntry, checkOut } = useTimeTracking(assignment.id);

  // 🔍 Διαγνωστικός logger για auto-billing & materials autofill (Step 1: observability only)
  const logDiag = useDiagnosticLogger({
    organizationId,
    assignmentId: assignment?.id,
    srId: assignment?.sr_id,
  });




  // Form state
  const [sesId, setSesId] = useState("");
  const [ak, setAk] = useState("");
  const [cab, setCab] = useState(assignment.cab || "");
  const [floors, setFloors] = useState("0");
  const [routingType, setRoutingType] = useState("");
  const [pendingNote, setPendingNote] = useState("");
  const [buildingType, setBuildingType] = useState<string | null>(null);

  // ── AS-BUILD extra fields ──
  const [koiTypeCabBep, setKoiTypeCabBep] = useState("4' μ cable");
  const [koiTypeCabBcp, setKoiTypeCabBcp] = useState("4' μ cable");
  const [verticalInfra, setVerticalInfra] = useState("ΙΣ");
  const [bepPlacementFloor, setBepPlacementFloor] = useState("ΙΣ");
  const [verticalInfraType, setVerticalInfraType] = useState("");
  const [floorMeters, setFloorMeters] = useState<{ floor: string; meters: string; pipe_type: string; fo_type: string }[]>([]);
  const [floorMetersInitialized, setFloorMetersInitialized] = useState(false);
  const [section6, setSection6] = useState<Record<string, string>>({
    eisagogi_type: "",
    bmo_bep_distance: "",
    ball_marker_bep: "",
    ms_skamma: "",
    eskalit_ms: "",
    eskalit_nea_solienosi: "",
    eskalit_solienosi_eisagogis: "",
    eskalit_bep: "",
    eskalit_b1_bep: "",
    bcp_eidos: "",
    bcp_ball_marker: "",
    bcp_ms: "",
    bcp_bep_ypogeia: "",
    bcp_bep_enaeria: "",
  });
  const [ballMarkerBep, setBallMarkerBep] = useState("");
  const [ballMarkerBcp, setBallMarkerBcp] = useState("");
  const [asbuiltCardOpen, setAsbuiltCardOpen] = useState(false);
  const [floorMetersCardOpen, setFloorMetersCardOpen] = useState(false);

  // Routes (ΔΙΑΔΡΟΜΕΣ)
  const [routes, setRoutes] = useState([
    { label: "FTTH ΥΠΟΓ ΔΔ (Cabin to BEP)", koi: "", fyraKoi: "" },
    { label: "ΕΝΑΕΡΙΟ FTTH ΔΔ (Cabinet BCP to BEP)", koi: "", fyraKoi: "" },
    { label: "ΕΝΑΕΡΙΟ FTTH ΣΥΝΔΡΟΜ (BEP to Floor Box)", koi: "", fyraKoi: "" },
    { label: "FTTH INHOUSE (Κάθετη όδευση BEP-FI)", koi: "", fyraKoi: "" },
  ]);

  const updateRoute = (index: number, field: "koi" | "fyraKoi", value: string) => {
    setRoutes((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  // Auto-computed: FTTH INHOUSE KOI = sum of floor meters BMO→FB
  const inhouseKoiSum = useMemo(
    () => floorMeters.reduce((acc, fm) => acc + (parseFloat(fm.meters) || 0), 0),
    [floorMeters]
  );

  // Routes with FTTH INHOUSE (idx 3) KOI overridden by computed sum
  const effectiveRoutes = useMemo(
    () => routes.map((r, i) => (i === 3 ? { ...r, koi: inhouseKoiSum > 0 ? String(inhouseKoiSum) : "" } : r)),
    [routes, inhouseKoiSum]
  );

  const totalKoi = effectiveRoutes.reduce((sum, r) => sum + (parseFloat(r.koi) || 0), 0);
  const totalFyraKoi = effectiveRoutes.reduce((sum, r) => sum + (parseFloat(r.fyraKoi) || 0), 0);

  // Σύνολο INHOUSE KOI από floorMeters
  const inhouseKoiTotal = useMemo(
    () => floorMeters.reduce((sum, fm) => sum + (parseFloat(fm.meters) || 0), 0),
    [floorMeters]
  );
  // Ξεχωριστά ανά τύπο ίνας
  const inhouse4FoMeters = useMemo(
    () => floorMeters.reduce((sum, fm) => (fm.fo_type === "4FO" ? sum + (parseFloat(fm.meters) || 0) : sum), 0),
    [floorMeters]
  );
  const inhouse12FoMeters = useMemo(
    () => floorMeters.reduce((sum, fm) => (fm.fo_type === "12FO" ? sum + (parseFloat(fm.meters) || 0) : sum), 0),
    [floorMeters]
  );

  // Work items
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [openWorkCategories, setOpenWorkCategories] = useState<string[]>([]);

  // ⚡ Αυτόματη Τιμολόγηση (Live)
  const [autoBillingEnabled, setAutoBillingEnabled] = useState(true);
  const [lastAutoBillingSummary, setLastAutoBillingSummary] = useState<{ added: number; updated: number } | null>(null);
  // Παρακολούθηση των κωδικών που έχει προσθέσει αυτόματα ο engine
  // (επιτρέπει replace/remove όταν αλλάζουν μέτρα/τύπος εισαγωγής, χωρίς να ακουμπάει manual additions)
  const autoAddedCodesRef = useRef<Set<string>>(new Set());
  // Παρακολούθηση των material IDs που έχει προσθέσει αυτόματα ο engine υλικών
  const autoAddedMaterialIdsRef = useRef<Set<string>>(new Set());
  // Live materials engine (GIS + Οριζοντογραφία + floorMeters)
  const autoAddedLiveMaterialIdsRef = useRef<Set<string>>(new Set());
  const [lastMaterialsAutoSummary, setLastMaterialsAutoSummary] = useState<{
    added: number;
    updated: number;
  } | null>(null);

  // Materials
  const [materialItems, setMaterialItems] = useState<MaterialItem[]>([]);
  const [openMaterialCategories, setOpenMaterialCategories] = useState<string[]>([]);
  const [materialTab, setMaterialTab] = useState("OTE");

  // Photo categories
  // Photo categories mapped to work code prefixes
  // storageName uses ASCII for Supabase Storage compatibility
  const ALL_PHOTO_CATEGORIES = [
    { key: "ΣΚΑΜΑ", storageName: "SKAMA", label: "Σκάμα", icon: "⛏️", workPrefixes: ["1991", "1965"] },
    { key: "ΟΔΕΥΣΗ", storageName: "ODEFSI", label: "Όδευση", icon: "🛤️", workPrefixes: ["1963", "1965", "1993"] },
    { key: "BCP", storageName: "BCP", label: "BCP", icon: "📦", workPrefixes: ["1991", "1993"] },
    { key: "BEP", storageName: "BEP", label: "BEP", icon: "🔌", workPrefixes: ["1963", "1965", "1970"] },
    { key: "BMO", storageName: "BMO", label: "BMO", icon: "📡", workPrefixes: ["1970"] },
    { key: "FB", storageName: "FB", label: "Floor Box", icon: "📋", workPrefixes: ["1984", "1985", "1986"] },
    { key: "ΚΑΜΠΙΝΑ", storageName: "KAMPINA", label: "Καμπίνα", icon: "🏗️", workPrefixes: ["1980"] },
    { key: "Γ_ΦΑΣΗ", storageName: "G_FASI", label: "Γ' Φάση", icon: "👤", workPrefixes: ["1955"] },
  ];

  const crewPhotoCategoryTokens = useMemo(() => {
    if (!filterPhotoCatKeys || filterPhotoCatKeys.length === 0) return [];

    return filterPhotoCatKeys
      .flatMap((entry) => String(entry).split(/[\s,;|/]+/g))
      .map((token) => token.trim())
      .filter(Boolean);
  }, [filterPhotoCatKeys]);

  const normalizedCrewPhotoKeys = useMemo(() => {
    const normalized = new Set<string>();

    for (const token of crewPhotoCategoryTokens) {
      const upper = token.toUpperCase();

      if (["ΣΚΑΜΑ", "ΣΚΑΜΜΑ", "SKAMA"].includes(upper)) {
        normalized.add("ΣΚΑΜΑ");
      } else if (["ΟΔΕΥΣΗ", "ΚΑΝΑΛΙΑ", "ΣΠΙΡΑΛ", "ODEFSI", "ROUTING"].includes(upper)) {
        normalized.add("ΟΔΕΥΣΗ");
      } else if (upper === "BCP") {
        normalized.add("BCP");
      } else if (upper === "BEP") {
        normalized.add("BEP");
      } else if (upper === "BMO") {
        normalized.add("BMO");
      } else if (upper === "FB" || /^FB_?\d+$/i.test(upper)) {
        normalized.add("FB");
      } else if (["ΚΑΜΠΙΝΑ", "KAMPINA", "CAB", "CABINET", "ΕΜΦΥΣΗΣΗ", "ΟΠΤΙΚΗ"].includes(upper)) {
        normalized.add("ΚΑΜΠΙΝΑ");
      } else if (["Γ_ΦΑΣΗ", "ΟΔΕΥΣΗ_ΟΤΟ", "ΤΕΛΙΚΗ", "OTO"].includes(upper)) {
        normalized.add("Γ_ΦΑΣΗ");
      }
    }

    return normalized;
  }, [crewPhotoCategoryTokens]);

  const allowAllOtdrInCrewMode = useMemo(() => {
    if (!filterPhotoCatKeys) return false;

    return crewPhotoCategoryTokens.some((token) => {
      const upper = token.toUpperCase();
      return upper === "OTDR" || upper === "ΚΟΛΛΗΣΗ";
    });
  }, [filterPhotoCatKeys, crewPhotoCategoryTokens]);

  // Filter photo categories based on selected works
  const selectedWorkPrefixes = new Set(workItems.map((w) => getCategoryForCode(w.code)?.prefix).filter(Boolean));

  const crewFilteredPhotoCategories = ALL_PHOTO_CATEGORIES.filter((cat) => normalizedCrewPhotoKeys.has(cat.key));

  // Mandatory photo categories: categories whose workPrefixes match selected works
  const mandatoryPhotoKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const cat of ALL_PHOTO_CATEGORIES) {
      if (cat.workPrefixes.length > 0 && cat.workPrefixes.some((p) => selectedWorkPrefixes.has(p))) {
        keys.add(cat.key);
      }
    }
    return keys;
  }, [workItems]);

  // ─── Existing uploaded photos from storage (persistence) ───
  const [existingPhotoCounts, setExistingPhotoCounts] = useState<Record<string, number>>({});
  const [existingOtdrCounts, setExistingOtdrCounts] = useState<Record<string, number>>({});
  const [existingPhotoUrls, setExistingPhotoUrls] = useState<Record<string, string[]>>({});
  const [drivePhotoUrls, setDrivePhotoUrls] = useState<Record<string, { url: string; thumb: string; name: string }[]>>({});
  const [expandedPhotoCategory, setExpandedPhotoCategory] = useState<string | null>(null);

  // In crew mode, show filtered categories with alias support (fallback: show all)
  // In normal mode, show categories based on selected works
  const visiblePhotoCategories = ALL_PHOTO_CATEGORIES.filter((cat) => {
    // Phase-based filtering (applies to both crew and non-crew when phase is set)
    if (phase === 1 || phase === 2) {
      // Φάση 1/2: δικές της κατηγορίες + ό,τι έχει ήδη ανέβει
      return ["ΣΚΑΜΑ", "ΟΔΕΥΣΗ"].includes(cat.key) || (existingPhotoCounts[cat.key] || 0) > 0;
    }
    if (phase === 3) {
      // Φάση 3: δικές της κατηγορίες + ό,τι έχει ήδη ανέβει από Φάσεις 1/2
      return ["BEP", "BMO", "FB", "ΚΑΜΠΙΝΑ", "Γ_ΦΑΣΗ"].includes(cat.key) || (existingPhotoCounts[cat.key] || 0) > 0;
    }
    // Crew mode without phase: use crew filter
    if (isCrewMode) {
      return crewFilteredPhotoCategories.some((c) => c.key === cat.key);
    }
    // Admin (no phase, no crew): show all matching work prefixes
    return (
      cat.workPrefixes.length === 0 ||
      cat.workPrefixes.some((p) => selectedWorkPrefixes.has(p)) ||
      (existingPhotoCounts[cat.key] || 0) > 0
    );
  });

  // OTDR PDF measurement categories (FB is dynamic based on floors)
  const OTDR_CATEGORIES_STATIC = [
    { key: "BMO", storageName: "OTDR_BMO", label: "BMO" },
    { key: "ΚΑΜΠΙΝΑ", storageName: "OTDR_KAMPINA", label: "Καμπίνα" },
    { key: "BEP", storageName: "OTDR_BEP", label: "BEP" },
    { key: "BCP", storageName: "OTDR_BCP", label: "BCP" },
    { key: "LIVE", storageName: "OTDR_LIVE", label: "Live" },
  ];

  const floorCount = Math.max(0, parseInt(floors) || 0);

  // Count total FBs from charged materials (not floors)
  const totalFbCharged = useMemo(() => {
    return materialItems
      .filter((m) => {
        const upper = m.name.toUpperCase();
        return (upper.includes("FLOOR") && upper.includes("BOX")) ||
               (upper.includes("FB") && !upper.includes("BEP") && !upper.includes("BMO"));
      })
      .reduce((sum, m) => sum + m.quantity, 0);
  }, [materialItems]);

  // Effective FB count: max of (charged FBs, FB rows from GIS floor_meters, floor count)
  // Ensures FB OTDR rows appear even if technician hasn't charged FB materials yet.
  const effectiveFbCount = useMemo(() => {
    const charged = Math.max(0, Math.round(totalFbCharged));
    const fromFloorMeters = floorMeters.length;
    const fromFloors = floorCount;
    return Math.max(charged, fromFloorMeters, fromFloors);
  }, [totalFbCharged, floorMeters.length, floorCount]);

  const fbOtdrCategories = useMemo(() => {
    const count = effectiveFbCount;
    const cats = [];
    for (let i = 1; i <= count; i++) {
      const fbLabel = i.toString().padStart(2, "0");
      cats.push({
        key: `FB_${fbLabel}`,
        storageName: `OTDR_FB_${fbLabel}`,
        label: `Floor Box ${fbLabel}`,
      });
    }
    return cats;
  }, [effectiveFbCount]);

  const OTDR_CATEGORIES = useMemo(() => {
    const allOtdr = [
      OTDR_CATEGORIES_STATIC[0], // BMO
      ...fbOtdrCategories,
      ...OTDR_CATEGORIES_STATIC.slice(1), // ΚΑΜΠΙΝΑ, BEP, BCP, LIVE
    ];

    if (!filterPhotoCatKeys) return allOtdr;
    // Phase 3 technicians get all OTDR categories
    if (phase === 3) return allOtdr;
    if (allowAllOtdrInCrewMode) return allOtdr;

    const crewFilteredOtdr = allOtdr.filter((otdr) => {
      if (otdr.key === "LIVE") return true;
      if (otdr.key.startsWith("FB_")) return normalizedCrewPhotoKeys.has("FB");
      return normalizedCrewPhotoKeys.has(otdr.key);
    });

    // If filters from DB were malformed, keep OTDR visible instead of hiding everything.
    return crewFilteredOtdr.length > 1 ? crewFilteredOtdr : allOtdr;
  }, [fbOtdrCategories, filterPhotoCatKeys, normalizedCrewPhotoKeys, allowAllOtdrInCrewMode, phase]);

  const [categorizedPhotos, setCategorizedPhotos] = useState<Record<string, File[]>>({});
  const [categorizedPreviews, setCategorizedPreviews] = useState<Record<string, string[]>>({});
  const [otdrFiles, setOtdrFiles] = useState<Record<string, File[]>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const otdrInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const completingRef = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitProgress, setSubmitProgress] = useState("");
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  // ─── Bluetooth Label Printer (inline) ───
  const [printerState, setPrinterState] = useState(() => getPrinterState());
  const [printerConnecting, setPrinterConnecting] = useState(false);
  const [printingLabel, setPrintingLabel] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribePrinterState(setPrinterState);
    return unsub;
  }, []);

  const handlePrinterConnect = useCallback(async () => {
    if (printerState.status === "connected" || printerState.status === "demo") {
      await disconnectPrinter();
      toast.info("Αποσυνδέθηκε");
      return;
    }
    setPrinterConnecting(true);
    try {
      await connectToPrinter();
      const s = getPrinterState();
      toast.success(s.status === "demo" ? "🧪 Demo printer ενεργό" : `✅ ${s.deviceName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Σφάλμα σύνδεσης";
      toast.error(msg);
    } finally {
      setPrinterConnecting(false);
    }
  }, [printerState.status]);

  const handleToggleDemo = useCallback(() => {
    const next = !printerState.demoMode;
    setDemoMode(next);
    toast.info(next ? "🧪 Demo mode ON" : "Demo mode OFF");
  }, [printerState.demoMode]);

  const handlePrintSingleLabel = useCallback(async (text: string, opts?: { type?: "flag" | "flat"; section?: string }) => {
    if (printerState.status !== "connected" && printerState.status !== "demo") {
      toast.error("Συνδέστε πρώτα τον εκτυπωτή (κουμπί Bluetooth)");
      return;
    }
    const lines = text.split("\n").filter(Boolean);
    setPrintingLabel(text);
    try {
      await printLabelQueue([{
        section_code: opts?.section || "INLINE",
        location: "bep",
        label_type: opts?.type || "flat",
        section_title: opts?.section || "Label",
        content: text,
        content_lines: lines,
        tape_width_mm: 12,
        print_order: 1,
      }]);
      toast.success("✅ Εκτυπώθηκε");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Σφάλμα εκτύπωσης";
      toast.error(msg);
    } finally {
      setPrintingLabel(null);
    }
  }, [printerState.status]);


  // Collapsible sections state (mobile UX)
  const [openSections, setOpenSections] = useState<string[]>([
    "technical",
    "routes",
    "works",
    "materials",
    "photos",
    "otdr",
  ]);
  const toggleSection = (id: string) => {
    setOpenSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  // Load existing construction data when re-entering the form
  const { data: existingConstruction, isFetched: existingConstructionFetched } = useQuery({
    queryKey: ["existing_construction", assignment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("constructions")
        .select("*")
        .eq("assignment_id", assignment.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: existingWorks } = useQuery({
    queryKey: ["existing_construction_works", existingConstruction?.id],
    enabled: !!existingConstruction?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("construction_works")
        .select("*, work_pricing:work_pricing_id(code, description, unit)")
        .eq("construction_id", existingConstruction!.id);
      return data || [];
    },
  });

  const { data: existingMaterials, isFetched: existingMaterialsFetched } = useQuery({
    queryKey: ["existing_construction_materials", existingConstruction?.id],
    enabled: !!existingConstruction?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("construction_materials")
        .select("*, materials:material_id(code, name, unit, price, source)")
        .eq("construction_id", existingConstruction!.id);
      return data || [];
    },
  });

  const [existingConstructionLoaded, setExistingConstructionLoaded] = useState(false);
  const [existingWorksLoaded, setExistingWorksLoaded] = useState(false);
  const [existingMaterialsLoaded, setExistingMaterialsLoaded] = useState(false);

  useEffect(() => {
    setExistingConstructionLoaded(false);
    setExistingWorksLoaded(false);
    setExistingMaterialsLoaded(false);
    autoAddedCodesRef.current = new Set();
    autoAddedMaterialIdsRef.current = new Set();
    setLastAutoBillingSummary(null);
    // CRITICAL: άδειασε τα state arrays για να μη "διαρρεύσουν" εργασίες/υλικά από προηγούμενο SR
    // στη μηχανή auto-billing του νέου SR (που οδηγούσε σε χαμένα/διπλά άρθρα).
    setWorkItems([]);
    setMaterialItems([]);
  }, [assignment.id]);

  // Hydrate base form fields from saved construction so edits persist across reopen/save cycles
  useEffect(() => {
    if (existingConstructionLoaded) return;
    // Wait for the fetch to complete (even if result is null) before deciding what to do.
    if (!existingConstructionFetched) return;
    if (!existingConstruction) {
      // No saved construction exists — mark as loaded so GIS auto-populate can take over.
      setExistingConstructionLoaded(true);
      return;
    }

    setSesId(existingConstruction.ses_id || "");
    setAk(existingConstruction.ak || "");
    setCab(existingConstruction.cab || assignment.cab || "");
    setFloors(String(existingConstruction.floors ?? 0));
    setRoutingType(existingConstruction.routing_type || "");
    setPendingNote(existingConstruction.pending_note || "");
    setBuildingType((existingConstruction as any).building_type || (assignment as any).building_type || null);



    const dbRoutes = Array.isArray(existingConstruction.routes) ? (existingConstruction.routes as any[]) : [];
    if (dbRoutes.length > 0) {
      setRoutes((prev) =>
        prev.map((route, index) => {
          const routeByLabel = dbRoutes.find((r: any) => String(r?.label || "") === route.label);
          const sourceRoute = routeByLabel || dbRoutes[index];
          if (!sourceRoute) return route;

          const koiValue = sourceRoute.koi ?? sourceRoute.koi_m ?? "";
          const fyraValue = sourceRoute.fyra_koi ?? sourceRoute.fyraKoi ?? "";

          return {
            ...route,
            koi: koiValue === null || koiValue === undefined ? "" : String(koiValue),
            fyraKoi: fyraValue === null || fyraValue === undefined ? "" : String(fyraValue),
          };
        })
      );
    }

    // AS-BUILD extra fields
    setKoiTypeCabBep((existingConstruction as any).koi_type_cab_bep || "4' μ cable");
    setKoiTypeCabBcp((existingConstruction as any).koi_type_cab_bcp || "4' μ cable");
    setVerticalInfra((existingConstruction as any).vertical_infra || "ΙΣ");
    setBepPlacementFloor((existingConstruction as any).bep_placement_floor || "ΙΣ");
    setVerticalInfraType((existingConstruction as any).vertical_infra_type || "");
    const savedFloorMeters = (existingConstruction as any).floor_meters;
    if (Array.isArray(savedFloorMeters) && savedFloorMeters.length > 0) {
      setFloorMeters(savedFloorMeters.map((fm: any) => {
        const foType = fm.fo_type || "4FO";
        const derivedPipe = foType === "12FO" ? '4"' : '2"';
        return {
          floor: fm.floor || "",
          meters: String(fm.meters ?? ""),
          pipe_type: fm.pipe_type || derivedPipe,
          fo_type: foType,
        };
      }));
    }
    // Always mark as initialized after loading existing construction,
    // so GIS auto-populate never overwrites user edits on re-renders.
    setFloorMetersInitialized(true);
    const savedSection6 = (existingConstruction as any).asbuilt_section6;
    if (savedSection6 && typeof savedSection6 === "object") {
      setSection6(prev => ({ ...prev, ...savedSection6 }));
      setBallMarkerBep(savedSection6.ball_marker_bep || "");
      setBallMarkerBcp(savedSection6.bcp_ball_marker || "");
    }

    // Prevent GIS defaults from overriding persisted values for FIELDS,
    // but DO NOT lock materials autofill here — that's the responsibility
    // of the saved-materials hydration effect (only locks when items > 0).
    setGisFieldsFilled(true);
    setExistingConstructionLoaded(true);
  }, [existingConstruction, existingConstructionFetched, existingConstructionLoaded, assignment.cab]);

  // Hydrate saved works
  useEffect(() => {
    if (existingWorksLoaded || !existingWorks) return;

    const items: WorkItem[] = existingWorks.map((w: any) => ({
      work_pricing_id: w.work_pricing_id,
      code: w.work_pricing?.code || "",
      description: w.work_pricing?.description || "",
      unit: w.work_pricing?.unit || "",
      unit_price: Number(w.unit_price) || 0,
      quantity: Number(w.quantity) || 1,
    }));

    setWorkItems(items);

    // Σημάδεψε τα tier-managed codes ως auto-added ώστε η μηχανή να μπορεί
    // να τα αντικαταστήσει όταν αλλάξουν τα μέτρα (π.χ. 1965.2 → 1965.3).
    const initialAuto = new Set<string>();
    for (const it of items) {
      if (isTierManagedCode(it.code)) initialAuto.add(it.code);
    }
    autoAddedCodesRef.current = initialAuto;

    setExistingWorksLoaded(true);
  }, [existingWorks, existingWorksLoaded]);

  // Hydrate saved materials (or empty saved state) to avoid accidental GIS re-autofill
  useEffect(() => {
    if (existingMaterialsLoaded || !existingMaterials) return;

    const items: MaterialItem[] = existingMaterials.map((m: any) => ({
      material_id: m.material_id,
      code: m.materials?.code || "",
      name: m.materials?.name || "",
      unit: m.materials?.unit || "",
      price: Number(m.materials?.price) || 0,
      source: m.materials?.source || m.source,
      quantity: Number(m.quantity) || 1,
    }));

    setMaterialItems(items);
    // Σημάδεψε τα auto-managed material codes ώστε η μηχανή υλικών να μπορεί
    // να τα αντικαταστήσει όταν αλλάξει π.χ. το building_type ή ο τύπος fiber.
    const initialAutoMat = new Set<string>();
    for (const it of items) {
      if (it.code && isAutoManagedMaterialCode(it.code)) {
        initialAutoMat.add(it.material_id);
      }
    }
    autoAddedMaterialIdsRef.current = initialAutoMat;
    setExistingMaterialsLoaded(true);
    // ΜΟΝΟ αν υπάρχουν ΑΠΟΘΗΚΕΥΜΕΝΑ υλικά κλειδώνουμε το autofill.
    // Αν είναι κενά (π.χ. construction δημιουργήθηκε αυτόματα από trigger
    // χωρίς ποτέ να γεμίσει), αφήνουμε το GIS autofill να τρέξει κανονικά.
    if (items.length > 0) {
      setGisAutoFilled(true);
    }
  }, [existingMaterials, existingMaterialsLoaded]);

  // (moved below gisData declaration)


  // Load uploaded file counters + Drive thumbnails (works for ALL phases/users by SR ID)
  useEffect(() => {
    let cancelled = false;

    const loadExistingFileCounts = async () => {
      const photoCounts: Record<string, number> = {};
      const otdrCounts: Record<string, number> = {};

      // Storage scan only if we have a saved construction (RLS may block otherwise)
      const safeSrId = assignment.sr_id.replace(/[^a-zA-Z0-9_-]/g, "_");
      const storagePrefix = existingConstruction?.id
        ? `constructions/${safeSrId}/${existingConstruction.id}`
        : null;

      const { data: folders, error } = storagePrefix
        ? await supabase.storage.from("photos").list(storagePrefix)
        : { data: null, error: null };

      if (!error && folders && storagePrefix && !cancelled) {
        const photoFolderToCategory: Record<string, string> = {
          SKAMA: "ΣΚΑΜΑ",
          ODEFSI: "ΟΔΕΥΣΗ",
          BCP: "BCP",
          BEP: "BEP",
          BMO: "BMO",
          FB: "FB",
          KAMPINA: "ΚΑΜΠΙΝΑ",
          G_FASI: "Γ_ΦΑΣΗ",
        };

        const otdrFolderToCategory = (folderName: string) => {
          const withoutPrefix = folderName.replace(/^OTDR_/, "");
          if (withoutPrefix === "KAMPINA") return "ΚΑΜΠΙΝΑ";
          return withoutPrefix;
        };

        for (const folder of folders) {
          if (folder.id !== null) continue;

          const { data: files } = await supabase.storage.from("photos").list(`${storagePrefix}/${folder.name}`);
          if (!files || cancelled) continue;

          const fileCount = files.filter((f) => f.id !== null).length;
          if (!fileCount) continue;

          if (folder.name.startsWith("OTDR_")) {
            const key = otdrFolderToCategory(folder.name);
            otdrCounts[key] = (otdrCounts[key] || 0) + fileCount;
          } else {
            const key = photoFolderToCategory[folder.name] || folder.name;
            photoCounts[key] = (photoCounts[key] || 0) + fileCount;

            // Fetch signed URLs for preview (photos bucket is private)
            const imageFiles = files.filter((f) => f.id !== null).slice(0, 10);
            const signedResults = await Promise.all(
              imageFiles.map(async (f) => {
                const { data } = await supabase.storage
                  .from("photos")
                  .createSignedUrl(`${storagePrefix}/${folder.name}/${f.name}`, 3600);
                return data?.signedUrl || "";
              })
            );
            const urls = signedResults.filter(Boolean);
            if (urls.length > 0 && !cancelled) {
              setExistingPhotoUrls((prev) => ({ ...prev, [key]: urls }));
            }
          }
        }
      }

      // Fallback: use saved photo_counts from construction record (photos may have been moved to Drive)
      const savedCounts = (existingConstruction as any)?.photo_counts as Record<string, number> | null;
      if (savedCounts && typeof savedCounts === "object") {
        for (const [key, count] of Object.entries(savedCounts)) {
          if (typeof count === "number" && count > 0 && !(photoCounts[key] > 0)) {
            photoCounts[key] = count;
          }
        }
      }

      // Fallback 2: ALWAYS fetch from Google Drive for thumbnails (by SR ID, regardless of drive_folder_url)
      // The edge function searches the entire Shared Drive for the SR folder, so this works
      // even for technicians whose assignment record doesn't have drive_folder_url set.
      if (!cancelled) {
        try {
          const driveRes = await supabase.functions.invoke("google-drive-files", {
            body: { action: "sr_folder", sr_id: assignment.sr_id },
          });

          if (driveRes.data?.found && driveRes.data?.subfolders) {
            // Map of CANONICAL category keys → list of accepted Drive folder name variants
            // We match by NFD-normalized + uppercased + alphanumeric-only comparison so that
            // "Σκάμα", "ΣΚΑΜΑ", "SKAMA", "Floor Box", "Γ' ΦΑΣΗ" etc. all resolve correctly.
            const categoryAliases: Record<string, string[]> = {
              "ΣΚΑΜΑ": ["ΣΚΑΜΑ", "ΣΚΑΜΜΑ", "SKAMA"],
              "ΟΔΕΥΣΗ": ["ΟΔΕΥΣΗ", "ODEFSI", "ODEYSI"],
              "BCP": ["BCP"],
              "BEP": ["BEP"],
              "BMO": ["BMO"],
              "FB": ["FB", "FLOORBOX", "FLOOR BOX"],
              "ΚΑΜΠΙΝΑ": ["ΚΑΜΠΙΝΑ", "KAMPINA", "CABINET"],
              "Γ_ΦΑΣΗ": ["Γ_ΦΑΣΗ", "Γ ΦΑΣΗ", "Γ' ΦΑΣΗ", "G_FASI", "GFASI", "ΦΑΣΗ Γ"],
            };

            const normalizeFolderName = (name: string): string => {
              return name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "") // strip accents
                .toUpperCase()
                .replace(/[^A-Z0-9ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]/g, ""); // strip spaces, underscores, apostrophes
            };

            // Pre-compute normalized alias → canonical lookup
            const normalizedLookup: Record<string, string> = {};
            for (const [canonical, aliases] of Object.entries(categoryAliases)) {
              for (const alias of aliases) {
                normalizedLookup[normalizeFolderName(alias)] = canonical;
              }
            }

            const newDriveUrls: Record<string, { url: string; thumb: string; name: string }[]> = {};
            const debugMapping: Array<{ drive: string; normalized: string; matched: string | null; files: number }> = [];

            for (const [folderName, folderData] of Object.entries(driveRes.data.subfolders as Record<string, any>)) {
              const normalized = normalizeFolderName(folderName);
              const categoryKey = normalizedLookup[normalized] || "";

              const imageFiles = (folderData.files || []).filter((f: any) =>
                f.mimeType?.startsWith("image/")
              );

              debugMapping.push({
                drive: folderName,
                normalized,
                matched: categoryKey || null,
                files: imageFiles.length,
              });

              if (!categoryKey || imageFiles.length === 0) continue;

              photoCounts[categoryKey] = imageFiles.length;
              newDriveUrls[categoryKey] = imageFiles
                .slice(0, 12)
                .map((f: any) => ({
                  thumb: f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+/, "=s400") : "",
                  url: f.webViewLink || "",
                  name: f.name || "",
                }))
                .filter((f: any) => f.thumb);
            }

            console.log(`[PhotoLoader] SR ${assignment.sr_id} — Drive folder mapping:`, debugMapping);

            if (!cancelled) {
              setDrivePhotoUrls(newDriveUrls);
              // Auto-expand the first category that actually has Drive photos so the
              // technician sees thumbnails immediately without needing to click.
              const firstWithPhotos = Object.keys(newDriveUrls)[0];
              if (firstWithPhotos) {
                setExpandedPhotoCategory((prev) => prev ?? firstWithPhotos);
              }
            }

            // Save the discovered counts back to the construction record for future use
            if (Object.keys(photoCounts).length > 0 && existingConstruction?.id) {
              await supabase
                .from("constructions")
                .update({ photo_counts: photoCounts } as any)
                .eq("id", existingConstruction.id);
            }
          }
        } catch (driveErr) {
          console.warn("Drive photo fetch failed:", driveErr);
        }
      }

      if (!cancelled) {
        setExistingPhotoCounts(photoCounts);
        setExistingOtdrCounts(otdrCounts);
      }
    };

    loadExistingFileCounts();

    return () => {
      cancelled = true;
    };
  }, [existingConstruction?.id, assignment.sr_id]);

  // Fetch OTE articles (νέα κύρια πηγή για τη Φόρμα Εργασιών)
  // Adapter: παρουσιάζονται με τα πεδία που περιμένει το υπάρχον UI
  // (id, code, description, unit, unit_price) ώστε να μη σπάσει τίποτα.
  const { data: oteArticlesRaw } = useQuery({
    queryKey: ["ote_articles_for_form", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ote_articles")
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("is_active", true)
        .eq("is_excluded", false)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OteArticleRow[];
    },
  });

  // Fetch existing work_pricing για να αντιστοιχίσουμε ote_articles → work_pricing.id
  // (χρειάζεται γιατί το construction_works αποθηκεύει work_pricing_id)
  const { data: existingWorkPricing } = useQuery({
    queryKey: ["work_pricing_index", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data } = await supabase
        .from("work_pricing")
        .select("id, code, unit_price, unit");
      return data ?? [];
    },
  });

  // Adapter: μετατρέπει ote_articles σε δομή συμβατή με workPricing UI
  const workPricing = useMemo(() => {
    if (!oteArticlesRaw) return null;
    const wpByCode = new Map(
      (existingWorkPricing ?? []).map((w: any) => [w.code, w]),
    );
    return oteArticlesRaw.map((a: any) => {
      const wp = wpByCode.get(a.code) as any;
      // Πραγματικά πεδία στη ΒΔ: title, official_description, user_annotation
      const label = a.title || a.official_description || a.code;
      return {
        // Αν υπάρχει αντίστοιχο work_pricing → χρησιμοποίησε ΤΟ ID του
        // αλλιώς prefix με "ote:" για να ξέρουμε ότι θέλει upsert πριν το save
        id: wp?.id ?? `ote:${a.id}`,
        code: a.code,
        description: label,
        unit: a.unit || "τεμ.",
        unit_price: Number(a.price_eur) || 0,
        // Extra fields για το enhanced UI
        _ote_article_id: a.id,
        _short_label: label,
        _user_annotation: a.user_annotation,
        _is_default: false,
        _when_to_use: a.when_to_use,
        _requires_qty: false,
      };
    });
  }, [oteArticlesRaw, existingWorkPricing]);

  // Fetch materials
  const { data: materials } = useQuery({
    queryKey: ["materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch technician's personal inventory (only used when phase is set = technician mode)
  const { data: techInventory } = useQuery({
    queryKey: ["tech-inventory", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("technician_inventory" as any)
        .select("id, material_id, quantity")
        .eq("technician_id", user.id)
        .gt("quantity", 0);
      return (data || []) as any[];
    },
    enabled: !!user && !!phase,
  });

  // Quick lookup map: material_id → quantity in technician's personal warehouse
  const techInventoryMap = useMemo(() => {
    const map = new Map<string, number>();
    (techInventory || []).forEach((inv: any) => {
      map.set(inv.material_id, Number(inv.quantity));
    });
    return map;
  }, [techInventory]);

  // Fetch building types & pricing for selector
  const { data: buildingTypes } = useQuery({
    queryKey: ["building-pricing-options", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_pricing")
        .select("building_type, building_label, building_icon, phase2_price, phase3_price, sort_order")
        .eq("organization_id", organizationId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{
        building_type: string;
        building_label: string;
        building_icon: string | null;
        phase2_price: number;
        phase3_price: number;
        sort_order: number | null;
      }>;
    },
    staleTime: 1000 * 60 * 5,
  });

  const selectedBuilding = useMemo(
    () => buildingTypes?.find((b) => b.building_type === buildingType) ?? null,
    [buildingTypes, buildingType]
  );
  const currentPhasePrice = useMemo(() => {
    if (!selectedBuilding || !phase) return 0;
    if (phase === 2) return Number(selectedBuilding.phase2_price) || 0;
    if (phase === 3) return Number(selectedBuilding.phase3_price) || 0;
    return 0;
  }, [selectedBuilding, phase]);

  // Fetch GIS data for this assignment
  const { data: gisData } = useQuery({
    queryKey: ["gis_data_for_construction", assignment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gis_data")
        .select("*")
        .eq("assignment_id", assignment.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Auto-populate floorMeters from GIS:
  //   1) Primary: gisData.floor_details (αν υπάρχει)
  //   2) Fallback: παρσάρισμα από optical_paths (BMO-FB) — ένα row ανά μοναδικό όροφο
  //      με fo_type αυτόματο από τα FB ports (≥6 → 12FO, αλλιώς 4FO)
  // Wait for existingConstruction fetch to complete first, otherwise we race
  // and overwrite user's typed values when the saved data finally loads.
  useEffect(() => {
    if (!gisData || floorMetersInitialized) return;
    if (!existingConstructionLoaded) return;

    type FMRow = { floor: string; meters: string; pipe_type: string; fo_type: string };

    // ── 1) Primary: floor_details ──
    const fd = (gisData as any).floor_details;
    if (Array.isArray(fd) && fd.length > 0) {
      setFloorMeters(fd.map((f: any): FMRow => {
        const foType = f.fo_type || "4FO";
        const derivedPipe = foType === "12FO" ? '4"' : '2"';
        return {
          floor: f["ΟΡΟΦΟΣ"] || f.floor || "",
          meters: String(f["ΜΕΤΡΑ"] ?? f.meters ?? ""),
          pipe_type: f["ΕΙΔΟΣ"] || f.pipe_type || derivedPipe,
          fo_type: foType,
        };
      }));
      setFloorMetersInitialized(true);
      return;
    }

    // ── 2) Fallback: parse BMO-FB optical_paths ──
    const paths = ((gisData as any).optical_paths as any[]) || [];
    if (paths.length === 0) return;

    // Συγκέντρωση ορόφων από BMO-FB paths (path format π.χ.: "G137_BMO01_05_FB(+02)" ή "FB(+ΗΜ)")
    const floorAgg: Record<string, { label: string; sort: number; fbCount: number }> = {};
    for (const p of paths) {
      const raw = p.raw || p;
      const pathType = (raw["OPTICAL PATH TYPE"] || raw["optical_path_type"] || "").toString().toUpperCase();
      if (pathType !== "BMO-FB") continue;
      const pathStr = (raw["OPTICAL PATH"] || raw["optical_path"] || "").toString();
      const fm = pathStr.match(/FB\(\+?([^)]+)\)/i);
      if (!fm) continue;
      const rawFloor = fm[1].trim().toUpperCase();
      let key = rawFloor;
      let label = rawFloor;
      let sort = 999;
      if (/ΗΜ|HM/i.test(rawFloor)) {
        key = "ΗΜ";
        label = "ΗΜ";
        sort = -1;
      } else if (/ΥΠ|YP/i.test(rawFloor)) {
        key = "ΥΠ";
        label = "ΥΠ";
        sort = -2;
      } else {
        const num = parseInt(rawFloor, 10);
        if (!isNaN(num)) {
          sort = num;
          if (num === 0) {
            key = "0";
            label = "ΙΣ";
          } else if (num > 0) {
            key = String(num);
            label = `${num}ος`;
          } else {
            key = String(num);
            label = `${num}`;
          }
        }
      }
      if (!floorAgg[key]) floorAgg[key] = { label, sort, fbCount: 0 };
      floorAgg[key].fbCount += 1;
    }

    const sorted = Object.values(floorAgg).sort((a, b) => a.sort - b.sort);
    if (sorted.length === 0) return;

    setFloorMeters(sorted.map((f): FMRow => {
      // ≥6 FB ports → 12FO (μεγαλύτερη χωρητικότητα), αλλιώς 4FO
      const foType = f.fbCount >= 6 ? "12FO" : "4FO";
      const pipe = foType === "12FO" ? '4"' : '2"';
      return { floor: f.label, meters: "", pipe_type: pipe, fo_type: foType };
    }));
    setFloorMetersInitialized(true);
  }, [gisData, floorMetersInitialized, existingConstructionLoaded]);

  // Auto-populate από gisData.raw_data — ΜΟΝΟ αν τα πεδία είναι κενά
  // (guard για να μην overwrite χειροκίνητες τιμές ή τιμές από existingConstruction)
  useEffect(() => {
    if (!gisData) return;
    const rawData = ((gisData as any)?.raw_data as any) || {};

    // ── Κάθετη Υποδομή BEP ──
    if (!verticalInfra || verticalInfra === "ΙΣ") {
      const vr = (
        rawData.vertical_routing ||
        rawData["Είδος κάθετης υποδομής"] ||
        ""
      ).toString().toUpperCase();
      if (vr.includes("ΚΑΓΚΕΛΟ")) setVerticalInfra("ΚΑΓΚΕΛΟ");
      else if (vr.includes("ΚΛΙΜΑΚΟΣΤΑΣΙΟ")) setVerticalInfra("ΚΛΙΜΑΚΟΣΤΑΣΙΟ");
      else if (vr.includes("ΦΩΤΑΓΩΓΟΣ")) setVerticalInfra("ΦΩΤΑΓΩΓΟΣ");
      else if (vr.includes("ΕΞΩΤΕΡΙΚΑ")) setVerticalInfra("ΕΞΩΤΕΡΙΚΑ ΕΠΙΤΟΙΧΙΑ");
      else if (vr) setVerticalInfra("ΑΛΛΟ");
    }

    // ── Είδος Εισαγωγής (section6) ──
    if (!section6?.eisagogi_type) {
      const hasBcp = !!(
        (gisData as any)?.new_bcp ||
        (gisData as any)?.nearby_bcp ||
        rawData.bcp_placement
      );
      const isEskalit = !!(rawData.escalit_type || rawData["ΕΣΚΑΛΗΤ"]);
      const areaType = ((gisData as any)?.area_type || "").toString().toUpperCase();
      const isNew = areaType.includes("ΝΕΑ") || !areaType.includes("OTE");

      let eisagogi = "";
      if (hasBcp) eisagogi = "BCP";
      else if (isEskalit) eisagogi = "ΕΣΚΑΛΗΤ";
      else if (isNew) eisagogi = "ΝΕΑ ΥΠΟΔΟΜΗ";

      if (eisagogi) {
        setSection6((s) => ({ ...s, eisagogi_type: eisagogi }));
      }
    }

    // ── BCP Είδος από GIS (μόνο αρχική πρόταση, ο τεχνικός μπορεί να αλλάξει) ──
    if (rawData.bcp_placement && !section6?.bcp_eidos) {
      const gisEidos = String(
        rawData.bcp_type_oriz ||
          rawData["BCP ΕΙΔΟΣ"] ||
          rawData.bcp_placement_type ||
          "",
      )
        .toUpperCase()
        .trim();

      let suggestedEidos = "";
      if (gisEidos.includes("ΔΗΜΟΣ") || gisEidos.includes("PUBLIC") || gisEidos === "Δ") {
        suggestedEidos = "ΔΗΜΟΣΙΟ";
      } else if (gisEidos.includes("ΙΔΙΩΤ") || gisEidos.includes("PRIVATE") || gisEidos === "Ι") {
        suggestedEidos = "ΙΔΙΩΤΙΚΟ";
      } else if (rawData.bcp_placement) {
        // Αν το GIS δεν καθορίζει σαφώς, default σε ΔΗΜΟΣΙΟ (πιο συχνό)
        suggestedEidos = "ΔΗΜΟΣΙΟ";
        console.log("[BCP] Είδος δεν καθορίστηκε από GIS — default ΔΗΜΟΣΙΟ");
      }

      if (suggestedEidos) {
        setSection6((s) => ({ ...s, bcp_eidos: suggestedEidos }));
        console.log(`[BCP] Auto-filled bcp_eidos: ${suggestedEidos}`);
      }
    }

    // ── FTTH ΥΠΟΓ ΔΔ KOI (routes[0]) από distance_from_cabinet ──
    if ((gisData as any)?.distance_from_cabinet && !routes[0]?.koi) {
      updateRoute(0, "koi", String((gisData as any).distance_from_cabinet));
    }

    // ── BEP Placement Floor ──
    if ((gisData as any)?.bep_floor && (!bepPlacementFloor || bepPlacementFloor === "ΙΣ")) {
      setBepPlacementFloor((gisData as any).bep_floor);
    }

    // ── AK από conduit (μόνο αν εντελώς κενό) ──
    if ((gisData as any)?.conduit && !ak) {
      setAk(((gisData as any).conduit as string).toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gisData]);

  // Auto-calculate Indoor FO Cable (4FO/12FO) από floorMeters + ΦΥΡΑ
  useEffect(() => {
    if (!materials) return;
    const fyraKoi = parseFloat(routes[3]?.fyraKoi || "0");
    const totalMeters = inhouse4FoMeters + inhouse12FoMeters;
    // Αναλογική κατανομή ΦΥΡΑ
    const fyra4 = totalMeters > 0 ? fyraKoi * (inhouse4FoMeters / totalMeters) : 0;
    const fyra12 = totalMeters > 0 ? fyraKoi * (inhouse12FoMeters / totalMeters) : 0;
    const total4 = inhouse4FoMeters > 0 ? Math.ceil(inhouse4FoMeters + fyra4) : 0;
    const total12 = inhouse12FoMeters > 0 ? Math.ceil(inhouse12FoMeters + fyra12) : 0;

    const fo4Mat = (materials as any[]).find((m: any) =>
      m.code === "14027437" ||
      (m.name?.toUpperCase().includes("4 FO") &&
        m.name?.toLowerCase().includes("indoor") &&
        m.name?.toLowerCase().includes("micro"))
    );
    const fo12Mat = (materials as any[]).find((m: any) =>
      m.code === "14027438" ||
      (m.name?.toUpperCase().includes("12 FO") &&
        m.name?.toLowerCase().includes("indoor") &&
        m.name?.toLowerCase().includes("micro"))
    );

    setMaterialItems((prev) => {
      const updated = [...prev];
      const upsert = (mat: any, qty: number) => {
        if (!mat) return;
        const i = updated.findIndex((m) => m.material_id === mat.id);
        if (qty <= 0) {
          if (i >= 0) updated.splice(i, 1);
          return;
        }
        if (i >= 0) {
          updated[i] = { ...updated[i], quantity: qty };
        } else {
          updated.push({
            material_id: mat.id,
            code: mat.code,
            name: mat.name,
            unit: mat.unit,
            price: mat.price,
            source: mat.source,
            quantity: qty,
          });
        }
      };
      upsert(fo4Mat, total4);
      upsert(fo12Mat, total12);
      return updated;
    });
  }, [inhouse4FoMeters, inhouse12FoMeters, routes, materials]);

  const [gisAutoFilled, setGisAutoFilled] = useState(false);

  // Extracted: GIS->materials computation. Used by auto-fill effect AND manual button.
  const computeGisMaterials = useCallback((): MaterialItem[] | null => {
    if (!gisData || !materials) return null;

    const oteMaterials = materials.filter((m) => m.source === "OTE");
    const allMaterials = materials;
    const autoItems: MaterialItem[] = [];

    const addMaterial = (match: (m: any) => boolean, qty: number, sourceFilter?: string) => {
      const pool = sourceFilter ? allMaterials.filter((m) => m.source === sourceFilter) : oteMaterials;
      const found = pool.find(match);
      if (found && qty > 0 && !autoItems.some((a) => a.material_id === found.id)) {
        autoItems.push({
          material_id: found.id,
          code: found.code,
          name: found.name,
          unit: found.unit,
          price: found.price,
          source: found.source,
          quantity: qty,
        });
      }
    };

    const nameMatches = (name: string, ...patterns: string[]) => {
      const upper = name.toUpperCase();
      return patterns.every((p) => upper.includes(p.toUpperCase()));
    };

    // 1. BEP
    if (gisData.bep_type) {
      const bepSize = gisData.bep_type.toUpperCase();
      if (bepSize.includes("SMALL")) {
        addMaterial((m) => nameMatches(m.name, "SMALL", "BEP"), 1);
      } else if (bepSize.includes("MEDIUM")) {
        addMaterial((m) => nameMatches(m.name, "MEDIUM", "BEP"), 1);
      } else if (bepSize.includes("X-LARGE") || bepSize.includes("XLARGE")) {
        addMaterial((m) => nameMatches(m.name, "X-LARGE", "BEP") || nameMatches(m.name, "XLARGE", "BEP"), 1);
      } else if (bepSize.includes("LARGE")) {
        addMaterial((m) => nameMatches(m.name, "LARGE", "BEP") && !nameMatches(m.name, "X-LARGE") && !nameMatches(m.name, "XLARGE"), 1);
      }
      const capMatch = bepSize.match(/\/(\d+)\//);
      if (capMatch && autoItems.length === 0) {
        addMaterial((m) => nameMatches(m.name, "BEP") && m.name.includes(capMatch[1]), 1);
      }
    }

    // 2. BMO - count από μοναδικά BMO IDs
    if (gisData.bmo_type) {
      const bmoSize = gisData.bmo_type.toUpperCase();
      const optPaths = (gisData.optical_paths as any[]) || [];
      const bmoIds = new Set<string>();
      optPaths.forEach((p: any) => {
        const path = p.path || p["OPTICAL PATH"] || "";
        const m = path.match(/BMO(\d+)_/);
        if (m) bmoIds.add(m[1]);
      });
      const bmoCount = bmoIds.size > 0 ? bmoIds.size : 1;

      if (bmoSize.includes("SMALL")) {
        addMaterial((m) => nameMatches(m.name, "SMALL", "BMO"), bmoCount);
      } else if (bmoSize.includes("MEDIUM")) {
        addMaterial((m) => nameMatches(m.name, "MEDIUM", "BMO"), bmoCount);
      } else if (bmoSize.includes("X-LARGE") || bmoSize.includes("XLARGE")) {
        addMaterial((m) => nameMatches(m.name, "X-LARGE", "BMO") || nameMatches(m.name, "XLARGE", "BMO"), bmoCount);
      } else if (bmoSize.includes("LARGE")) {
        addMaterial((m) => nameMatches(m.name, "LARGE", "BMO") && !nameMatches(m.name, "X-LARGE") && !nameMatches(m.name, "XLARGE"), bmoCount);
      }
    }

    // 3. Floor Boxes
    const floorDetails = (gisData.floor_details as any[]) || [];
    let fb4Total = 0;
    let fb12Total = 0;
    let fbGenericTotal = 0;

    for (const fd of floorDetails) {
      const row = fd.raw && typeof fd.raw === "object" ? fd.raw : fd;
      const keys = Object.keys(row);

      for (const key of keys) {
        const upperKey = key.toUpperCase().trim();
        const isFbKey = /^FB\s?\d+$/i.test(upperKey) || upperKey === "FB" || upperKey === "FLOOR BOX" || upperKey === "FLOORBOX";
        const isFbCountKey = /^(FB\s?\d+|FLOOR\s?BOX)$/i.test(upperKey);

        if (isFbKey || isFbCountKey) {
          const val = parseInt(String(row[key])) || 0;
          if (val <= 0) continue;

          const typeKey = keys.find((k) => {
            const uk = k.toUpperCase().trim();
            return uk === upperKey + " TYPE" || uk === upperKey + "_TYPE" || uk === upperKey + " ΤΥΠΟΣ";
          });
          const fbType = typeKey ? String(row[typeKey] || "").toUpperCase() : "";

          if (fbType.includes("12")) {
            fb12Total += val;
          } else if (fbType.includes("4")) {
            fb4Total += val;
          } else {
            fbGenericTotal += val;
          }
        }
      }

      if (fb4Total === 0 && fb12Total === 0 && fbGenericTotal === 0) {
        for (const key of keys) {
          const upperKey = key.toUpperCase().trim();
          if (upperKey.includes("FB") && !upperKey.includes("TYPE") && !upperKey.includes("ΤΥΠΟΣ")) {
            const val = parseInt(String(row[key])) || 0;
            if (val > 0) fbGenericTotal += val;
          }
        }
      }
    }

    if (fb4Total === 0 && fb12Total === 0 && fbGenericTotal === 0 && floorDetails.length > 0) {
      fbGenericTotal = floorDetails.length;
    }

    fb4Total += fbGenericTotal;

    // Match by exact code first (14034172 = FB4, 14034173 = FB12), fallback to name match
    if (fb4Total > 0) {
      addMaterial((m) => m.code === "14034172" || nameMatches(m.name, "FLOOR", "BOX", "4") || nameMatches(m.name, "FB", "4"), fb4Total);
    }
    if (fb12Total > 0) {
      addMaterial((m) => m.code === "14034173" || nameMatches(m.name, "FLOOR", "BOX", "12") || nameMatches(m.name, "FB", "12"), fb12Total);
    }

    // 5. BCP
    if (gisData.nearby_bcp || gisData.new_bcp) {
      addMaterial((m) => nameMatches(m.name, "BCP"), 1);
    }

    // 6. Nanotronix
    if (gisData.nanotronix) {
      addMaterial((m) => nameMatches(m.name, "NANOTRONIX") || nameMatches(m.name, "NANO"), 1);
    }

    // 7. Pigtail — BMO-FB paths + 4 καμπίνα
    const allOptPaths = (gisData.optical_paths as any[]) || [];
    const bmoFbCount = allOptPaths.filter(
      (p: any) => (p.type || p["OPTICAL PATH TYPE"] || "").toUpperCase() === "BMO-FB"
    ).length;
    if (bmoFbCount > 0) {
      addMaterial(
        (m) => nameMatches(m.name, "PIGTAIL") && m.name.includes("1,5"),
        bmoFbCount + 4
      );
    }

    // 8. Patchcord — BEP-BMO ενεργές πόρτες
    const bepBmoCount = allOptPaths.filter(
      (p: any) => (p.type || p["OPTICAL PATH TYPE"] || "").toUpperCase() === "BEP-BMO"
    ).length;
    if (bepBmoCount > 0) {
      addMaterial(
        (m) =>
          nameMatches(m.name, "PATCHCORD") ||
          (nameMatches(m.name, "PATCH") && nameMatches(m.name, "CORD")),
        bepBmoCount
      );
    }

    // 10. Microduct — από Ball Marker απόσταση
    // Παίρνουμε τιμή από section6 state (Οριζοντογραφία AS-BUILD)
    const hasBcp = !!(
      gisData.new_bcp ||
      gisData.nearby_bcp ||
      (gisData.optical_paths as any[])?.some(
        (p: any) => (p.type || p["OPTICAL PATH TYPE"] || "").toUpperCase().includes("BCP")
      )
    );
    // Απόσταση: αν BCP → bcp_ball_marker, αν όχι → ball_marker_bep
    const ballMarkerMeters = hasBcp
      ? parseFloat(section6?.bcp_ball_marker || "0")
      : parseFloat(section6?.ball_marker_bep || "0");
    if (ballMarkerMeters > 0) {
      // Microduct 7/4mm (μικρό) — μπαίνει η ίνα
      addMaterial(
        (m) => m.code === "14026586" || nameMatches(m.name, "Microduct", "7/4"),
        ballMarkerMeters
      );
      // Microduct 8/10mm (χοντρό) — κενό
      addMaterial(
        (m) =>
          m.code === "14034374" ||
          nameMatches(m.name, "Microduct", "8/10") ||
          nameMatches(m.name, "Microduct", "Mde"),
        ballMarkerMeters
      );
    }

    return autoItems;
  }, [gisData, materials, section6, routes]);

  // Manual trigger (button) — επαναφορτώνει υλικά από GIS αντικαθιστώντας υπάρχοντα
  const handleManualGisRefill = useCallback(() => {
    if (!gisData) {
      toast.error("Δεν υπάρχουν δεδομένα GIS για αυτό το SR");
      return;
    }
    if (!materials || materials.length === 0) {
      toast.error("Ο κατάλογος υλικών δεν έχει φορτώσει ακόμα");
      return;
    }
    const items = computeGisMaterials() || [];
    if (items.length === 0) {
      toast.warning("Δεν βρέθηκαν αντίστοιχα υλικά στον κατάλογο για τα GIS δεδομένα");
      console.log("GIS data inspected:", {
        bep_type: gisData.bep_type,
        bmo_type: gisData.bmo_type,
        optical_paths: (gisData.optical_paths as any[])?.length,
        floor_details: (gisData.floor_details as any[])?.length,
      });
      return;
    }
    setMaterialItems(items);
    setMaterialTab("OTE");
    setGisAutoFilled(true);
    toast.success(`✅ Επαναφορτώθηκαν ${items.length} υλικά από GIS`, { duration: 5000 });
  }, [gisData, materials, computeGisMaterials]);

  useEffect(() => {
    const hasExistingConstruction = !!existingConstruction;
    const hasExistingSavedMaterials = (existingMaterials?.length || 0) > 0;
    const existingMaterialLookupReady = !existingConstruction ? existingConstructionFetched : existingMaterialsFetched;

    const _diagState = {
      existingMaterialLookupReady,
      hasGisData: !!gisData,
      materialsCount: materials?.length ?? 0,
      gisAutoFilled,
      materialItemsCount: materialItems.length,
      hasExistingSavedMaterials,
      hasExistingConstruction,
    };

    if (!existingMaterialLookupReady) {
      logDiag("materials_autofill", "guard_blocked", { reason: "lookup_not_ready" }, _diagState);
      return;
    }
    if (!gisData) {
      logDiag("materials_autofill", "guard_blocked", { reason: "no_gis_data" }, _diagState);
      return;
    }
    if (!materials) {
      logDiag("materials_autofill", "guard_blocked", { reason: "materials_not_loaded" }, _diagState);
      return;
    }
    if (gisAutoFilled) {
      logDiag("materials_autofill", "guard_blocked", { reason: "already_filled_once" }, _diagState);
      return;
    }
    if (materialItems.length > 0) {
      logDiag("materials_autofill", "guard_blocked", { reason: "user_has_items", count: materialItems.length }, _diagState);
      return;
    }
    if (hasExistingSavedMaterials) {
      logDiag("materials_autofill", "guard_blocked", { reason: "db_has_saved", count: existingMaterials?.length ?? 0 }, _diagState);
      return;
    }
    if (hasExistingConstruction) {
      logDiag("materials_autofill", "guard_blocked", { reason: "existing_construction" }, _diagState);
      return;
    }

    logDiag("materials_autofill", "all_guards_passed", {}, _diagState);

    const autoItems = computeGisMaterials();
    logDiag("materials_autofill", "computed", {
      count: autoItems?.length ?? 0,
      codes: autoItems?.map((i) => `${i.code}×${i.quantity}`) ?? [],
    });

    if (autoItems && autoItems.length > 0) {
      setMaterialItems(autoItems);
      setMaterialTab("OTE");
      setGisAutoFilled(true);
      toast.success(`✅ Αυτόματη χρέωση ${autoItems.length} υλικών από GIS`, { duration: 6000 });
      logDiag("materials_autofill", "applied", { count: autoItems.length });
    } else if (gisData) {
      console.log("GIS auto-fill: no matching materials found.");
      logDiag("materials_autofill", "no_match", {
        bep_type: (gisData as any).bep_type,
        bmo_type: (gisData as any).bmo_type,
        optical_paths: ((gisData as any).optical_paths as any[])?.length,
        floor_details: ((gisData as any).floor_details as any[])?.length,
        nearby_bcp: (gisData as any).nearby_bcp,
        new_bcp: (gisData as any).new_bcp,
      });
    }
  }, [
    existingConstruction,
    existingConstructionFetched,
    existingMaterials,
    existingMaterialsFetched,
    gisData,
    materials,
    gisAutoFilled,
    materialItems.length,
    computeGisMaterials,
    section6,
    routes,
  ]);

  // Microduct trigger — προσθέτει/ενημερώνει/αφαιρεί τα 2 Microducts
  // βάσει του Ball Marker (BEP ή BCP) όταν ο τεχνικός το συμπληρώνει.
  useEffect(() => {
    if (!materials) return;
    const hasBcp = !!(
      (gisData as any)?.new_bcp ||
      (gisData as any)?.nearby_bcp ||
      ((gisData as any)?.optical_paths as any[])?.some(
        (p: any) => (p.type || p["OPTICAL PATH TYPE"] || "").toUpperCase().includes("BCP")
      )
    );
    const meters = hasBcp
      ? parseFloat(ballMarkerBcp || "0")
      : parseFloat(ballMarkerBep || "0");

    const microSmall = materials.find((m: any) =>
      m.code === "14026586" ||
      (m.name?.toUpperCase().includes("MICRODUCT") && m.name?.includes("7/4"))
    );
    const microLarge = materials.find((m: any) =>
      m.code === "14034374" ||
      (m.name?.toUpperCase().includes("MICRODUCT") &&
        (m.name?.includes("8/10") || m.name?.toUpperCase().includes("MDE")))
    );

    setMaterialItems((prev) => {
      const updated = [...prev];
      const upsertMicro = (mat: any, qty: number) => {
        if (!mat) return;
        const idx = updated.findIndex((m) => m.material_id === mat.id);
        if (qty <= 0) {
          if (idx >= 0) updated.splice(idx, 1);
          return;
        }
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], quantity: qty };
        } else {
          updated.push({
            material_id: mat.id,
            code: mat.code,
            name: mat.name,
            unit: mat.unit,
            price: mat.price,
            source: mat.source,
            quantity: qty,
          });
        }
      };
      upsertMicro(microSmall, meters);
      upsertMicro(microLarge, meters);

      // Ενδεικτικό πλέγμα σήμανσης 20cm = Μ/Σ Σκάμμα μέτρα
      const skammaMeters = parseFloat(
        ballMarkerBep ? (section6?.ms_skamma || "0") : "0"
      );
      const plegma = materials.find((m: any) => {
        const upper = (m.name || "").toUpperCase();
        return (
          m.code === "14023051" ||
          (upper.includes("ΠΛΕΓΜΑ") && upper.includes("ΣΗΜΑΝΣΗΣ")) ||
          upper.includes("PLEGMA") ||
          (upper.includes("ΕΝΔΕΙΚΤΙΚΟ") && upper.includes("ΠΛΕΓΜΑ"))
        );
      });
      upsertMicro(plegma, skammaMeters);

      return updated;
    });
  }, [ballMarkerBep, ballMarkerBcp, materials, gisData, section6]);

  // Trigger: ΣΠΙΡΑΛ + ΚΟΛΑΡΑ από Ball Marker BEP - Μ/Σ Σκάμμα
  useEffect(() => {
    if (!materials) return;
    const ballMarker = parseFloat(ballMarkerBep || "0");
    const skamma = parseFloat(section6?.ms_skamma || "0");
    // ΣΠΙΡΑΛ = Ball Marker - Μ/Σ Σκάμμα
    const spiralMeters = ballMarker - skamma;
    const spiralMat = materials.find(
      (m: any) =>
        m.code === "01-20250250" ||
        (m.name?.toUpperCase().includes("ΣΠΙΡΑΛ") && m.name?.includes("25"))
    );
    const kolaraMat = materials.find(
      (m: any) =>
        m.code === "01-41250250" ||
        (m.name?.toUpperCase().includes("ΚΟΛΑΡΑ") && m.name?.includes("25"))
    );
    // ΚΟΛΑΡΑ = ceil(ΣΠΙΡΑΛ / 0.80)
    const kolaraQty = spiralMeters > 0 ? Math.ceil(spiralMeters / 0.8) : 0;
    setMaterialItems((prev) => {
      const updated = [...prev];
      const upsert = (mat: any, qty: number) => {
        if (!mat) return;
        const i = updated.findIndex((m) => m.material_id === mat.id);
        if (qty <= 0) {
          if (i >= 0) updated.splice(i, 1);
          return;
        }
        if (i >= 0) {
          updated[i] = { ...updated[i], quantity: qty };
        } else {
          updated.push({
            material_id: mat.id,
            code: mat.code,
            name: mat.name,
            unit: mat.unit,
            price: mat.price,
            source: mat.source,
            quantity: qty,
          });
        }
      };
      upsert(spiralMat, spiralMeters > 0 ? Math.ceil(spiralMeters) : 0);
      upsert(kolaraMat, kolaraQty);
      return updated;
    });
  }, [ballMarkerBep, section6?.ms_skamma, materials]);

  // BCP → BEP υλικά
  useEffect(() => {
    if (!materials) return;
    const bcpBepMeters = parseFloat(section6?.bcp_bep_ypogeia || "0");
    // Αν δεν υπάρχει BCP → καθάρισε
    const hasBcp = !!(
      (gisData as any)?.new_bcp ||
      (gisData as any)?.nearby_bcp ||
      ((gisData as any)?.optical_paths as any[])?.some((p: any) =>
        (p.type || p["OPTICAL PATH TYPE"] || "").toUpperCase().includes("BCP")
      )
    );
    // Υλικά BCP→BEP
    const spiral16 = materials.find(
      (m: any) =>
        m.code === "01-20250160" ||
        (m.name?.toUpperCase().includes("ΣΠΙΡΑΛ") && m.name?.includes("16"))
    );
    const kolara16 = materials.find(
      (m: any) =>
        m.code === "01-41250160" ||
        (m.name?.toUpperCase().includes("ΚΟΛΑΡΑ") && m.name?.includes("16"))
    );
    const microduct74 = materials.find(
      (m: any) =>
        m.code === "14026586" ||
        (m.name?.toUpperCase().includes("MICRODUCT") && m.name?.includes("7/4"))
    );
    const fo4indoor = materials.find(
      (m: any) =>
        m.code === "14027437" ||
        (m.name?.toUpperCase().includes("4 FO") &&
          m.name?.toLowerCase().includes("indoor") &&
          m.name?.toLowerCase().includes("micro"))
    );
    // ΚΟΛΑΡΑ Φ16 ανά 60εκ
    const kolara16Qty = bcpBepMeters > 0 ? Math.ceil(bcpBepMeters / 0.6) : 0;
    setMaterialItems((prev) => {
      const updated = [...prev];
      const upsert = (mat: any, qty: number) => {
        if (!mat) return;
        const i = updated.findIndex((m) => m.material_id === mat.id);
        // Αν δεν υπάρχει BCP ή qty=0 → αφαίρεσε το υλικό
        if (!hasBcp || qty <= 0) {
          if (i >= 0) updated.splice(i, 1);
          return;
        }
        if (i >= 0) {
          updated[i] = { ...updated[i], quantity: qty };
        } else {
          updated.push({
            material_id: mat.id,
            code: mat.code,
            name: mat.name,
            unit: mat.unit,
            price: mat.price,
            source: mat.source,
            quantity: qty,
          });
        }
      };
      // ΣΠΙΡΑΛ Φ16 = bcpBepMeters
      upsert(spiral16, bcpBepMeters > 0 ? Math.ceil(bcpBepMeters) : 0);
      // ΚΟΛΑΡΑ Φ16 = ceil(μέτρα / 0.60)
      upsert(kolara16, kolara16Qty);
      // Microduct 7/4 = bcpBepMeters
      // ΠΡΟΣΟΧΗ: ο microduct 7/4 μπορεί να υπάρχει ήδη από BEP (Ball Marker)
      // — δεν αντικαθιστούμε την υπάρχουσα ποσότητα
      if (hasBcp && bcpBepMeters > 0 && microduct74) {
        const existIdx = updated.findIndex((m) => m.material_id === microduct74.id);
        if (existIdx < 0) {
          updated.push({
            material_id: microduct74.id,
            code: microduct74.code,
            name: microduct74.name,
            unit: microduct74.unit,
            price: microduct74.price,
            source: microduct74.source,
            quantity: bcpBepMeters,
          });
        }
      }
      // 4FO indoor = bcpBepMeters
      // ΠΡΟΣΟΧΗ: ο 4FO indoor μπορεί να υπάρχει ήδη από INHOUSE
      // — δεν τον αντικαθιστούμε
      if (hasBcp && bcpBepMeters > 0 && fo4indoor) {
        const existIdx = updated.findIndex((m) => m.material_id === fo4indoor.id);
        if (existIdx < 0) {
          updated.push({
            material_id: fo4indoor.id,
            code: fo4indoor.code,
            name: fo4indoor.name,
            unit: fo4indoor.unit,
            price: fo4indoor.price,
            source: fo4indoor.source,
            quantity: bcpBepMeters,
          });
        }
      }
      return updated;
    });
  }, [section6?.bcp_bep_ypogeia, gisData, materials]);

  // Trigger: 4 FO outdoor — routes[0].koi
  const cabToBepKoiStr = routes[0]?.koi || "0";
  useEffect(() => {
    if (!materials) return;
    const cabToBepKoi = parseFloat(cabToBepKoiStr);
    const foOutdoor = materials.find((m: any) => {
      const n = (m.name || "").toLowerCase();
      return (
        m.code === "14027440" ||
        (n.includes("4 fo") && n.includes("outdoor")) ||
        (n.includes("4 fo") && n.includes("induct"))
      );
    });
    if (!foOutdoor) return;
    setMaterialItems(prev => {
      const updated = [...prev];
      const idx = updated.findIndex(m => m.material_id === foOutdoor.id);
      if (cabToBepKoi <= 0) {
        if (idx >= 0) updated.splice(idx, 1);
        return updated;
      }
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], quantity: cabToBepKoi };
      } else {
        updated.push({
          material_id: foOutdoor.id,
          code: foOutdoor.code,
          name: foOutdoor.name,
          unit: foOutdoor.unit,
          price: foOutdoor.price,
          source: foOutdoor.source,
          quantity: cabToBepKoi,
        });
      }
      return updated;
    });
  }, [cabToBepKoiStr, materials]);

  // Auto-fill basic fields from GIS data
  const [gisFieldsFilled, setGisFieldsFilled] = useState(false);
  useEffect(() => {
    if (!gisData || gisFieldsFilled || !!existingConstruction) return;

    // CAB from assignment or GIS associated_bcp
    if (!cab && gisData.associated_bcp) {
      setCab(gisData.associated_bcp);
    }

    // Floors — με πολλαπλά fallbacks για να βεβαιωθούμε ότι έχουμε σωστή τιμή
    if (floors === "0" || floors === "" || !floors) {
      // 1) Πρώτη προτεραιότητα: gisData.floors
      if (gisData.floors && Number(gisData.floors) > 0) {
        setFloors(String(gisData.floors));
      }
      // 2) Δεύτερη: count από floor_details
      else if (Array.isArray((gisData as any).floor_details) && (gisData as any).floor_details.length > 0) {
        setFloors(String((gisData as any).floor_details.length));
      }
      // 3) Τρίτη: count από optical_paths με BMO/FB
      else {
        const paths = ((gisData as any).optical_paths as any[]) || [];
        const fbFloors = new Set(
          paths
            .map((p: any) => {
              const path = p.path || p["OPTICAL PATH"] || "";
              const m = path.match(/FB(\d+)/i) || path.match(/_F(\d+)/i);
              return m ? m[1] : null;
            })
            .filter(Boolean)
        );
        if (fbFloors.size > 0) {
          setFloors(String(fbFloors.size));
        }
      }
    }

    // Routing type from area_type or conduit
    if (!routingType) {
      if (gisData.area_type) {
        setRoutingType(gisData.area_type);
      } else if (gisData.conduit) {
        setRoutingType(gisData.conduit);
      }
    }

    // AK from building_id
    if (!ak && gisData.building_id) {
      setAk(gisData.building_id);
    }

    // Routes from optical_paths
    const opticalPaths = (gisData.optical_paths as any[]) || [];
    if (opticalPaths.length > 0) {
      setRoutes((prev) => {
        const updated = [...prev];
        
        // Check if any path is INHOUSE — if so, skip ΕΝΑΕΡΙΟ auto-fill
        const hasInhouse = opticalPaths.some((path) => {
          const raw = path.raw || path;
          const pt = (raw["OPTICAL PATH TYPE"] || raw["optical_path_type"] || "").toUpperCase();
          return pt.includes("INHOUSE") || pt.includes("ΚΑΘΕΤ") || pt.includes("BEP-BMO") || pt.includes("BMO-FB");
        });
        
        for (const path of opticalPaths) {
          const raw = path.raw || path;
          const pathType = (raw["OPTICAL PATH TYPE"] || raw["optical_path_type"] || "").toUpperCase();
          const koiVal = String(raw["KOI"] || raw["koi"] || "");
          const fyraVal = String(raw["4KOI"] || raw["fyra_koi"] || raw["4ΚΟΙ"] || "");

          // Match to existing route labels
          let matchIdx = -1;
          if (pathType.includes("ΥΠΟΓ") || pathType.includes("CABIN TO BEP") || pathType.includes("CAB")) {
            matchIdx = 0;
          } else if (pathType.includes("ΕΝΑΕΡΙΟ") && pathType.includes("ΔΔ")) {
            matchIdx = 1;
          } else if (pathType.includes("ΕΝΑΕΡΙΟ") && pathType.includes("ΣΥΝΔΡ")) {
            matchIdx = 2;
          } else if (pathType.includes("INHOUSE") || pathType.includes("ΚΑΘΕΤ")) {
            matchIdx = 3;
          }

          // Skip ΕΝΑΕΡΙΟ routes (index 1, 2) when INHOUSE path exists
          if (hasInhouse && (matchIdx === 1 || matchIdx === 2)) {
            continue;
          }

          if (matchIdx >= 0) {
            updated[matchIdx] = {
              ...updated[matchIdx],
              koi: koiVal || updated[matchIdx].koi,
              fyraKoi: fyraVal || updated[matchIdx].fyraKoi,
            };
          }
        }
        return updated;
      });
    }

    // Notes
    if (gisData.notes && !pendingNote) {
      setPendingNote(gisData.notes);
    }

    setGisFieldsFilled(true);
    toast.success("Αυτόματη συμπλήρωση στοιχείων από GIS");
  }, [gisData, gisFieldsFilled, existingConstruction]);

  const worksByCategory = useMemo(() => {
    if (!workPricing) return {};
    const groups: Record<string, typeof workPricing> = {};
    const uncategorized: typeof workPricing = [];
    
    // In crew mode, filter to only allowed prefixes
    const allowedPrefixes = filterWorkPrefixes && filterWorkPrefixes.length > 0 ? filterWorkPrefixes : null;
    
    for (const w of workPricing) {
      const cat = getCategoryForCode(w.code);
      if (cat) {
        // Skip categories not in allowed prefixes (crew mode)
        if (allowedPrefixes && !allowedPrefixes.some((p) => cat.prefixes.some((cp) => cp === p || w.code.startsWith(p)))) continue;
        if (!groups[cat.prefix]) groups[cat.prefix] = [];
        groups[cat.prefix].push(w);
      } else {
        if (!allowedPrefixes) uncategorized.push(w);
      }
    }
    if (uncategorized.length > 0) groups["other"] = uncategorized;
    return groups;
  }, [workPricing, filterWorkPrefixes]);

  // ⚡ LIVE AUTO-BILLING ENGINE
  // Παρακολουθεί τα πεδία της φόρμας και ενημερώνει αυτόματα τα workItems.
  // Διατηρεί χειροκίνητα προστιθέμενα άρθρα — προσθέτει μόνο όσα λείπουν.
  useEffect(() => {
    // Snapshot για διαγνωστικά
    const _diagState = {
      autoBillingEnabled,
      oteArticlesCount: oteArticlesRaw?.length ?? 0,
      isCrewMode,
      workPricingCount: workPricing?.length ?? 0,
      existingConstructionLoaded,
      hasExistingConstruction: !!existingConstruction?.id,
      existingWorksLoaded,
      buildingType,
      floors: parseInt(floors) || 0,
    };

    if (!autoBillingEnabled) {
      console.log("[AutoBilling] ⏸ disabled");
      logDiag("auto_billing", "guard_blocked", { reason: "autoBillingEnabled=false" }, _diagState);
      return;
    }
    if (!oteArticlesRaw || oteArticlesRaw.length === 0) {
      console.log("[AutoBilling] ⏸ no OTE articles loaded yet");
      logDiag("auto_billing", "guard_blocked", { reason: "no_ote_articles", got: oteArticlesRaw?.length ?? null }, _diagState);
      return;
    }
    if (!workPricing) {
      console.log("[AutoBilling] ⏸ work_pricing not loaded");
      logDiag("auto_billing", "guard_blocked", { reason: "work_pricing_not_loaded" }, _diagState);
      return;
    }
    if (!existingConstructionLoaded) {
      console.log("[AutoBilling] ⏸ waiting for existing construction");
      logDiag("auto_billing", "guard_blocked", { reason: "existing_construction_not_loaded" }, _diagState);
      return;
    }
    if (existingConstruction?.id && !existingWorksLoaded) {
      console.log("[AutoBilling] ⏸ waiting for existing works");
      logDiag("auto_billing", "guard_blocked", { reason: "existing_works_not_loaded", construction_id: existingConstruction.id }, _diagState);
      return;
    }

    logDiag("auto_billing", "all_guards_passed", {}, _diagState);

    // Σωστή επιλογή μέτρων εισαγωγής βάσει type — ΟΧΙ fallback ||
    // (αλλιώς όταν αλλάζει type μένουν τα παλιά μέτρα και βγαίνει λάθος tier κωδικός)
    let eisagogiMeters = 0;
    switch (section6?.eisagogi_type) {
      case "ΝΕΑ ΥΠΟΔΟΜΗ":
        eisagogiMeters = parseFloat(section6?.ms_skamma || "0") || 0;
        break;
      case "ΕΣΚΑΛΗΤ":
        eisagogiMeters =
          parseFloat(section6?.eskalit_solienosi_eisagogis || "0") ||
          parseFloat(section6?.eskalit_ms || "0") ||
          0;
        break;
      case "ΕΣΚΑΛΗΤ Β1":
        eisagogiMeters = parseFloat(section6?.eskalit_b1_bep || "0") || 0;
        break;
    }

    // Floors fallback: αν floors=0 αλλά υπάρχουν floor_meters γραμμές, χρησιμοποίησέ τες
    const parsedFloors = parseInt(floors) || 0;
    const floorMetersWithValues = floorMeters.filter(
      (fm) => parseFloat(fm.meters) > 0,
    ).length;
    let effectiveFloors = parsedFloors > 0 ? parsedFloors : floorMetersWithValues;

    // Fallback chain για floors: gisData.floors → floor_details.length → floorMeters count
    if (effectiveFloors === 0) {
      const gisFloors = Number((gisData as any)?.floors);
      if (gisFloors > 0) {
        effectiveFloors = gisFloors;
        console.log("[AutoBilling] Using gisData.floors as fallback:", gisFloors);
      }
    }
    if (effectiveFloors === 0) {
      const fd = (gisData as any)?.floor_details;
      if (Array.isArray(fd) && fd.length > 0) {
        effectiveFloors = fd.length;
        console.log("[AutoBilling] Using floor_details.length as fallback:", fd.length);
      }
    }

    // === BCP DETECTION ===
    // Υπάρχει BCP αν: (α) GIS το δείχνει Ή (β) ο τεχνικός επέλεξε "BCP" στο eisagogi_type
    const hasBcpFromGis = !!(
      (gisData as any)?.new_bcp ||
      (gisData as any)?.nearby_bcp ||
      (gisData as any)?.raw_data?.bcp_placement
    );
    const hasBcpFromUser = section6?.eisagogi_type === "BCP";
    const hasBcp = hasBcpFromGis || hasBcpFromUser;

    const billingInput: AutoBillingInput = {
      sr_id: assignment?.sr_id,
      building_type: buildingType,
      floors: effectiveFloors,
      route_cab_to_bep_meters:
        (parseFloat(effectiveRoutes[0]?.koi || "0") || 0) ||
        Number((gisData as any)?.distance_from_cabinet) || 0,
      route_aerial_cab_to_bep_meters: parseFloat(effectiveRoutes[1]?.koi || "0") || 0,
      route_aerial_bep_to_fb_meters: parseFloat(effectiveRoutes[2]?.koi || "0") || 0,
      route_inhouse_meters: inhouseKoiSum,
      floor_meters_count: floorMetersWithValues,
      eisagogi_type: section6?.eisagogi_type || null,
      eisagogi_meters: eisagogiMeters,

      // 🆕 BCP — ΞΕΧΩΡΙΣΤΑ πεδία (όχι sum)
      has_bcp: hasBcp,
      bcp_eidos: section6?.bcp_eidos || null,
      bcp_skamma_meters: parseFloat(section6?.bcp_ms || "0") || 0,
      bcp_to_bep_underground_meters: parseFloat(section6?.bcp_bep_ypogeia || "0") || 0,
      bcp_to_bep_aerial_meters: parseFloat(section6?.bcp_bep_enaeria || "0") || 0,

      fb_same_level_as_bep: Boolean(section6?.fb_same_level_as_bep),
      horizontal_meters: parseFloat(String(section6?.horizontal_meters || "0")) || 0,
      cab_to_bep_damaged: Boolean(section6?.cab_to_bep_damaged),
    };

    console.log("[AutoBilling] ▶ running with input:", {
      sr_id: billingInput.sr_id,
      building_type: billingInput.building_type,
      floors_raw: parsedFloors,
      floor_meters_filled: floorMetersWithValues,
      effective_floors: effectiveFloors,
      eisagogi_type: billingInput.eisagogi_type,
      eisagogi_meters: billingInput.eisagogi_meters,
      cab_bep_ug: billingInput.route_cab_to_bep_meters,
      cab_bep_air: billingInput.route_aerial_cab_to_bep_meters,
      articles_in_catalog: oteArticlesRaw.length,
    });

    const computed = computeAutoBilling(billingInput, oteArticlesRaw);
    console.log(
      `[AutoBilling] ✓ computed ${computed.length} articles:`,
      computed.map((c) => `${c.code}×${c.quantity}`).join(", "),
    );
    logDiag("auto_billing", "computed", {
      input: billingInput,
      output_count: computed.length,
      codes: computed.map((c) => `${c.code}×${c.quantity}`),
    });

    let summary: { added: number; updated: number } | null = null;

    setWorkItems((prev) => {
      const { items, added, updated, removed, nextAutoAddedCodes } = mergeAutoBilling(
        prev,
        computed,
        oteArticlesRaw,
        { autoAddedCodes: autoAddedCodesRef.current },
      );
      autoAddedCodesRef.current = nextAutoAddedCodes;
      if (added.length === 0 && updated.length === 0 && removed.length === 0) return prev;
      summary = { added: added.length, updated: updated.length };
      return items;
    });

    if (summary) {
      setLastAutoBillingSummary(summary);
      logDiag("auto_billing", "applied_changes", {
        added: (summary as any).added,
        updated: (summary as any).updated,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoBillingEnabled,
    oteArticlesRaw,
    workPricing,
    isCrewMode,
    assignment?.sr_id,
    buildingType,
    floors,
    effectiveRoutes,
    existingConstruction?.id,
    existingConstructionLoaded,
    existingWorksLoaded,
    inhouseKoiSum,
    floorMeters,
    section6,
  ]);

  // ⚡ Auto-Materials live engine — τρέχει σε κάθε αλλαγή building_type/floor_meters
  useEffect(() => {
    if (!autoBillingEnabled) return;
    if (!materials || materials.length === 0) return;
    if (existingConstruction && !existingMaterialsLoaded) return;

    const matInput: AutoMaterialsInput = {
      building_type: buildingType,
      floor_meters: floorMeters,
    };

    const computed = computeAutoMaterials(matInput, materials as any);
    if (computed.length === 0 && autoAddedMaterialIdsRef.current.size === 0) return;

    setMaterialItems((prev) => {
      const { items, added, updated, removed, nextAutoAddedIds } = mergeAutoMaterials(
        prev,
        computed,
        materials as any,
        (mat, quantity) => ({
          material_id: mat.id,
          code: mat.code,
          name: mat.name,
          unit: mat.unit,
          price: Number(mat.price) || 0,
          source: mat.source,
          quantity,
        }),
        { autoAddedIds: autoAddedMaterialIdsRef.current },
      );
      autoAddedMaterialIdsRef.current = nextAutoAddedIds;
      if (added.length === 0 && updated.length === 0 && removed.length === 0) return prev;
      console.log(
        `[AutoMaterials] +${added.length} ~${updated.length} -${removed.length}`,
      );
      return items;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoBillingEnabled,
    materials,
    buildingType,
    floorMeters,
    existingConstruction?.id,
    existingMaterialsLoaded,
  ]);

  // ⚡ LIVE MATERIALS AUTO-FILL (GIS + Οριζοντογραφία + floorMeters + routes)
  useEffect(() => {
    if (isCrewMode) return;
    if (!gisData) return;
    if (!materials || materials.length === 0) return;
    if (!existingConstructionLoaded) return;
    if (existingConstruction?.id && !existingMaterialsLoaded) return;

    const liveInput: MaterialsAutoFillInput = {
      gisData,
      section6: (section6 || {}) as Record<string, any>,
      floorMeters,
      materials,
      routes: effectiveRoutes,
    };

    const computed = computeLiveMaterials(liveInput);
    logDiag("materials_autofill", "live_computed", {
      count: computed.length,
      codes: computed.map((m) => `${m.code}×${m.quantity}`),
    });

    let summary: { added: number; updated: number } | null = null;

    setMaterialItems((prev) => {
      const { items, added, updated, removed, nextAutoAddedIds } = mergeLiveMaterials(
        prev,
        computed,
        { autoAddedIds: autoAddedLiveMaterialIdsRef.current },
      );
      autoAddedLiveMaterialIdsRef.current = nextAutoAddedIds;
      if (added.length === 0 && updated.length === 0 && removed.length === 0)
        return prev;
      summary = { added: added.length, updated: updated.length };
      return items;
    });

    if (summary) {
      setLastMaterialsAutoSummary(summary);
      logDiag("materials_autofill", "live_applied", summary as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gisData,
    materials,
    section6,
    floorMeters,
    effectiveRoutes,
    isCrewMode,
    existingConstructionLoaded,
    existingConstruction?.id,
    existingMaterialsLoaded,
  ]);

  // Group materials by category
  const materialsByCategory = useMemo(() => {
    if (!materials) return {};
    const groups: Record<string, Record<string, typeof materials>> = { OTE: {}, DELTANETWORK: {} };
    
    // In crew mode, filter to only allowed material codes
    const allowedCodes = filterMaterialCodes && filterMaterialCodes.length > 0 ? new Set(filterMaterialCodes) : null;
    
    for (const m of materials) {
      // Skip materials not in allowed codes (crew mode)
      if (allowedCodes && !allowedCodes.has(m.code)) continue;

      // 3-Phase technician mode: only show materials present in the technician's personal warehouse
      if (phase) {
        const inv = techInventoryMap.get(m.id) || 0;
        if (inv <= 0) continue;
      }
      
      const source = m.source as "OTE" | "DELTANETWORK";
      if (!groups[source]) groups[source] = {};
      
      const cat = MATERIAL_CATEGORIES.find((c) => c.match(m.name, m.code));
      const catLabel = cat?.label || "Λοιπά";
      if (!groups[source][catLabel]) groups[source][catLabel] = [];
      groups[source][catLabel].push(m);
    }
    return groups;
  }, [materials, filterMaterialCodes, phase, techInventoryMap]);

  // Toggle category
  const toggleWorkCategory = (prefix: string) => {
    setOpenWorkCategories((prev) =>
      prev.includes(prefix) ? prev.filter((p) => p !== prefix) : [...prev, prefix]
    );
  };
  const toggleMaterialCategory = (cat: string) => {
    setOpenMaterialCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // Check if work is selected
  const findSelectedWork = (work: { id?: string; code?: string } | string) => {
    const id = typeof work === "string" ? work : work.id;
    const code = typeof work === "string" ? undefined : work.code;
    return workItems.find((w) => w.work_pricing_id === id || (!!code && w.code === code));
  };
  const isWorkSelected = (work: { id?: string; code?: string } | string) => Boolean(findSelectedWork(work));
  const getWorkQty = (work: { id?: string; code?: string } | string) => findSelectedWork(work)?.quantity || 0;
  
  const isMaterialSelected = (id: string) => materialItems.some((m) => m.material_id === id);
  const getMaterialQty = (id: string) => materialItems.find((m) => m.material_id === id)?.quantity || 0;

  // Toggle work item
  const toggleWork = (w: any) => {
    const selected = findSelectedWork(w);
    if (selected) {
      setWorkItems((prev) => prev.filter((wi) => wi.work_pricing_id !== selected.work_pricing_id && wi.code !== selected.code));
    } else {
      setWorkItems((prev) => [
        ...prev,
        {
          work_pricing_id: w.id,
          code: w.code,
          description: w.description,
          unit: w.unit,
          unit_price: w.unit_price,
          quantity: 1,
        },
      ]);
    }
  };

  // Toggle material
  const toggleMaterial = (m: any) => {
    if (isMaterialSelected(m.id)) {
      setMaterialItems((prev) => prev.filter((mi) => mi.material_id !== m.id));
    } else {
      setMaterialItems((prev) => [
        ...prev,
        {
          material_id: m.id,
          code: m.code,
          name: m.name,
          unit: m.unit,
          price: m.price,
          source: m.source,
          quantity: 1,
        },
      ]);
    }
  };

  // Update quantities
  const updateWorkQty = (id: string, qty: number, code?: string) => {
    if (qty < 1) qty = 1;
    setWorkItems((prev) => prev.map((w) => (w.work_pricing_id === id || (!!code && w.code === code) ? { ...w, quantity: qty } : w)));
  };
  const updateMaterialQty = (id: string, qty: number) => {
    if (qty < 1) qty = 1;
    setMaterialItems((prev) => prev.map((m) => (m.material_id === id ? { ...m, quantity: qty } : m)));
  };

  // compressImage imported from shared utility

  // Floating camera sheet state
  const [showCameraSheet, setShowCameraSheet] = useState(false);

  // Photo handling per category with AI QA
  const handleCategoryPhotoSelect = async (category: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const ref = fileInputRefs.current[category];
    if (ref) ref.value = "";
    
    // Compress all photos in parallel
    const compressed = await Promise.all(files.map((f) => compressImage(f)));

    // Apply watermark
    const wmData: WatermarkData = {
      srId: assignment?.sr_id || "—",
      address: assignment?.address || undefined,
      latitude: assignment?.latitude,
      longitude: assignment?.longitude,
      datetime: new Date(),
    };
    const watermarked = await Promise.all(compressed.map((f) => applyWatermark(f, wmData)));
    // AI analysis for each photo (only when online)
    const accepted: File[] = [];
    const acceptedPreviews: string[] = [];

    for (let i = 0; i < watermarked.length; i++) {
      const file = watermarked[i];
      const existingCount = (categorizedPhotos[category] || []).length;
      const idx = existingCount + accepted.length;


      accepted.push(file);
      const preview = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.readAsDataURL(file);
      });
      acceptedPreviews.push(preview);
    }

    if (accepted.length > 0) {
      setCategorizedPhotos((prev) => ({ ...prev, [category]: [...(prev[category] || []), ...accepted] }));
      setCategorizedPreviews((prev) => ({ ...prev, [category]: [...(prev[category] || []), ...acceptedPreviews] }));
    }
  };

  const removeCategoryPhoto = (category: string, index: number) => {
    setCategorizedPhotos((prev) => ({
      ...prev,
      [category]: (prev[category] || []).filter((_, i) => i !== index),
    }));
    setCategorizedPreviews((prev) => ({
      ...prev,
      [category]: (prev[category] || []).filter((_, i) => i !== index),
    }));
  };

  const totalPhotos = Object.values(categorizedPhotos).reduce((sum, arr) => sum + arr.length, 0);
  const totalOtdrFiles = Object.values(otdrFiles).reduce((sum, arr) => sum + arr.length, 0);

  // Form completion progress (mobile UX indicator)
  const progress = useMemo(() => {
    let score = 0;
    if (sesId) score += 20;
    if (routes.some((r) => r.koi)) score += 20;
    if (workItems.length > 0) score += 20;
    if (materialItems.length > 0) score += 20;
    if (totalPhotos > 0) score += 20;
    return score;
  }, [sesId, routes, workItems, materialItems, totalPhotos]);

  // Validation: mandatory photo categories must have at least 1 photo (new or existing) and no unresolved rejections
  const mandatoryPhotosValid = useMemo(() => {
    for (const key of mandatoryPhotoKeys) {
      const newCount = (categorizedPhotos[key] || []).length;
      const existingCount = existingPhotoCounts[key] || 0;
      if (newCount + existingCount === 0) return false;
    }
    return true;
  }, [mandatoryPhotoKeys, categorizedPhotos, existingPhotoCounts]);

  const missingMandatoryCategories = useMemo(() => {
    const missing: string[] = [];
    for (const key of mandatoryPhotoKeys) {
      const newCount = (categorizedPhotos[key] || []).length;
      const existingCount = existingPhotoCounts[key] || 0;
      if (newCount + existingCount === 0) {
        const cat = ALL_PHOTO_CATEGORIES.find((c) => c.key === key);
        missing.push(cat?.label || key);
      }
    }
    return missing;
  }, [mandatoryPhotoKeys, categorizedPhotos, existingPhotoCounts]);

  // ─── Photo Checklist (Phase 3 only — server-defined requirements) ───
  const { data: userRole } = useUserRole();
  const isAdminUser = userRole === "admin" || userRole === "super_admin";

  const photoCountsForChecklist = useMemo(() => {
    const merged: Record<string, number> = {};
    for (const cat of ALL_PHOTO_CATEGORIES) {
      const existing = existingPhotoCounts[cat.key] || 0;
      const newPending = (categorizedPhotos[cat.key] || []).length;
      merged[cat.key] = existing + newPending;
      // Also expose under storageName for ASCII alias lookups
      merged[cat.storageName] = existing + newPending;
    }
    return merged;
  }, [existingPhotoCounts, categorizedPhotos]);

  const { summary: photoChecklist } = usePhotoChecklist(
    phase === 3 ? phase : null,
    buildingType,
    photoCountsForChecklist
  );

  // Map category key (UI: ΣΚΑΜΑ, ΟΔΕΥΣΗ, BEP, ...) → checklist item.
  // The hook keys items by DB category_key (SKAMA, ODEFSI, BEP, ...), so we map back via aliases.
  const checklistByCatKey = useMemo(() => {
    const map = new Map<string, typeof photoChecklist extends { items: infer I } ? I extends Array<infer T> ? T : never : never>();
    if (!photoChecklist) return map;
    const aliases: Record<string, string[]> = {
      SKAMA: ["ΣΚΑΜΑ", "SKAMA"],
      ODEFSI: ["ΟΔΕΥΣΗ", "ODEFSI"],
      KAMPINA: ["ΚΑΜΠΙΝΑ", "KAMPINA"],
      G_FASI: ["Γ_ΦΑΣΗ", "G_FASI"],
      BEP: ["BEP"], BMO: ["BMO"], FB: ["FB"], BCP: ["BCP"],
    };
    for (const item of photoChecklist.items) {
      const keys = aliases[item.category_key] || [item.category_key];
      for (const k of keys) map.set(k, item);
    }
    return map;
  }, [photoChecklist]);

  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  // OTDR PDF handlers
  const handleOtdrSelect = (category: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type === "application/pdf");
    if (files.length === 0) { toast.error("Μόνο PDF αρχεία επιτρέπονται"); return; }
    setOtdrFiles((prev) => ({ ...prev, [category]: [...(prev[category] || []), ...files] }));
    const ref = otdrInputRefs.current[category];
    if (ref) ref.value = "";
  };

  const removeOtdrFile = (category: string, index: number) => {
    setOtdrFiles((prev) => ({ ...prev, [category]: (prev[category] || []).filter((_, i) => i !== index) }));
  };

  // Totals
  const totalRevenue = workItems.reduce((sum, w) => sum + w.unit_price * w.quantity, 0);
  const deltanetMaterials = materialItems.filter((m) => m.source === "DELTANETWORK");
  const oteMaterials = materialItems.filter((m) => m.source === "OTE");
  const totalMaterialCost = deltanetMaterials.reduce((sum, m) => sum + m.price * m.quantity, 0);

  const calculateMaterialDeltas = (
    previousMaterials: Array<{ material_id: string; quantity: number; source: string | null }>,
    nextMaterials: MaterialItem[]
  ) => {
    const previousMap = new Map<string, { quantity: number; source: string }>();
    for (const item of previousMaterials) {
      previousMap.set(item.material_id, {
        quantity: Number(item.quantity) || 0,
        source: item.source || "DELTANETWORK",
      });
    }

    const nextMap = new Map<string, { quantity: number; source: string }>();
    for (const item of nextMaterials) {
      nextMap.set(item.material_id, {
        quantity: Number(item.quantity) || 0,
        source: item.source,
      });
    }

    const materialIds = new Set<string>([...previousMap.keys(), ...nextMap.keys()]);
    const deltas: Array<{ material_id: string; quantity: number; source: string }> = [];

    for (const materialId of materialIds) {
      const prevQty = previousMap.get(materialId)?.quantity || 0;
      const nextQty = nextMap.get(materialId)?.quantity || 0;
      const delta = nextQty - prevQty;
      if (Math.abs(delta) < 0.0001) continue;

      deltas.push({
        material_id: materialId,
        quantity: delta,
        source: nextMap.get(materialId)?.source || previousMap.get(materialId)?.source || "DELTANETWORK",
      });
    }

    return deltas;
  };

  const handleSubmit = async () => {
    hapticFeedback.medium();
    if (!isCrewMode && !cab.trim()) {
      toast.error("Η Καμπίνα (CAB) είναι υποχρεωτική");
      return;
    }
    if (!isCrewMode && workItems.length === 0) {
      toast.error("Επιλέξτε τουλάχιστον μία εργασία");
      return;
    }

    // 3-Phase technician mode: warn if requested quantity exceeds personal warehouse stock
    if (phase && materialItems.length > 0) {
      const insufficient = materialItems.filter((item) => {
        const avail = techInventoryMap.get(item.material_id) || 0;
        return item.quantity > avail;
      });
      if (insufficient.length > 0) {
        const names = insufficient.map((i) => `${i.code} (${i.quantity}/${techInventoryMap.get(i.material_id) || 0})`).join(", ");
        toast.warning(`⚠️ Ανεπαρκές απόθεμα: ${names}`, {
          description: "Συνεχίζεται η αποθήκευση αλλά το απόθεμα θα γίνει αρνητικό.",
          duration: 5000,
        });
      }
    }

    // ═══════ CREW MODE BRANCH ═══════
    if (isCrewMode) {
      setSubmitting(true);
      try {
        setSubmitProgress("Αποθήκευση κατασκευής...");

        // Find or create construction record
        const { data: existingConstruction, error: existingConstructionError } = await supabase
          .from("constructions")
          .select("id, photo_counts")
          .eq("assignment_id", assignment.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingConstructionError) throw existingConstructionError;

        let constructionId: string;

        const routesData = effectiveRoutes
          .filter((r) => r.koi || r.fyraKoi)
          .map((r) => ({ label: r.label, koi: parseFloat(r.koi) || 0, fyra_koi: parseFloat(r.fyraKoi) || 0 }));

        // Merge existing photo_counts with new uploads
        const newPhotoCounts: Record<string, number> = {};
        for (const [category, files] of Object.entries(categorizedPhotos)) {
          if (files.length > 0) newPhotoCounts[category] = files.length;
        }
        const mergedPhotoCounts = { ...(existingConstruction?.photo_counts as Record<string, number> || {}), ...existingPhotoCounts };
        for (const [key, count] of Object.entries(newPhotoCounts)) {
          mergedPhotoCounts[key] = (mergedPhotoCounts[key] || 0) + count;
        }

        const constructionPayload = {
          sr_id: assignment.sr_id,
          assignment_id: assignment.id,
          ses_id: sesId.trim() || null,
          ak: ak.trim() || null,
          cab: cab.trim() || assignment.cab || null,
          floors: parseInt(floors) || 0,
          revenue: totalRevenue,
          material_cost: totalMaterialCost,
          status: "in_progress",
          routing_type: routingType.trim() || null,
          pending_note: pendingNote.trim() || null,
          routes: routesData.length > 0 ? routesData : null,
          organization_id: organizationId,
          photo_counts: mergedPhotoCounts,
          koi_type_cab_bep: koiTypeCabBep,
          koi_type_cab_bcp: koiTypeCabBcp,
          vertical_infra: verticalInfra,
          bep_placement_floor: bepPlacementFloor,
          vertical_infra_type: verticalInfraType,
          building_type: buildingType,
          asbuilt_section6: { ...section6, ball_marker_bep: ballMarkerBep, bcp_ball_marker: ballMarkerBcp },
          // 3-Phase workflow: mark this phase as in-progress while saving in crew mode
          ...(phase === 1 && { phase1_status: "in_progress" }),
          ...(phase === 2 && { phase2_status: "in_progress" }),
          ...(phase === 3 && { phase3_status: "in_progress" }),
        } as any;



        if (existingConstruction) {
          const { error } = await supabase
            .from("constructions")
            .update(constructionPayload)
            .eq("id", existingConstruction.id);
          if (error) throw error;
          constructionId = existingConstruction.id;
        } else {
          const { data, error } = await supabase
            .from("constructions")
            .insert(constructionPayload)
            .select("id")
            .single();
          if (error) throw error;
          constructionId = data.id;
        }

        // Compute stock deltas BEFORE replacing saved materials
        const { data: previousMaterialsRows, error: previousMaterialsError } = await supabase
          .from("construction_materials")
          .select("material_id, quantity, source")
          .eq("construction_id", constructionId);
        if (previousMaterialsError) throw previousMaterialsError;
        const materialDeltas = calculateMaterialDeltas(previousMaterialsRows || [], materialItems);

        // Delete existing works & materials, then re-insert (upsert pattern)
        const { error: deleteWorksError } = await supabase
          .from("construction_works")
          .delete()
          .eq("construction_id", constructionId);
        if (deleteWorksError) throw deleteWorksError;

        const { error: deleteMaterialsError } = await supabase
          .from("construction_materials")
          .delete()
          .eq("construction_id", constructionId);
        if (deleteMaterialsError) throw deleteMaterialsError;

        // Insert works — αν κάποιο item προέρχεται από ote_articles χωρίς αντίστοιχο
        // work_pricing, κάνουμε auto-upsert στο work_pricing για συμβατότητα.
        if (workItems.length > 0) {
          const itemsToSync = workItems.filter((w) => w.work_pricing_id.startsWith("ote:"));
          const codeToRealId = new Map<string, string>();

          if (itemsToSync.length > 0) {
            // Upsert όλα τα νέα ote_articles στο work_pricing με βάση τον code
            const { data: upserted, error: upsertErr } = await supabase
              .from("work_pricing")
              .upsert(
                itemsToSync.map((w) => ({
                  code: w.code,
                  description: w.description,
                  unit: w.unit,
                  unit_price: w.unit_price,
                  organization_id: organizationId,
                })),
                { onConflict: "code,organization_id", ignoreDuplicates: false },
              )
              .select("id, code");
            if (upsertErr) throw upsertErr;
            (upserted || []).forEach((r: any) => codeToRealId.set(r.code, r.id));

            // Fallback: όσα δεν επέστρεψαν, ξαναψάξε για να πάρεις το id
            const missingCodes = itemsToSync
              .filter((w) => !codeToRealId.has(w.code))
              .map((w) => w.code);
            if (missingCodes.length > 0) {
              const { data: refetched } = await supabase
                .from("work_pricing")
                .select("id, code")
                .in("code", missingCodes);
              (refetched || []).forEach((r: any) => codeToRealId.set(r.code, r.id));
            }
          }

          const { error: worksError } = await supabase.from("construction_works").insert(
            workItems.map((w) => ({
              construction_id: constructionId,
              work_pricing_id: w.work_pricing_id.startsWith("ote:")
                ? codeToRealId.get(w.code) || w.work_pricing_id
                : w.work_pricing_id,
              quantity: w.quantity,
              unit_price: w.unit_price,
              subtotal: w.unit_price * w.quantity,
              organization_id: organizationId,
            })),
          );
          if (worksError) throw worksError;
        }

        // Insert materials
        if (materialItems.length > 0) {
          const { error: matsError } = await supabase.from("construction_materials").insert(
            materialItems.map((m) => ({
              construction_id: constructionId,
              material_id: m.material_id,
              quantity: m.quantity,
              source: m.source,
              organization_id: organizationId,
            }))
          );
          if (matsError) throw matsError;
        }

        // Sync stock changes for both OTE & DELTANETWORK based on quantity deltas
        if (materialDeltas.length > 0) {
          setSubmitProgress("Ενημέρωση αποθέματος...");
          const { error: deductErr } = await supabase.functions.invoke("deduct-stock", {
            body: {
              construction_id: constructionId,
              material_deltas: materialDeltas,
            },
          });
          if (deductErr) {
            console.error("Stock deduction error:", deductErr);
            toast.warning("Αποθηκεύτηκαν τα υλικά αλλά απέτυχε η ενημέρωση αποθήκης. Ελέγξτε το Admin Panel.");
          }
        }

        // 3-Phase technician mode: deduct from technician's personal warehouse + log history
        if (phase && user && materialItems.length > 0 && organizationId) {
          for (const item of materialItems) {
            const currentQty = techInventoryMap.get(item.material_id) || 0;
            const newQty = currentQty - item.quantity;
            await supabase
              .from("technician_inventory" as any)
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq("technician_id", user.id)
              .eq("material_id", item.material_id);
            await supabase.from("technician_inventory_history" as any).insert({
              technician_id: user.id,
              material_id: item.material_id,
              change_amount: -item.quantity,
              reason: "SR χρέωση",
              construction_sr_id: assignment.sr_id,
              organization_id: organizationId,
              changed_by: user.id,
            });
          }
          queryClient.invalidateQueries({ queryKey: ["tech-inventory", user.id] });
          queryClient.invalidateQueries({ queryKey: ["technician-inventory", user.id] });
          queryClient.invalidateQueries({ queryKey: ["technician-inventory-history", user.id] });
        }

        // Upload photos
        const safeSrId = assignment.sr_id.replace(/[^a-zA-Z0-9_-]/g, "_");
        const allCategoryPhotos = Object.entries(categorizedPhotos).filter(([_, files]) => files.length > 0);
        const totalPhotoCount = allCategoryPhotos.reduce((sum, [_, files]) => sum + files.length, 0);

        if (totalPhotoCount > 0) {
          let uploaded = 0;
          setSubmitProgress(`Ανέβασμα φωτογραφιών (0/${totalPhotoCount})...`);
          for (const [category, files] of allCategoryPhotos) {
            const catDef = ALL_PHOTO_CATEGORIES.find((c) => c.key === category);
            const folderName = catDef?.storageName || category.replace(/[^a-zA-Z0-9_-]/g, "_");
            for (let i = 0; i < files.length; i++) {
              const photo = files[i];
              const ext = photo.name.split(".").pop() || "jpg";
              const storagePath = `constructions/${safeSrId}/${constructionId}/${folderName}/${Date.now()}_${i + 1}.${ext}`;
              const { error: uploadErr } = await supabase.storage
                .from("photos")
                .upload(storagePath, photo, { upsert: true });
              if (uploadErr) console.error(`Photo upload error ${folderName}/${i}:`, uploadErr);
              else if (i === 0) await uploadPhotoDrive(assignment.sr_id, catDef?.label || category, storagePath);
              else uploadPhotoDrive(assignment.sr_id, catDef?.label || category, storagePath);
              uploaded++;
              setSubmitProgress(`Ανέβασμα φωτογραφιών (${uploaded}/${totalPhotoCount})...`);
            }
          }
        }

        // Upload OTDR files
        const allOtdrFiles = Object.entries(otdrFiles).filter(([_, files]) => files.length > 0);
        const totalOtdrCount = allOtdrFiles.reduce((sum, [_, files]) => sum + files.length, 0);
        if (totalOtdrCount > 0) {
          let otdrUploaded = 0;
          setSubmitProgress(`Ανέβασμα OTDR μετρήσεων (0/${totalOtdrCount})...`);
          for (const [category, files] of allOtdrFiles) {
            const catDef = OTDR_CATEGORIES.find((c) => c.key === category);
            const folderName = catDef?.storageName || `OTDR_${category.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
            for (let i = 0; i < files.length; i++) {
              const pdf = files[i];
              const storagePath = `constructions/${safeSrId}/${constructionId}/${folderName}/${pdf.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
              const { error: uploadErr } = await supabase.storage
                .from("photos")
                .upload(storagePath, pdf, { upsert: true, contentType: "application/pdf" });
              if (uploadErr) console.error(`OTDR upload error ${folderName}/${i}:`, uploadErr);
              else if (i === 0) await uploadPhotoDrive(assignment.sr_id, `OTDR_${catDef?.label || category}`, storagePath, pdf.name);
              else uploadPhotoDrive(assignment.sr_id, `OTDR_${catDef?.label || category}`, storagePath, pdf.name);
              otdrUploaded++;
              setSubmitProgress(`Ανέβασμα OTDR μετρήσεων (${otdrUploaded}/${totalOtdrCount})...`);
            }
          }
        }

        // Update crew assignments status
        if (crewAssignmentIds?.length) {
          for (const caId of crewAssignmentIds) {
            await supabase
              .from("sr_crew_assignments" as any)
              .update({
                status: "saved",
                saved_at: new Date().toISOString(),
                saved_by: user?.id,
              })
              .eq("id", caId);
          }
        }

        toast.success("✅ Αποθηκεύτηκε!", {
          description: `${totalPhotos} φωτο · ${workItems.length} εργασίες · ${materialItems.length} υλικά`,
          duration: 3000,
        });
        queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
        queryClient.invalidateQueries({ queryKey: ["constructions"] });
        queryClient.invalidateQueries({ queryKey: ["existing_construction", assignment.id] });
        queryClient.invalidateQueries({ queryKey: ["existing_construction_works"] });
        queryClient.invalidateQueries({ queryKey: ["existing_construction_materials"] });
        queryClient.invalidateQueries({ queryKey: ["sr_crew_assignments_mine"] });
        queryClient.invalidateQueries({ queryKey: ["sr_crew_assignments"] });

        // If this is a completion request, check if ALL crew assignments are done
        if (completingRef.current) {
          setSubmitProgress("Έλεγχος ομάδας...");
          // Check all crew assignments for this assignment
          const { data: allCrewAssignments } = await supabase
            .from("sr_crew_assignments" as any)
            .select("id, status, technician_id")
            .eq("assignment_id", assignment.id);

          const allSaved = (allCrewAssignments || []).every((ca: any) => ca.status === "saved");

          if (!allSaved) {
            const pending = (allCrewAssignments || []).filter((ca: any) => ca.status !== "saved");
            toast.warning(`Εκκρεμούν ακόμα ${pending.length} εργασίες από άλλους τεχνικούς. Η δουλειά σου αποθηκεύτηκε.`);
            setSubmitted(true);
            setTimeout(() => onComplete(), 1500);
            return;
          }

          // ALL are saved — trigger full completion flow
          setSubmitProgress("Ολοκλήρωση κατασκευής...");

          // Update construction status to completed
          await supabase
            .from("constructions")
            .update({ status: "completed" })
            .eq("id", constructionId);

          // Calculate payment amount from works
          const { data: allWorks } = await supabase
            .from("construction_works")
            .select("quantity, unit_price")
            .eq("construction_id", constructionId);
          const paymentAmount = (allWorks || []).reduce((sum: number, w: any) => sum + (w.quantity * w.unit_price), 0);

          // Update assignment status to submitted
          await supabase
            .from("assignments")
            .update({
              status: "submitted",
              cab: cab.trim() || assignment.cab || null,
              payment_amount: paymentAmount,
              submitted_at: new Date().toISOString(),
            } as any)
            .eq("id", assignment.id);

          // Move SR folder to "ΠΑΡΑΔΩΤΕΑ" in Drive (fire-and-forget)
          supabase.functions.invoke("move-sr-folder", {
            body: { sr_id: assignment.sr_id, target_folder: "ΠΑΡΑΔΩΤΕΑ", organization_id: assignment.organization_id },
          }).catch(console.error);

          // Collect ALL photo paths from storage for this construction
          setSubmitProgress("Συλλογή αρχείων...");
          const safeSrIdAll = assignment.sr_id.replace(/[^a-zA-Z0-9_-]/g, "_");
          const storagePrefix = `constructions/${safeSrIdAll}/${constructionId}`;
          const allPhotoPaths: string[] = [];
          const allOtdrPaths: string[] = [];

          const { data: storageFolders } = await supabase.storage.from("photos").list(storagePrefix);
          if (storageFolders) {
            for (const folder of storageFolders) {
              if (folder.id === null) {
                // It's a subfolder
                const { data: subFiles } = await supabase.storage.from("photos").list(`${storagePrefix}/${folder.name}`);
                if (subFiles) {
                  for (const sf of subFiles) {
                    if (sf.id !== null) {
                      const path = `${storagePrefix}/${folder.name}/${sf.name}`;
                      if (folder.name.startsWith("OTDR_")) {
                        allOtdrPaths.push(path);
                      } else {
                        allPhotoPaths.push(path);
                      }
                    }
                  }
                }
              }
            }
          }

          // Generate docs & upload to Drive
          setSubmitProgress("Δημιουργία εγγράφων & upload στο Drive...");
          let docsResult: any = null;
          try {
            const { data, error: docsErr } = await supabase.functions.invoke(
              "generate-construction-docs",
              { body: { construction_id: constructionId, photo_paths: allPhotoPaths, otdr_paths: allOtdrPaths } }
            );
            docsResult = data;
            if (docsErr) {
              console.error("Docs generation error:", docsErr);
              toast.error("Τα έγγραφα δεν δημιουργήθηκαν, αλλά η κατασκευή ολοκληρώθηκε");
            } else if (docsResult?.drive_uploaded) {
              toast.success(`Αρχεία ανέβηκαν στο Drive (${docsResult.files?.length || 0} αρχεία)`);
            }
          } catch (docsErr: any) {
            console.error("Docs error:", docsErr);
          }

          // Send completion email
          setSubmitProgress("Αποστολή email ολοκλήρωσης...");
          try {
            const spreadsheetFile = docsResult?.files?.find((f: any) => f.type === "spreadsheet");
            const { error: emailErr } = await supabase.functions.invoke(
              "send-completion-email",
              {
                body: {
                  construction_id: constructionId,
                  sr_id: assignment.sr_id,
                  area: assignment.area,
                  customer_name: assignment.customer_name,
                  address: assignment.address,
                  cab: cab.trim() || assignment.cab,
                  spreadsheet_id: spreadsheetFile?.id || null,
                  photo_paths: allPhotoPaths,
                  otdr_paths: allOtdrPaths,
                  drive_folder_url: docsResult?.sr_folder?.url || assignment.drive_folder_url,
                },
              }
            );
            if (emailErr) {
              console.error("Completion email error:", emailErr);
            } else {
              toast.success("Email ολοκλήρωσης εστάλη");
            }
          } catch (emailErr: any) {
            console.error("Completion email error:", emailErr);
          }

          toast.success("🎉 Η κατασκευή ολοκληρώθηκε πλήρως!");
        }

        setSubmitted(true);
        setTimeout(() => onComplete(), completingRef.current ? 2000 : 1500);
      } catch (err: any) {
        console.error(err);
        toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
      } finally {
        setSubmitting(false);
        setCompleting(false);
        completingRef.current = false;
        setSubmitProgress("");
      }
      return;
    }

    // ═══════ OFFLINE BRANCH ═══════
    if (!isOnline()) {
      try {
        setSubmitting(true);
        setSubmitProgress("Αποθήκευση τοπικά...");

        // Convert all photos to OfflineFiles
        const offlinePhotos: Record<string, import("@/lib/offlineQueue").OfflineFile[]> = {};
        for (const [category, files] of Object.entries(categorizedPhotos)) {
          if (files.length > 0) {
            offlinePhotos[category] = await Promise.all(files.map(fileToOfflineFile));
          }
        }

        const offlineOtdr: Record<string, import("@/lib/offlineQueue").OfflineFile[]> = {};
        for (const [category, files] of Object.entries(otdrFiles)) {
          if (files.length > 0) {
            offlineOtdr[category] = await Promise.all(files.map(fileToOfflineFile));
          }
        }

        // Build category maps for storage paths
        const photoCategoryMap: Record<string, string> = {};
        for (const cat of ALL_PHOTO_CATEGORIES) {
          photoCategoryMap[cat.key] = cat.storageName;
        }
        const otdrCategoryMap: Record<string, string> = {};
        for (const cat of OTDR_CATEGORIES) {
          otdrCategoryMap[cat.key] = cat.storageName;
        }

        const payload: OfflineConstructionPayload = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          assignmentId: assignment.id,
          srId: assignment.sr_id,
          organizationId: organizationId || null,
          userId: user?.id || "",
          sesId,
          ak,
          cab,
          floors,
          routingType,
          pendingNote,
          routes,
          workItems,
          materialItems,
          totalRevenue,
          totalMaterialCost,
          categorizedPhotos: offlinePhotos,
          otdrFiles: offlineOtdr,
          photoCategoryMap,
          otdrCategoryMap,
        };

        await enqueueConstruction(payload);
        toast.success("Αποθηκεύτηκε τοπικά — θα συγχρονιστεί αυτόματα όταν επανέλθει η σύνδεση");
        setSubmitted(true);
        setTimeout(() => onComplete(), 1500);
      } catch (err: any) {
        console.error("Offline save error:", err);
        toast.error("Σφάλμα τοπικής αποθήκευσης: " + (err.message || ""));
      } finally {
        setSubmitting(false);
        setSubmitProgress("");
      }
      return;
    }

    // ═══════ ONLINE BRANCH ═══════
    setSubmitting(true);
    try {
      setSubmitProgress("Καταχώρηση κατασκευής...");

      const isCompleting = completingRef.current;

      const routesData = effectiveRoutes
        .filter((r) => r.koi || r.fyraKoi)
        .map((r) => ({ label: r.label, koi: parseFloat(r.koi) || 0, fyra_koi: parseFloat(r.fyraKoi) || 0 }));

      const { data: existingConstructionRow, error: existingConstructionError } = await supabase
        .from("constructions")
        .select("id, photo_counts")
        .eq("assignment_id", assignment.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingConstructionError) throw existingConstructionError;

      // Merge existing photo_counts with new uploads
      const newPhotoCounts: Record<string, number> = {};
      for (const [category, files] of Object.entries(categorizedPhotos)) {
        if (files.length > 0) newPhotoCounts[category] = files.length;
      }
      const mergedPhotoCounts = { ...(existingConstructionRow as any)?.photo_counts as Record<string, number> || {}, ...existingPhotoCounts };
      for (const [key, count] of Object.entries(newPhotoCounts)) {
        mergedPhotoCounts[key] = (mergedPhotoCounts[key] || 0) + count;
      }

      const constructionPayload = {
        sr_id: assignment.sr_id,
        assignment_id: assignment.id,
        ses_id: sesId.trim() || null,
        ak: ak.trim() || null,
        cab: cab.trim(),
        floors: parseInt(floors) || 0,
        revenue: totalRevenue,
        material_cost: totalMaterialCost,
        status: isCompleting ? "completed" : "in_progress",
        routing_type: routingType.trim() || null,
        pending_note: pendingNote.trim() || null,
        routes: routesData.length > 0 ? routesData : null,
        organization_id: organizationId,
        photo_counts: mergedPhotoCounts,
        koi_type_cab_bep: koiTypeCabBep,
        koi_type_cab_bcp: koiTypeCabBcp,
        vertical_infra: verticalInfra,
        bep_placement_floor: bepPlacementFloor,
        vertical_infra_type: verticalInfraType,
        building_type: buildingType,
        asbuilt_section6: { ...section6, ball_marker_bep: ballMarkerBep, bcp_ball_marker: ballMarkerBcp },
        // 3-Phase workflow: mark this phase's status (in_progress on save, completed when finishing)
        ...(phase === 1 && (isCompleting
          ? { phase1_status: "completed", phase1_completed_at: new Date().toISOString() }
          : { phase1_status: "in_progress" })),
        ...(phase === 2 && (isCompleting
          ? { phase2_status: "completed", phase2_completed_at: new Date().toISOString() }
          : { phase2_status: "in_progress" })),
        ...(phase === 3 && (isCompleting
          ? { phase3_status: "completed", phase3_completed_at: new Date().toISOString() }
          : { phase3_status: "in_progress" })),
      } as any;


      let constructionId: string;
      if (existingConstructionRow) {
        const { error: updateError } = await supabase
          .from("constructions")
          .update(constructionPayload)
          .eq("id", existingConstructionRow.id);
        if (updateError) throw updateError;
        constructionId = existingConstructionRow.id;
      } else {
        const { data: insertedConstruction, error: insertError } = await supabase
          .from("constructions")
          .insert(constructionPayload)
          .select("id")
          .single();
        if (insertError) throw insertError;
        constructionId = insertedConstruction.id;
      }

      // Compute stock deltas BEFORE replacing saved materials
      const { data: previousMaterialsRows, error: previousMaterialsError } = await supabase
        .from("construction_materials")
        .select("material_id, quantity, source")
        .eq("construction_id", constructionId);
      if (previousMaterialsError) throw previousMaterialsError;
      const materialDeltas = calculateMaterialDeltas(previousMaterialsRows || [], materialItems);

      // Delete existing works & materials, then re-insert
      const { error: deleteWorksError } = await supabase
        .from("construction_works")
        .delete()
        .eq("construction_id", constructionId);
      if (deleteWorksError) throw deleteWorksError;

      const { error: deleteMaterialsError } = await supabase
        .from("construction_materials")
        .delete()
        .eq("construction_id", constructionId);
      if (deleteMaterialsError) throw deleteMaterialsError;

      if (workItems.length > 0) {
        // Auto-upsert νέα ote_articles στο work_pricing για συμβατότητα με FK
        const itemsToSync = workItems.filter((w) => w.work_pricing_id.startsWith("ote:"));
        const codeToRealId = new Map<string, string>();

        if (itemsToSync.length > 0) {
          const { data: upserted, error: upsertErr } = await supabase
            .from("work_pricing")
            .upsert(
              itemsToSync.map((w) => ({
                code: w.code,
                description: w.description,
                unit: w.unit,
                unit_price: w.unit_price,
                organization_id: organizationId,
              })),
              { onConflict: "code,organization_id", ignoreDuplicates: false },
            )
            .select("id, code");
          if (upsertErr) throw upsertErr;
          (upserted || []).forEach((r: any) => codeToRealId.set(r.code, r.id));

          const missingCodes = itemsToSync
            .filter((w) => !codeToRealId.has(w.code))
            .map((w) => w.code);
          if (missingCodes.length > 0) {
            const { data: refetched } = await supabase
              .from("work_pricing")
              .select("id, code")
              .in("code", missingCodes);
            (refetched || []).forEach((r: any) => codeToRealId.set(r.code, r.id));
          }
        }

        const { error: worksError } = await supabase.from("construction_works").insert(
          workItems.map((w) => ({
            construction_id: constructionId,
            work_pricing_id: w.work_pricing_id.startsWith("ote:")
              ? codeToRealId.get(w.code) || w.work_pricing_id
              : w.work_pricing_id,
            quantity: w.quantity,
            unit_price: w.unit_price,
            subtotal: w.unit_price * w.quantity,
            organization_id: organizationId,
          }))
        );
        if (worksError) throw worksError;
      }

      if (materialItems.length > 0) {
        const { error: matsError } = await supabase.from("construction_materials").insert(
          materialItems.map((m) => ({
            construction_id: constructionId,
            material_id: m.material_id,
            quantity: m.quantity,
            source: m.source,
            organization_id: organizationId,
          }))
        );
        if (matsError) throw matsError;
      }

      if (materialDeltas.length > 0) {
        setSubmitProgress("Ενημέρωση αποθέματος...");
        const { error: deductErr } = await supabase.functions.invoke("deduct-stock", {
          body: {
            construction_id: constructionId,
            material_deltas: materialDeltas,
          },
        });
        if (deductErr) {
          console.error("Stock deduction error:", deductErr);
          toast.warning("Αποθηκεύτηκαν τα υλικά αλλά απέτυχε η ενημέρωση αποθήκης. Ελέγξτε το Admin Panel.");
        }
      }

      // 3-Phase technician mode: deduct from technician's personal warehouse + log history
      if (phase && user && materialItems.length > 0 && organizationId) {
        for (const item of materialItems) {
          const currentQty = techInventoryMap.get(item.material_id) || 0;
          const newQty = currentQty - item.quantity;
          await supabase
            .from("technician_inventory" as any)
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq("technician_id", user.id)
            .eq("material_id", item.material_id);
          await supabase.from("technician_inventory_history" as any).insert({
            technician_id: user.id,
            material_id: item.material_id,
            change_amount: -item.quantity,
            reason: "SR χρέωση",
            construction_sr_id: assignment.sr_id,
            organization_id: organizationId,
            changed_by: user.id,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["tech-inventory", user.id] });
        queryClient.invalidateQueries({ queryKey: ["technician-inventory", user.id] });
        queryClient.invalidateQueries({ queryKey: ["technician-inventory-history", user.id] });
      }

      const photoPaths: string[] = [];
      const allCategoryPhotos = Object.entries(categorizedPhotos).filter(([_, files]) => files.length > 0);
      const totalPhotoCount = allCategoryPhotos.reduce((sum, [_, files]) => sum + files.length, 0);
      const safeSrId = assignment.sr_id.replace(/[^a-zA-Z0-9_-]/g, "_");
      
      if (totalPhotoCount > 0) {
        let uploaded = 0;
        setSubmitProgress(`Ανέβασμα φωτογραφιών (0/${totalPhotoCount})...`);
        for (const [category, files] of allCategoryPhotos) {
          // Find the ASCII storageName for this category
          const catDef = ALL_PHOTO_CATEGORIES.find((c) => c.key === category);
          const folderName = catDef?.storageName || category.replace(/[^a-zA-Z0-9_-]/g, "_");
          
          for (let i = 0; i < files.length; i++) {
            const photo = files[i];
            const ext = photo.name.split(".").pop() || "jpg";
            const storagePath = `constructions/${safeSrId}/${constructionId}/${folderName}/${Date.now()}_${i + 1}.${ext}`;
            const { error: uploadErr } = await supabase.storage
              .from("photos")
              .upload(storagePath, photo, { upsert: true });
            if (uploadErr) console.error(`Photo upload error ${folderName}/${i}:`, uploadErr);
            else {
              photoPaths.push(storagePath);
              if (i === 0) await uploadPhotoDrive(assignment.sr_id, catDef?.label || category, storagePath);
              else uploadPhotoDrive(assignment.sr_id, catDef?.label || category, storagePath);
            }
            uploaded++;
            setSubmitProgress(`Ανέβασμα φωτογραφιών (${uploaded}/${totalPhotoCount})...`);
          }
        }
      }

      // Upload OTDR PDF files
      const otdrPaths: string[] = [];
      const allOtdrFiles = Object.entries(otdrFiles).filter(([_, files]) => files.length > 0);
      const totalOtdrCount = allOtdrFiles.reduce((sum, [_, files]) => sum + files.length, 0);
      
      if (totalOtdrCount > 0) {
        let otdrUploaded = 0;
        setSubmitProgress(`Ανέβασμα OTDR μετρήσεων (0/${totalOtdrCount})...`);
        for (const [category, files] of allOtdrFiles) {
          const catDef = OTDR_CATEGORIES.find((c) => c.key === category);
          const folderName = catDef?.storageName || `OTDR_${category.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
          
          for (let i = 0; i < files.length; i++) {
            const pdf = files[i];
            const storagePath = `constructions/${safeSrId}/${constructionId}/${folderName}/${Date.now()}_${pdf.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
            const { error: uploadErr } = await supabase.storage
              .from("photos")
              .upload(storagePath, pdf, { upsert: true, contentType: "application/pdf" });
            if (uploadErr) console.error(`OTDR upload error ${folderName}/${i}:`, uploadErr);
            else {
              otdrPaths.push(storagePath);
              if (i === 0) await uploadPhotoDrive(assignment.sr_id, `OTDR_${catDef?.label || category}`, storagePath, pdf.name);
              else uploadPhotoDrive(assignment.sr_id, `OTDR_${catDef?.label || category}`, storagePath, pdf.name);
            }
            otdrUploaded++;
            setSubmitProgress(`Ανέβασμα OTDR μετρήσεων (${otdrUploaded}/${totalOtdrCount})...`);
          }
        }
      }

      // Only run completion flow (docs, email, status change) when completing
      if (isCompleting) {
        // Calculate payment amount from construction works
        const paymentAmount = workItems.reduce((sum, w) => sum + (w.quantity * w.unit_price), 0);

        const { error: assignError } = await supabase
          .from("assignments")
          .update({ 
            status: "submitted", 
            cab: cab.trim(),
            payment_amount: paymentAmount,
            submitted_at: new Date().toISOString(),
          } as any)
          .eq("id", assignment.id);
        if (assignError) console.error("Assignment update error:", assignError);

        // Move SR folder to "ΠΑΡΑΔΩΤΕΑ" in Drive (fire-and-forget)
        supabase.functions.invoke("move-sr-folder", {
          body: { sr_id: assignment.sr_id, target_folder: "ΠΑΡΑΔΩΤΕΑ", organization_id: assignment.organization_id },
        }).catch(console.error);

        setSubmitProgress("Δημιουργία εγγράφων & upload στο Drive...");
        let docsResult: any = null;
        try {
          const { data, error: docsErr } = await supabase.functions.invoke(
            "generate-construction-docs",
            { body: { construction_id: constructionId, photo_paths: photoPaths, otdr_paths: otdrPaths } }
          );
          docsResult = data;
          if (docsErr) {
            console.error("Docs generation error:", docsErr);
            toast.error("Τα έγγραφα δεν δημιουργήθηκαν, αλλά η κατασκευή καταχωρήθηκε");
          } else if (docsResult?.drive_uploaded) {
            toast.success(`Αρχεία ανέβηκαν στο Drive (${docsResult.files?.length || 0} αρχεία)`);
          }
        } catch (docsErr: any) {
          console.error("Docs error:", docsErr);
        }

        // Send completion email with ZIP (spreadsheet + photos)
        setSubmitProgress("Αποστολή email ολοκλήρωσης...");
        try {
          const spreadsheetFile = docsResult?.files?.find((f: any) => f.type === "spreadsheet");
          const { error: emailErr } = await supabase.functions.invoke(
            "send-completion-email",
            {
              body: {
                construction_id: constructionId,
                sr_id: assignment.sr_id,
                area: assignment.area,
                customer_name: assignment.customer_name,
                address: assignment.address,
                cab: cab.trim(),
                spreadsheet_id: spreadsheetFile?.id || null,
                photo_paths: photoPaths,
                otdr_paths: otdrPaths,
                drive_folder_url: docsResult?.sr_folder?.url || assignment.drive_folder_url,
              },
            }
          );
          if (emailErr) {
            console.error("Completion email error:", emailErr);
          } else {
            toast.success("Email ολοκλήρωσης εστάλη");
          }
        } catch (emailErr: any) {
          console.error("Completion email error:", emailErr);
        }

        toast.success("🎉 Η κατασκευή ολοκληρώθηκε!");
      } else {
        // Just saving
        toast.success("✅ Αποθηκεύτηκε!", {
          description: `${totalPhotos} φωτο · ${workItems.length} εργασίες · ${materialItems.length} υλικά`,
          duration: 3000,
        });
      }

      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["constructions"] });
      queryClient.invalidateQueries({ queryKey: ["existing_construction", assignment.id] });
      queryClient.invalidateQueries({ queryKey: ["existing_construction_works"] });
      queryClient.invalidateQueries({ queryKey: ["existing_construction_materials"] });
      setTimeout(() => onComplete(), isCompleting ? 2000 : 1500);
    } catch (err: any) {
      console.error(err);
      toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setSubmitting(false);
      setCompleting(false);
      completingRef.current = false;
      setSubmitProgress("");
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
        <h2 className="text-lg font-bold text-foreground">Η κατασκευή καταχωρήθηκε!</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Τα έγγραφα δημιουργούνται και ανεβαίνουν στο Drive...
        </p>
      </div>
    );
  }

  // Count selected items per category
  const selectedWorkCount = (prefix: string) => {
    const catWorks = worksByCategory[prefix] || [];
    return catWorks.filter((w) => isWorkSelected(w)).length;
  };

  const selectedMaterialCount = (source: string, catLabel: string) => {
    const catMats = materialsByCategory[source]?.[catLabel] || [];
    return catMats.filter((m) => isMaterialSelected(m.id)).length;
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <HardHat className="h-5 w-5" />
          {isCrewMode ? "Κατασκευή – Η Δουλειά μου" : "Φόρμα Κατασκευής"}
        </h2>
        <button
          type="button"
          onClick={() => {
            const allIds = ["technical", "routes", "works", "materials", "photos", "otdr"];
            setOpenSections(openSections.length === allIds.length ? [] : allIds);
          }}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {openSections.length === 6 ? "Σύμπτυξη όλων ▲" : "Ανάπτυξη όλων ▼"}
        </button>
      </div>

      {/* Phase Banner — visible only when current user is bound to a specific phase */}
      {phase && (
        <div
          className={`rounded-xl p-4 border-2 flex flex-wrap items-center gap-3 ${
            phase === 1
              ? "border-amber-500/30 bg-amber-50 dark:bg-amber-950/20"
              : phase === 2
              ? "border-blue-500/30 bg-blue-50 dark:bg-blue-950/20"
              : "border-green-500/30 bg-green-50 dark:bg-green-950/20"
          }`}
        >
          <span className="text-3xl">{PHASE_INFO[phase].icon}</span>
          <div className="flex-1 min-w-[140px]">
            <p className="font-bold text-sm">{PHASE_INFO[phase].title}</p>
            <p className="text-xs text-muted-foreground">{PHASE_INFO[phase].sub}</p>
          </div>
          {phase === 3 && assignment?.sr_id && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              asChild
              className="gap-1.5 border-green-500/40 hover:bg-green-500/10 text-green-700 dark:text-green-400"
            >
              <a
                href={`/labels/${encodeURIComponent(assignment.sr_id)}`}
                target="_blank"
                rel="noreferrer"
              >
                🏷️ Labels Printer
              </a>
            </Button>
          )}
          <div
            className={`h-3 w-3 rounded-full ${
              (phaseStatus as any)?.[`phase${phase}_status`] === "completed"
                ? "bg-green-500"
                : (phaseStatus as any)?.[`phase${phase}_status`] === "in_progress"
                ? "bg-amber-500 animate-pulse"
                : "bg-muted-foreground/30"
            }`}
          />
        </div>
      )}

      {/* Phase 3 lock removed — phases are independent */}

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Πρόοδος</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Phase Status Editor — visible to Responsible (technician_id of SR) or Admin in full form */}
      {!phase && !isCrewMode && existingConstruction?.id && (
        <Card className="p-5 space-y-3.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <CheckCircle className="h-3.5 w-3.5" />
            Πρόοδος Φάσεων (Υπεύθυνος)
          </h3>
          {([1, 2, 3] as const).map((ph) => {
            const phaseStatusVal = (existingConstruction as any)[`phase${ph}_status`] || "pending";
            const completedAt = (existingConstruction as any)[`phase${ph}_completed_at`];
            const info = PHASE_INFO[ph];
            return (
              <div key={ph} className="flex items-center gap-3">
                <span className="text-lg shrink-0">{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {info.title.replace("Φάση ", "Φ").replace(" — ", " — ")}
                  </p>
                  {completedAt && phaseStatusVal === "completed" && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(completedAt).toLocaleDateString("el-GR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
                <Select
                  value={phaseStatusVal}
                  onValueChange={async (val) => {
                    try {
                      const phaseField = `phase${ph}_status`;
                      const phaseDate = `phase${ph}_completed_at`;
                      const { error } = await supabase
                        .from("constructions")
                        .update({
                          [phaseField]: val,
                          [phaseDate]: val === "completed" ? new Date().toISOString() : null,
                        } as any)
                        .eq("id", existingConstruction.id);
                      if (error) throw error;
                      toast.success(
                        `Φάση ${ph} → ${
                          val === "completed"
                            ? "✅ Ολοκληρώθηκε"
                            : val === "in_progress"
                            ? "🔄 Σε εξέλιξη"
                            : "⏳ Εκκρεμεί"
                        }`,
                      );
                      queryClient.invalidateQueries({ queryKey: ["existing_construction", assignment.id] });
                      queryClient.invalidateQueries({ queryKey: ["constructions"] });
                      queryClient.invalidateQueries({ queryKey: ["phase-statuses"] });
                      queryClient.invalidateQueries({ queryKey: ["phase-status"] });
                      queryClient.invalidateQueries({ queryKey: ["construction-phases"] });
                    } catch (err: any) {
                      toast.error(err.message);
                    }
                  }}
                >
                  <SelectTrigger className="w-[150px] h-8 text-xs shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">⏳ Εκκρεμεί</SelectItem>
                    <SelectItem value="in_progress">🔄 Σε εξέλιξη</SelectItem>
                    <SelectItem value="completed">✅ Ολοκληρώθηκε</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </Card>
      )}

      {/* Technical Details */}
      {!isCrewMode && (!phase || phase === 1 || phase === 2) && <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("technical")}
          className="w-full flex items-center justify-between p-5 hover:bg-muted/40 transition-colors rounded-2xl"
        >
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-2 pointer-events-none"><span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            Τεχνικά Στοιχεία
            {(sesId || cab) && (
              <Badge variant="secondary" className="text-[10px] ml-1">
                {sesId || cab}
              </Badge>
            )}
          </Label>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openSections.includes("technical") ? "rotate-180" : ""}`} />
        </button>
        {openSections.includes("technical") && (
        <div className="px-5 pb-5 space-y-3.5 border-t border-border/40 pt-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">SES ID</Label>
            <Input value={sesId} onChange={(e) => setSesId(e.target.value)} placeholder="SES..." className="text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Α/Κ</Label>
            <Input value={ak} onChange={(e) => setAk(e.target.value)} placeholder="Α/Κ..." className="text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Καμπίνα (CAB) <span className="text-destructive">*</span></Label>
            <Input value={cab} onChange={(e) => setCab(e.target.value)} placeholder="π.χ. G151" className="text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Όροφοι</Label>
            <Input value={floors} onChange={(e) => setFloors(e.target.value)} type="number" min="0" className="text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Είδος Όδευσης</Label>
            <select
              value={routingType}
              onChange={(e) => setRoutingType(e.target.value)}
              className="w-full mt-1 text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground"
            >
              <option value="">— Επιλέξτε —</option>
              <option value="ΥΠΟΓΕΙΑ">ΥΠΟΓΕΙΑ</option>
              <option value="ΕΝΑΕΡΙΑ">ΕΝΑΕΡΙΑ</option>
              <option value="ΜΙΚΤΗ">ΜΙΚΤΗ</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Αναμονή</Label>
            <Input value={pendingNote} onChange={(e) => setPendingNote(e.target.value)} placeholder="π.χ. Β21 σωληνίσκος" className="text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">Όροφος Τοποθέτησης BEP</Label>
            <select
              value={bepPlacementFloor}
              onChange={(e) => setBepPlacementFloor(e.target.value)}
              className="w-full mt-1 text-sm border border-border rounded-md px-2 py-1.5 h-9 bg-background text-foreground"
            >
              <option value="">— Επιλέξτε —</option>
              <option value="ΙΣ">ΙΣ</option>
              {Array.from({ length: Math.max(parseInt(floors) || 0, 0) }, (_, i) => {
                const label = `+${String(i).padStart(2, "0")}`;
                return (
                  <option key={label} value={label}>{label}</option>
                );
              })}
            </select>
          </div>
          <div>
            <Label className="text-xs">Είδος Κάθετης Υποδομής</Label>
            <select
              value={verticalInfraType}
              onChange={(e) => setVerticalInfraType(e.target.value)}
              className="w-full mt-1 text-sm border border-border rounded-md px-2 py-1.5 h-9 bg-background text-foreground"
            >
              <option value="">— Επιλέξτε —</option>
              <option value="ΚΑΓΚΕΛΟ">ΚΑΓΚΕΛΟ</option>
              <option value="ΚΛΙΜΑΚΟΣΤΑΣΙΟ">ΚΛΙΜΑΚΟΣΤΑΣΙΟ</option>
              <option value="ΕΞΩΤΕΡΙΚΑ ΕΠΙΤΟΙΧΙΑ">ΕΞΩΤΕΡΙΚΑ ΕΠΙΤΟΙΧΙΑ</option>
              <option value="ΦΩΤΑΓΩΓΟΣ">ΦΩΤΑΓΩΓΟΣ</option>
              <option value="ΑΛΛΟ">ΑΛΛΟ</option>
            </select>
          </div>
        </div>
        </div>
        )}
      </Card>}

      {/* === Building Type Selector & Earnings Preview — visible to ALL (admin + crew/technicians) === */}
      {buildingTypes && buildingTypes.length > 0 && (
        <Card
          id="building-type-selector"
          className={`p-5 space-y-3 transition-all ${
            (phase === 2 || phase === 3) && !buildingType
              ? "border-amber-500/60 bg-amber-50/40 dark:bg-amber-950/20 ring-2 ring-amber-500/30"
              : ""
          }`}
        >
          <Label className="text-xs flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            Τύπος Κτιρίου <span className="text-destructive">*</span>
            {(phase === 2 || phase === 3) && !buildingType && (
              <span className="ml-auto text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Απαιτείται για ολοκλήρωση
              </span>
            )}
          </Label>

          {/* Editable selector — admins (no phase) and Phase 1/2. Phase 3 = read-only */}
          {(!phase || phase === 1 || phase === 2) ? (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {buildingTypes.map((bt) => {
                const active = buildingType === bt.building_type;
                return (
                  <button
                    key={bt.building_type}
                    type="button"
                    onClick={() => setBuildingType(bt.building_type)}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      active
                        ? "border-primary bg-primary/5 shadow-md scale-[1.03]"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <span className="text-2xl leading-none">{bt.building_icon || "🏢"}</span>
                    <span className={`text-[11px] font-semibold leading-tight text-center ${active ? "text-primary" : "text-foreground"}`}>
                      {bt.building_label}
                    </span>
                    {active && (
                      <span className="absolute -top-1.5 -right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            // Read-only για phase 3
            <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
              <span className="text-xl">{selectedBuilding?.building_icon || "🏢"}</span>
              <span className="text-sm font-semibold text-foreground">
                {selectedBuilding?.building_label || "—"}
              </span>
            </div>
          )}

          {/* Earnings Preview Card — μόνο για Φ2 / Φ3 */}
          {buildingType && phase && (phase === 2 || phase === 3) && currentPhasePrice > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-4 shadow-sm"
            >
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <TrendingUp className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  Θα κερδίσεις για αυτό το SR
                </span>
              </div>
              <div className="mt-1.5 text-3xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
                €{currentPhasePrice.toLocaleString("el-GR")}
              </div>
              <div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
                Μόλις ολοκληρώσεις τη Φάση {phase} αυτού του SR
              </div>
            </motion.div>
          )}
        </Card>
      )}

      {/* GIS: Δομή Κτιρίου */}
      {(!phase || phase === 2 || phase === 3) && gisData && Array.isArray(gisData.floor_details) && (gisData.floor_details as any[]).length > 0 && (
        <Card className="p-5 space-y-3.5 border-primary/15 bg-primary/[0.04]">
          <Label className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            🏢 Δομή Κτιρίου (GIS)
          </Label>
          {/* Metadata badges */}
          <div className="flex flex-wrap gap-1.5">
            {gisData.bep_type && <Badge variant="outline" className="text-[10px]">BEP: {gisData.bep_type}</Badge>}
            {gisData.bmo_type && <Badge variant="outline" className="text-[10px]">BMO: {gisData.bmo_type}</Badge>}
            {gisData.bep_template && <Badge variant="outline" className="text-[10px]">Template: {gisData.bep_template}</Badge>}
            {gisData.area_type && <Badge variant="outline" className="text-[10px]">Περιοχή: {gisData.area_type}</Badge>}
            {gisData.building_id && <Badge variant="outline" className="text-[10px]">Building: {gisData.building_id}</Badge>}
          </div>
          <div className="space-y-1.5">
            {(() => {
              // Override λογικής FB: 1 FB ανά όροφο για όλα τα κτίρια.
              // Εξαίρεση: "Ξενίας Ζαχαριάδη" → 2 FB στο ΗΜ (Ημιόροφος).
              const addr = `${assignment.address || ""} ${(assignment as any).street || ""}`
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
              const isXeniasZachariadi = /XENIAS\s*ZAHARIADI|XENIAS\s*ZACHARIADI/.test(addr);

              return (gisData.floor_details as any[]).map((f: any, idx: number) => {
                const floorLabel = String(f["ΟΡΟΦΟΣ"] ?? "").trim();
                const isHM = /^(\+?ΗΜ|HM)$/i.test(floorLabel) || /ΗΜ/i.test(floorLabel);
                const fbCount = isXeniasZachariadi && isHM ? 2 : 1;

                return (
                  <div key={idx} className="flex items-center justify-between p-2 border border-border rounded-md bg-background text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">Όροφος {floorLabel || "-"}</span>
                      <span className="text-xs text-muted-foreground">
                        {f["ΔΙΑΜΕΡΙΣΜΑΤΑ"] || "0"} διαμ. / {f["ΚΑΤΑΣΤΗΜΑΤΑ"] || "0"} κατ.
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[10px]">FB</Badge>
                        <span className="text-muted-foreground">×{fbCount}</span>
                      </div>
                      {f["FB ΠΕΛΑΤΗ"] && <span className="text-primary font-medium">👤 {f["FB ΠΕΛΑΤΗ"]}</span>}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </Card>
      )}

      {/* GIS: Οδηγίες Κόλλησης ανά Όροφο */}
      {(!phase || phase === 3) && gisData && Array.isArray(gisData.optical_paths) && (gisData.optical_paths as any[]).length > 0 && (
        <Card className="p-5 space-y-3.5 border-accent/20 bg-accent/[0.04]">
          <Label className="text-xs font-bold uppercase tracking-wider text-accent-foreground flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Οδηγίες Κόλλησης — Ανά Όροφο
          </Label>
          {(() => {
            const paths = gisData.optical_paths as any[];

            const normalizeFloorId = (floorId: string | null | undefined) => {
              const raw = String(floorId ?? "").trim().toUpperCase();
              if (!raw) return "";
              if (raw === "0" || raw === "00" || raw === "+0" || raw === "+00") return "+00";
              if (raw === "ΗΜ" || raw === "+ΗΜ" || raw === "HM" || raw === "+HM") return "+ΗΜ";
              if (raw === "-ΗΥ" || raw === "-HY") return "-ΗΥ";
              if (/^[+-]?\d+$/.test(raw)) {
                const value = parseInt(raw, 10);
                return `${value >= 0 ? "+" : "-"}${Math.abs(value).toString().padStart(2, "0")}`;
              }
              return raw;
            };

            const normalizedFloorDetails = ((gisData.floor_details as any[]) || [])
              .map((entry: any) => {
                const row = entry?.raw && typeof entry.raw === "object" ? entry.raw : entry;
                return {
                  floor: normalizeFloorId(row?.floor ?? row?.["floor"] ?? row?.["ΟΡΟΦΟΣ"]),
                  apartments: parseInt(String(row?.apartments ?? row?.["apartments"] ?? row?.["ΔΙΑΜΕΡΙΣΜΑΤΑ"] ?? 0), 10) || 0,
                };
              })
              .filter((row) => row.floor);

            // Parse BMO-FB paths to extract floor info
            const floorMap: Record<string, { floorLabel: string; floorSort: number; bmoPorts: number[]; fbCount: number; customerPath?: string }> = {};

            for (const p of paths) {
              const pathType = (p["OPTICAL PATH TYPE"] || "").toUpperCase();
              const pathStr = p["OPTICAL PATH"] || "";

              if (pathType === "BMO-FB") {
                // Extract BMO port: BMO01_5_ → port 5
                const bmoMatch = pathStr.match(/BMO\d+_(\d+)_/i);
                const bmoPort = bmoMatch ? parseInt(bmoMatch[1], 10) : 0;

                // Extract floor: FB(+ΗΜ), FB(+00), FB(+01), FB(-01)
                const floorMatch = pathStr.match(/FB\(\+?([^)]+)\)/i);
                let floorKey = "unknown";
                let floorLabel = "Άγνωστο";
                let floorSort = 999;

                if (floorMatch) {
                  const raw = floorMatch[1];
                  const normalizedFloor = normalizeFloorId(raw);
                  floorKey = normalizedFloor || raw;
                  if (/ΗΜ|HM/i.test(normalizedFloor)) {
                    floorLabel = "🏢 Ημιυπόγειο (+ΗΜ)";
                    floorSort = -1;
                  } else if (/ΥΠ|YP/i.test(raw) || normalizedFloor === "-ΗΥ") {
                    floorLabel = "🏢 Υπόγειο";
                    floorSort = -2;
                  } else {
                    const num = parseInt(normalizedFloor, 10);
                    if (!isNaN(num)) {
                      if (num === 0) {
                        floorLabel = "🏢 Ισόγειο (+00)";
                        floorSort = 0;
                      } else if (num > 0) {
                        floorLabel = `🏢 ${num}ος Όροφος (${normalizedFloor})`;
                        floorSort = num;
                      } else {
                        floorLabel = `🏢 Υπόγειο (${normalizedFloor})`;
                        floorSort = num;
                      }
                    }
                  }
                }

                if (!floorMap[floorKey]) {
                  floorMap[floorKey] = { floorLabel, floorSort, bmoPorts: [], fbCount: 0 };
                }
                if (bmoPort > 0) floorMap[floorKey].bmoPorts.push(bmoPort);
                floorMap[floorKey].fbCount++;
              }
            }

            // Check BEP-BMO for customer assignment info
            const customerFloor = gisData.customer_floor;

            // Parse CAB-BEP and CAB-BCP paths
            const cabBepPaths = paths.filter(p => (p["OPTICAL PATH TYPE"] || "").toUpperCase() === "CAB-BEP");
            const cabBcpPaths = paths.filter(p => (p["OPTICAL PATH TYPE"] || "").toUpperCase() === "CAB-BCP");
            const bcpBepPaths = paths.filter(p => (p["OPTICAL PATH TYPE"] || "").toUpperCase() === "BCP-BEP");
            const bepPaths = paths.filter(p => (p["OPTICAL PATH TYPE"] || "").toUpperCase() === "BEP");
            const bepBmoPaths = paths.filter(p => (p["OPTICAL PATH TYPE"] || "").toUpperCase() === "BEP-BMO");
            const hasBcp = cabBcpPaths.length > 0 || bcpBepPaths.length > 0;

            // Sort floors
            const sortedFloors = Object.entries(floorMap)
              .sort(([, a], [, b]) => a.floorSort - b.floorSort);

            if (sortedFloors.length === 0 && !cabBepPaths.length && !cabBcpPaths.length && !bcpBepPaths.length && !bepBmoPaths.length) {
              // Fallback: show raw paths grouped by type
              const grouped: Record<string, any[]> = {};
              paths.forEach((p: any) => {
                const type = p["OPTICAL PATH TYPE"] || "Άλλο";
                if (!grouped[type]) grouped[type] = [];
                grouped[type].push(p);
              });
              return Object.entries(grouped).map(([type, items]) => (
                <div key={type} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{type}</Badge>
                    <span className="text-[10px] text-muted-foreground">({items.length})</span>
                  </div>
                  <div className="space-y-0.5">
                    {items.map((p: any, i: number) => (
                      <div key={i} className="font-mono text-[11px] text-foreground px-2 py-1 bg-background border border-border rounded break-all">
                        {p["OPTICAL PATH"] || "-"}
                      </div>
                    ))}
                  </div>
                </div>
              ));
            }

            // Use CAB-BEP or CAB-BCP paths for the first section
            const firstSectionPaths = cabBepPaths.length > 0 ? cabBepPaths : cabBcpPaths;
            const firstSectionTarget = cabBepPaths.length > 0 ? "BEP" : "BCP";

            // Extract CAB section summary
            let cabName = "";
            let bepName = "";
            let bcpName = "";
            const splitterEntries: { fiber: string; sga: string; sgaPort: string; bepPort: string; sb: string }[] = [];
            const backboneFibers: string[] = [];
            for (const p of firstSectionPaths) {
              const path = p["OPTICAL PATH"] || "";
              // Extract cab: G137_...
              const cabMatch = path.match(/^([A-Z]\d+)/i);
              if (cabMatch && !cabName) cabName = cabMatch[1];
               // Extract BEP or BCP name (with or without conduit)
               const bepMatch = path.match(/(BEP\d+(?:\([^)]+\))?)/i);
               if (bepMatch && !bepName) bepName = bepMatch[1];
               const bcpMatch = path.match(/(BCP\d+(?:\([^)]+\))?)/i);
               if (bcpMatch && !bcpName) bcpName = bcpMatch[1];
               // Check if splitter path
               if (/SG[AB]/i.test(path)) {
                 const sgaMatch = path.match(/(SG[AB]\d+\([^)]+\))/i);
                 const sbMatch = path.match(/(SB\d+\([^)]+\))/i);
                 const fiberMatch = path.match(/SG[AB]\d+\([^)]+\)\.\d+_([A-Z]\d+\.\d+)/i);
                 // Extract SGA port number: SGA01(1:8).03 → 03
                 const sgaPortMatch = path.match(/SG[AB]\d+\([^)]+\)\.(\d+)/i);
                 // Extract BEP/BCP port
                 const bepPortMatch = path.match(/(?:BEP|BCP)\d+(?:\([^)]+\))?_(\d+[a-z]?)/i);
                splitterEntries.push({
                  fiber: fiberMatch ? fiberMatch[1] : "",
                  sga: sgaMatch ? sgaMatch[1] : "",
                  sgaPort: sgaPortMatch ? sgaPortMatch[1] : "",
                  bepPort: bepPortMatch ? bepPortMatch[1] : "",
                  sb: sbMatch ? sbMatch[1] : "",
                });
              } else {
                // Extract simplified fiber ID: G137_C1.14_BEP01_01b → C1.14
                const fiberIdMatch = path.match(/^[A-Z]\d+_([A-Z]\d+\.\d+)/i);
                if (fiberIdMatch) {
                  backboneFibers.push(fiberIdMatch[1]);
                } else {
                  const underscoreIdx = path.indexOf("_");
                  backboneFibers.push(underscoreIdx >= 0 ? path.slice(underscoreIdx + 1) : path);
                }
              }
            }

            // If bepName not set from first section, try BCP-BEP or BEP-BMO paths
            if (!bepName) {
              for (const p of [...bcpBepPaths, ...bepBmoPaths]) {
                const m = (p["OPTICAL PATH"] || "").match(/(BEP\d+(?:\([^)]+\))?)/i);
                if (m) { bepName = m[1]; break; }
              }
            }

            // Extract BEP-BMO summary: count connected BMO ports
            const bepBmoPortSet = new Set<number>();
            for (const p of bepBmoPaths) {
              const path = p["OPTICAL PATH"] || "";
              const bmoMatch = path.match(/BMO\d+_(\d+)$/i);
              if (bmoMatch) bepBmoPortSet.add(parseInt(bmoMatch[1], 10));
            }
            const bepBmoPorts = Array.from(bepBmoPortSet).sort((a, b) => a - b);

            // BEP spare fibers
            const bepSpareCount = bepPaths.length;

            return (
              <div className="space-y-3">
                {/* CAB-BEP or CAB-BCP */}
                {firstSectionPaths.length > 0 && (
                  <div className="p-2.5 rounded-lg border border-border bg-background space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">CAB → {firstSectionTarget}</Badge>
                    </div>
                    <div className="text-xs space-y-0.5">
                      <div>🏗️ Καμπίνα: <strong className="text-foreground">{cabName || "—"}</strong></div>
                      <div>📦 {firstSectionTarget}: <strong className="text-foreground">{(firstSectionTarget === "BCP" ? bcpName : bepName) || "—"}</strong></div>
                    </div>

                    {/* Ενεργά όρια (splitter fibers) */}
                    {splitterEntries.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                          🔵 {splitterEntries.length === 1 ? "Ενεργό Όριο" : `Ενεργά Όρια (${splitterEntries.length})`}
                        </div>
                        {splitterEntries.map((s, i) => (
                          <div key={i} className="ml-1 p-1.5 rounded border border-primary/20 bg-primary/5 space-y-0.5">
                            <div className="text-[11px] font-mono font-semibold text-primary">
                              {splitterEntries.length > 1 ? `${i + 1}ο: ` : ""}{s.sga}{s.sgaPort ? ` (port ${s.sgaPort})` : ""} → {s.fiber}
                            </div>
                            {(s.bepPort || s.sb) && (
                              <div className="text-[10px] text-muted-foreground font-mono pl-2">
                                ↳ {firstSectionTarget === "BCP" ? bcpName : bepName} port {s.bepPort} → {s.sb}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Εφεδρικά όρια */}
                    {backboneFibers.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          ⚪ Εφεδρικά Όρια ({backboneFibers.length})
                        </div>
                        <div className="ml-1 text-[11px] text-muted-foreground font-mono">
                          {backboneFibers.join(" · ")}
                        </div>
                      </div>
                    )}

                    {/* Σύνολο */}
                    <div className="text-[10px] text-muted-foreground border-t border-border pt-1">
                      Σύνολο ινών: <strong className="text-foreground">{splitterEntries.length + backboneFibers.length}</strong>
                    </div>
                  </div>
                )}

                {/* BCP-BEP section (when BCP exists) */}
                {bcpBepPaths.length > 0 && (
                  <div className="p-2.5 rounded-lg border border-border bg-background space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">BCP → BEP</Badge>
                    </div>
                    <div className="text-xs space-y-0.5">
                      <div>📦 BCP: <strong className="text-foreground">{bcpName || "—"}</strong></div>
                      <div>📦 BEP: <strong className="text-foreground">{(() => {
                        // Extract BEP name from BCP-BEP paths
                        for (const p of bcpBepPaths) {
                          const m = (p["OPTICAL PATH"] || "").match(/(BEP\d+(?:\([^)]+\))?)/i);
                          if (m) return m[1];
                        }
                        return bepName || "—";
                      })()}</strong></div>
                      <div>🔗 Ίνες: <strong className="text-foreground">{bcpBepPaths.length}</strong></div>
                    </div>
                    {bcpBepPaths.map((p, i) => {
                      const path = p["OPTICAL PATH"] || "";
                      const sbMatch = path.match(/(SB\d+\([^)]+\))/i);
                      const bepPortMatch = path.match(/BEP\d+(?:\([^)]+\))?_(\d+[a-z]?)/i);
                      return (
                        <div key={i} className="ml-1 text-[11px] font-mono text-muted-foreground">
                          {bepPortMatch ? `port ${bepPortMatch[1]}` : ""}{sbMatch ? ` → ${sbMatch[1]}` : ""}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* BEP-BMO simplified */}
                {bepBmoPaths.length > 0 && (
                  <div className="p-2.5 rounded-lg border border-border bg-background space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">BEP → BMO</Badge>
                    </div>
                    <div className="text-xs space-y-0.5">
                      <div>🔗 Ίνες: <strong className="text-foreground">{bepBmoPaths.length}</strong></div>
                      <div>📡 BMO ports: <strong className="text-foreground">{bepBmoPorts.join(", ")}</strong></div>
                      {bepSpareCount > 0 && (
                        <div>⚡ Εφεδρικές (BEP): <strong className="text-foreground">{bepSpareCount}</strong></div>
                      )}
                    </div>
                  </div>
                )}
                {/* BMO-FB: Per-floor view */}
                {sortedFloors.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">BMO-FB</Badge>
                      <span className="text-[10px] text-muted-foreground">ανά όροφο</span>
                    </div>
                    {sortedFloors.map(([key, floor]) => {
                      floor.bmoPorts.sort((a, b) => a - b);
                      const normalizedCustomerFloor = normalizeFloorId(customerFloor);
                      const isCustomerFloor = !!customerFloor && (
                        key === normalizedCustomerFloor ||
                        (key === "+00" && /ισόγ|00|ground/i.test(customerFloor)) ||
                        (key === "+ΗΜ" && /ΗΜ|HM/i.test(customerFloor))
                      );
                      return (
                        <div key={key} className={`p-2.5 rounded-lg border ${isCustomerFloor ? 'border-primary/50 bg-primary/5' : 'border-border bg-background'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">{floor.floorLabel}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            <span>FB: <strong className="text-foreground">{floor.fbCount}</strong> ports</span>
                            <span>BMO ports: <strong className="text-foreground">{floor.bmoPorts.join(", ")}</strong></span>
                          </div>
                          {isCustomerFloor && (
                            <div className="mt-1 text-xs text-primary font-medium">
                              👤 Πελάτης — Όροφος {customerFloor}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ──── LABELLING SECTION (COSMOTE specs) ──── */}
                {(() => {
                   const address = assignment?.address || "";
                   const bepOnly = gisData?.bep_only === true;
                   const buildingId = gisData?.building_id || assignment?.building_id_hemd || "";
                   
                   // --- Parse BMO-FB paths for floor/FB data ---
                   const bmoFbPaths = paths.filter(p => (p["OPTICAL PATH TYPE"] || "").toUpperCase() === "BMO-FB");
                   
                   // Map BMO ports to floors
                   const bmoPortToFloor: Record<number, string> = {};
                   for (const p of bmoFbPaths) {
                     const pathStr = p["OPTICAL PATH"] || "";
                     const m = pathStr.match(/BMO\d+_(\d+)_FB\(([^)]+)\)/i);
                     if (m) {
                       const bmoPort = parseInt(m[1], 10);
                        const floorId = normalizeFloorId(m[2]);
                       if (!bmoPortToFloor[bmoPort]) bmoPortToFloor[bmoPort] = floorId;
                     }
                   }
                   
                   // Floor label helper
                   const floorShort = (floorId: string) => {
                      const normalizedFloor = normalizeFloorId(floorId);
                      if (normalizedFloor === "-ΗΥ") return "ΥΡΟ";
                      if (normalizedFloor === "+00") return "ΙΣΟ";
                      if (normalizedFloor === "+ΗΜ") return "ΗΜΙ";
                      if (normalizedFloor.startsWith("-")) return "ΥΠΟ";
                      const numMatch = normalizedFloor.match(/^\+?(\d+)$/);
                      if (numMatch) return `${parseInt(numMatch[1], 10)}ος`;
                      return normalizedFloor || floorId;
                   };
                   
                     // --- Fiber range from CAB-BEP or CAB-BCP ---
                     let cabTube = "";
                     const cabFiberNums: number[] = [];
                     const fiberSourcePaths = cabBepPaths.length > 0 ? cabBepPaths : cabBcpPaths;
                     for (const p of fiberSourcePaths) {
                       const path = p["OPTICAL PATH"] || "";
                       // Extract tube from cable ID pattern (e.g. C1 from G151_C1.3 or G151_SGA...C1.1)
                       const tubeMatch = path.match(/([A-Z])(\d+)\.(\d+).*(?:BEP|BCP)/i);
                       if (tubeMatch && !cabTube) {
                         cabTube = `${tubeMatch[1]}${tubeMatch[2].padStart(2, "0")}`;
                       }
                       // Extract fiber number from tube.fiber pattern (e.g. C1.3 → 3, handles both active SGA and spare paths)
                       const allTubeFibers = [...path.matchAll(/[A-Z](\d+)\.(\d+)/gi)];
                       // Find the cable tube fiber (not SGA port) — look for the one matching tube pattern
                       for (const tf of allTubeFibers) {
                         // Skip SGA/SGB patterns (SGA01(1:8).07)
                         const prefix = path.substring(0, tf.index);
                         if (/SG[AB]\d+\([^)]+\)$/i.test(prefix)) continue;
                         cabFiberNums.push(parseInt(tf[2], 10));
                       }
                     }
                    const fiberMin = cabFiberNums.length > 0 ? Math.min(...cabFiberNums) : 0;
                    const fiberMax = cabFiberNums.length > 0 ? Math.max(...cabFiberNums) : 0;
                    const fiberRange = fiberMin > 0 ? `${fiberMin}-${fiberMax}` : "";
                   // Fiber count: standardize to 4FO or 12FO
                   const rawFiberCount = cabFiberNums.length;
                    // Floor details for apartment-based FO calculation
                     const floorDetailsArr = normalizedFloorDetails;
                    // Rule: if ANY floor has > 2 apartments → 12FO (3 splices + 3 spare), else 4FO
                     const maxApartmentsAnyFloor = floorDetailsArr.reduce((max: number, fd) => Math.max(max, fd.apartments || 0), 0);
                    const fiberCount = maxApartmentsAnyFloor > 2 ? "12FO" : "4FO";
                    // Per-floor FO: check apartments on that specific floor
                    const floorFO = (floorId: string) => {
                      const fd = floorDetailsArr.find((d) => d.floor === normalizeFloorId(floorId));
                      return (fd?.apartments || 0) > 2 ? "12FO" : "4FO";
                    };
                    // Standard FO helper: uses floor apartments when available, fallback to count-based
                    const standardFO = (count: number) => count <= 2 ? "2FO" : count <= 4 ? "4FO" : "12FO";
                   
                    // BCP exists if found in paths or GIS metadata
                    const hasBcpConnection = hasBcp || !!(gisData?.nearby_bcp || gisData?.new_bcp || gisData?.associated_bcp);
                   
                    // --- BEP door label: per-splitter rows ---
                    // Large BEP: Splitter 1 → rows A/B, Splitter 2 → rows C/D
                    // Each splitter has position 1 = ΟΡΙΑ, then floors, then ΕΦΕΔ

                    // 1. Count SB splitters
                    const sbSplitterNames = new Set<string>();
                    for (const p of bepBmoPaths) {
                      const pathStr = p["OPTICAL PATH"] || "";
                      const m = pathStr.match(/_(SB\d+)\(/i);
                      if (m) sbSplitterNames.add(m[1]);
                    }
                    for (const p of bepPaths) {
                      const pathStr = p["OPTICAL PATH"] || "";
                      const m = pathStr.match(/_(SB\d+)\(/i);
                      if (m) sbSplitterNames.add(m[1]);
                    }
                    const splitterCount = Math.max(sbSplitterNames.size, cabBepPaths.length > 0 ? 1 : 0);

                    // 2. Group active ports by splitter number
                    const sbPortEntries: { sbNum: number; sbPort: number; floor: string }[] = [];
                    for (const p of bepBmoPaths) {
                      const pathStr = p["OPTICAL PATH"] || "";
                      const m = pathStr.match(/SB(\d+)\([\d:]+\)\.(\d+)_\d+[a-z]_BMO\d+_(\d+)/i);
                      if (m) {
                        const sbNum = parseInt(m[1], 10);
                        const sbPort = parseInt(m[2], 10);
                        const bmoPort = parseInt(m[3], 10);
                        const floor = bmoPortToFloor[bmoPort];
                        if (floor) {
                          sbPortEntries.push({ sbNum, sbPort, floor });
                        }
                      }
                    }

                    // 3. Group spare ports by splitter number
                    const spareEntries: { sbNum: number; sbPort: number }[] = [];
                    for (const p of bepPaths) {
                      const pathStr = p["OPTICAL PATH"] || "";
                      const m = pathStr.match(/SB(\d+)\([\d:]+\)\.(\d+)_\d+[a-z]$/i);
                      if (m) {
                        spareEntries.push({ sbNum: parseInt(m[1], 10), sbPort: parseInt(m[2], 10) });
                      }
                    }

                    // 4. Build per-splitter data structure
                    // Each splitter gets letter pair: SB01→A/B, SB02→C/D, SB03→E/F...
                    const splitterLetterPairs: [string, string][] = [["A","B"],["C","D"],["E","F"],["G","H"]];
                    const splitterNums = Array.from(new Set([
                      ...sbPortEntries.map(e => e.sbNum),
                      ...spareEntries.map(e => e.sbNum)
                    ])).sort((a, b) => a - b);
                    // Ensure at least one splitter
                    if (splitterNums.length === 0 && splitterCount > 0) {
                      for (let i = 1; i <= splitterCount; i++) splitterNums.push(i);
                    }

                    // bepDoorPairs: { letters: [string,string], position: number, label: string }[]
                    const bepDoorPairs: { letters: [string,string]; position: number; label: string }[] = [];

                    const MAX_POSITIONS_PER_ROW = 7;
                    for (let si = 0; si < splitterNums.length; si++) {
                      const sbNum = splitterNums[si];
                      const letters = splitterLetterPairs[si] || [`${String.fromCharCode(65+si*2)}`,`${String.fromCharCode(66+si*2)}`];
                      // Position 1 = ΟΡΙΑ
                      bepDoorPairs.push({ letters: letters as [string,string], position: 1, label: "ΟΡΙΑ" });
                      // Active floors for this splitter
                      const activeForSb = sbPortEntries.filter(e => e.sbNum === sbNum).sort((a,b) => a.sbPort - b.sbPort);
                      let pos = 2;
                      for (const entry of activeForSb) {
                        if (pos > MAX_POSITIONS_PER_ROW) break;
                        bepDoorPairs.push({ letters: letters as [string,string], position: pos++, label: floorShort(entry.floor) });
                      }
                      // No spare/ΕΦΕΔ labels needed
                    }

                    // 5. Fallback: if no pair data from paths, use floor_details
                    if (bepDoorPairs.length === 0 && floorDetailsArr.length > 0) {
                      const letters: [string,string] = ["A","B"];
                      bepDoorPairs.push({ letters, position: 1, label: "ΟΡΙΑ" });
                      let pos = 2;
                      const sortedFD = [...floorDetailsArr].sort((a, b) => {
                        const order = (f: string) => {
                          if (f === "ΥΠ" || f.startsWith("-")) return -100 + (parseInt(f.replace("-", ""), 10) || 0);
                          if (f === "ΗΜ" || f === "ΗΜΙ") return -1;
                          if (f === "ΙΣ" || f === "ΙΣΟ" || f === "0" || f === "00") return 0;
                          return parseInt(f.replace("+", ""), 10) || 0;
                        };
                        return order(a.floor) - order(b.floor);
                      });
                      for (const fd of sortedFD) {
                        const apts = fd.apartments != null ? fd.apartments : 1;
                        if (apts === 0) continue;
                        for (let a = 0; a < apts; a++) {
                          if (pos > MAX_POSITIONS_PER_ROW) break;
                          bepDoorPairs.push({ letters, position: pos++, label: floorShort(fd.floor) });
                        }
                      }
                      // No spare/ΕΦΕΔ labels needed
                    }

                    // --- FB groups from BMO-FB paths (grouped by FLOOR, not FB name) ---
                    const fbGroups: Record<string, { floor: string; ports: { mobPort: number; fbPortNum: number }[] }> = {};
                    for (const p of bmoFbPaths) {
                      const pathStr = p["OPTICAL PATH"] || "";
                      const m = pathStr.match(/BMO\d+_(\d+)_FB\(([^)]+)\)\.(\d+)(?:_(\d+))?/i);
                      if (m) {
                        const mobPort = parseInt(m[1], 10);
                        const floorId = normalizeFloorId(m[2]);
                        const fbPortNum = m[4] ? parseInt(m[4], 10) : mobPort;
                        if (!fbGroups[floorId]) fbGroups[floorId] = { floor: floorId, ports: [] };
                        fbGroups[floorId].ports.push({ mobPort, fbPortNum });
                      }
                    }
                   
                   // --- BMO name ---
                   let mobName = "";
                   for (const p of [...bepBmoPaths, ...bmoFbPaths]) {
                     const path = p["OPTICAL PATH"] || "";
                     const mobMatch = path.match(/((?:MOB|BMO)\d+(?:\([^)]+\))?)/i);
                     if (mobMatch && !mobName) { mobName = mobMatch[1]; break; }
                   }
                   
                   // --- Splitter labels for cabinet ---
                   const splitterLabelsList = splitterEntries
                     .filter(s => s.sga)
                     .map(s => {
                       const sgaPort = s.sgaPort ? `.${s.sgaPort.padStart(2, "0")}` : "";
                       return `${s.sga}${sgaPort}`;
                     })
                     .filter((v, i, arr) => arr.indexOf(v) === i);
                   
                   // --- Conditions ---
                   const hasCabLabel = !!(cabName && address);
                    const hasBcpLabel = hasBcpConnection && !!(cabName && fiberRange);
                   const hasBepLabel = !!(bepName && (cabFiberNums.length > 0 || bepBmoPorts.length > 0));
                   const hasMobLabel = !bepOnly && Object.keys(fbGroups).length > 0;
                    const hasFbLabel = !bepOnly && Object.keys(fbGroups).length > 0;

                      if (!hasCabLabel && !hasBcpLabel && !hasBepLabel && !hasMobLabel && !hasFbLabel) return null;

                   // Label card helper
                   const LabelCard = ({ color, icon, title, children }: { color: string; icon: string; title: string; children: React.ReactNode }) => (
                     <div className={`p-2.5 rounded-lg border-2 border-dashed border-${color}/30 bg-card space-y-1.5`}>
                       <div className={`text-[10px] font-bold uppercase tracking-wider text-${color}`}>{icon} {title}</div>
                       {children}
                     </div>
                   );

                   // Monospace label box
                   const LabelBox = ({ label, children }: { label?: string; children: React.ReactNode }) => (
                     <div className="bg-background border border-border rounded-md p-2.5 font-mono text-[11px] space-y-1">
                       {label && <div className="text-[9px] font-bold text-muted-foreground uppercase">{label}</div>}
                       {children}
                     </div>
                   );

                   const LabelLine = ({ text, bold, type }: { text: string; bold?: boolean; type?: "flag" | "flat" }) => (
                     <div className={`relative group text-center text-xs whitespace-pre-line ${bold ? "font-bold" : ""} text-foreground bg-muted/50 rounded px-2 py-1.5 pr-14 border border-border`}>
                       {text}
                       <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                         <button
                           type="button"
                           onClick={() => handlePrintSingleLabel(text, { type })}
                           disabled={printingLabel === text}
                           title="Εκτύπωση Bluetooth"
                           className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-50"
                         >
                           {printingLabel === text ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                         </button>
                         <button
                           type="button"
                           onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied!"); }}
                           title="Αντιγραφή"
                           className="p-1 rounded hover:bg-muted"
                         >
                           <Copy className="h-3 w-3 text-muted-foreground" />
                         </button>
                       </div>
                     </div>
                   );

                   // Multi-line label with copy
                   const LabelBlock = ({ lines, type }: { lines: string[]; type?: "flag" | "flat" }) => {
                     const text = lines.join("\n");
                     return (
                     <div className="relative group space-y-0.5 text-center text-xs font-bold text-foreground bg-muted/50 rounded px-2 py-2 pr-14 border border-border">
                       {lines.map((line, i) => <div key={i}>{line}</div>)}
                       <div className="absolute right-1 top-1 flex items-center gap-0.5">
                         <button
                           type="button"
                           onClick={() => handlePrintSingleLabel(text, { type })}
                           disabled={printingLabel === text}
                           title="Εκτύπωση Bluetooth"
                           className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-50"
                         >
                           {printingLabel === text ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                         </button>
                         <button
                           type="button"
                           onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied!"); }}
                           title="Αντιγραφή"
                           className="p-1 rounded hover:bg-muted"
                         >
                           <Copy className="h-3 w-3 text-muted-foreground" />
                         </button>
                       </div>
                     </div>
                     );
                   };

                     return (!phase || phase === 3) ? (
                      <div className="space-y-2 mt-3 pt-3 border-t border-border">
                       <div className="flex items-center gap-2 flex-wrap">
                         <Badge variant="default" className="text-[10px]">🏷️ Labels</Badge>
                         <span className="text-[10px] text-muted-foreground">Αυτοκόλλητα — COSMOTE specs</span>
                         <div className="ml-auto flex items-center gap-1.5">
                           {/* Demo toggle */}
                           <button
                             type="button"
                             onClick={handleToggleDemo}
                             title="Demo mode (προσομοίωση εκτύπωσης χωρίς πραγματικό printer)"
                             className={`h-7 px-2 rounded text-[10px] font-semibold border transition-colors ${
                               printerState.demoMode
                                 ? "bg-amber-500/15 text-amber-600 border-amber-500/40"
                                 : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                             }`}
                           >
                             🧪 Demo
                           </button>
                           {/* Bluetooth connect button */}
                           <Button
                             type="button"
                             size="sm"
                             onClick={handlePrinterConnect}
                             disabled={printerConnecting}
                             className={`h-7 gap-1.5 text-xs ${
                               printerState.status === "connected"
                                 ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                                 : printerState.status === "demo"
                                 ? "bg-amber-500 hover:bg-amber-600 text-white"
                                 : "bg-gradient-to-r from-primary to-accent text-primary-foreground"
                             }`}
                           >
                             {printerConnecting ? (
                               <Loader2 className="h-3.5 w-3.5 animate-spin" />
                             ) : printerState.status === "connected" ? (
                               <BluetoothConnected className="h-3.5 w-3.5" />
                             ) : printerState.status === "demo" ? (
                               <Bluetooth className="h-3.5 w-3.5" />
                             ) : (
                               <BluetoothOff className="h-3.5 w-3.5" />
                             )}
                             {printerState.status === "connected"
                               ? `Συνδεδεμένος: ${printerState.deviceName?.slice(0, 14) || "Printer"}`
                               : printerState.status === "demo"
                               ? "Demo Printer"
                               : printerConnecting
                               ? "Σύνδεση..."
                               : "Σύνδεση Bluetooth"}
                           </Button>
                         </div>
                       </div>
                       {printerState.status !== "connected" && printerState.status !== "demo" && (
                         <div className="text-[10px] text-muted-foreground italic px-1">
                           💡 Πατήστε <strong>Σύνδεση Bluetooth</strong> για να συνδεθείτε στον Brother PT-E550W. Μετά πατήστε το <Printer className="inline h-3 w-3" /> δίπλα σε κάθε label.
                         </div>
                       )}

                       {/* ═══ 2. ΚΑΜΠΙΝΑ ΠΑΛΑΙΟΥ ΤΥΠΟΥ ═══ */}
                       {hasCabLabel && (
                         <LabelCard color="orange-600" icon="🏗️" title="Labels Καμπίνα">
                           <LabelBox label="A. Μέσα στην κασέτα">
                             <LabelLine text={address} bold />
                           </LabelBox>
                           {splitterLabelsList.length > 0 && (
                             <LabelBox label="B. Πάνω στις εξόδους Splitter">
                               <div className="space-y-1">
                                  {splitterLabelsList.map((spl, i) => (
                                    <LabelLine key={i} text={spl} bold />
                                  ))}
                               </div>
                             </LabelBox>
                           )}
                           <LabelBox label="C. Πάνω στον σωληνίσκο">
                             <LabelLine text={address} bold />
                           </LabelBox>
                         </LabelCard>
                       )}

                       {/* ═══ 3. BCP ═══ */}
                       {hasBcpLabel && (
                         <LabelCard color="amber-600" icon="📦" title="Labels BCP">
                           {/* A. Μαύρη ίνα */}
                           <LabelBox label="A. Στη μαύρη ίνα">
                             <LabelLine text={`ΚΑΜΠΙΝΑ: ${cabName} | ${fiberCount} | ΟΡΙΑ: ${fiberRange}`} bold />
                           </LabelBox>
                           {/* B. Άσπρη ίνα */}
                           <LabelBox label="B. Στην άσπρη ίνα">
                             <LabelLine text={`${bepName || "BEP01"} | ${fiberCount}`} bold />
                           </LabelBox>
                           {/* C. Πόρτα BCP */}
                            <LabelBox label="C. Στην πόρτα του BCP">
                              <LabelBlock lines={[
                                `ΚΑΜΠΙΝΑ: ${cabName}`,
                                `ΣΩΛΗΝΙΣΚΟΣ: ${cabTube || cabName}`,
                                `ΟΡΙΑ: ${fiberRange}`,
                                ...(address ? [`A1-B1: ${address}`] : []),
                              ]} />
                            </LabelBox>
                         </LabelCard>
                       )}

                       {/* ═══ 4. BEP ═══ */}
                       {hasBepLabel && (
                         <LabelCard color="primary" icon="🔌" title="Labels BEP">
                            {/* A. Μαύρη ίνα από καμπίνα */}
                            <LabelBox label="A. Label μαύρης ίνας (από καμπίνα)">
                              <LabelLine text={`${cabName} (${cabTube || cabName})\n${fiberRange}`} bold />
                            </LabelBox>
                              {/* B. Πόρτα BEP */}
                               <LabelBox label="B. Στην πόρτα του BEP">
                                 <LabelBlock lines={[
                                   `ΚΑΜΠΙΝΑ: ${cabName}`,
                                    ...(hasBcpConnection && bcpName ? [`BCP: ${bcpName}`] : []),
                                   `ΣΩΛΗΝΙΣΚΟΣ: ${cabTube || cabName}`,
                                   `ΟΡΙΑ: ${fiberRange}`,
                                 ]} />
                                   {/* Individual per-splitter floor labels */}
                                   {(() => {
                                     const individualLabels: string[] = [];
                                     for (const item of bepDoorPairs) {
                                       const [l1, l2] = item.letters;
                                       // Each fiber is a separate label: A = active, B = spare (same position/floor)
                                       individualLabels.push(`${l1}${item.position} - ${item.label}`);
                                       individualLabels.push(`${l2}${item.position} - ${item.label}`);
                                     }
                                     return individualLabels.length > 0 ? (
                                       <div className="space-y-1 mt-1">
                                         {individualLabels.map((lbl, i) => (
                                           <div key={i} className="relative group font-mono text-[11px] font-semibold bg-muted/50 rounded-md px-3 py-1.5 border border-border">
                                             {lbl}
                                             <button type="button" onClick={() => { navigator.clipboard.writeText(lbl); toast.success("Copied!"); }}
                                               className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted">
                                               <Copy className="h-3 w-3 text-muted-foreground" />
                                             </button>
                                           </div>
                                         ))}
                                       </div>
                                     ) : null;
                                   })()}
                               </LabelBox>
                         </LabelCard>
                       )}

                         {/* ═══ 5. BMO ═══ */}
                         {hasMobLabel && (() => {
                           // Conduit from BEP name (e.g. BEP01(c19) → c19)
                           const conduitMatch = (bepName || "").match(/\(([^)]+)\)/);
                           const conduit = conduitMatch ? conduitMatch[1] : "";

                           return (
                           <LabelCard color="accent-foreground" icon="📡" title="Labels BMO">

                            {/* B. Εσωτερικά BMO — feed + range + ξεχωριστά FB labels ανά όροφο */}
                              <LabelBox label="B. Εσωτερικά BMO">
                                <div className="space-y-2">
                                  {/* Feed source + range (ένα block) */}
                                  {(() => {
                                    const feedLine = `${cabName} - ${fiberCount}`;
                                    const rangeLine = fiberRange ? fiberRange.replace("-", " - ") : "";
                                    const feedBlock = [feedLine, ...(rangeLine ? [rangeLine] : [])].join("\n");
                                    return (
                                      <div className="relative group font-mono text-[11px] font-semibold bg-muted/50 rounded-md px-3 py-1.5 border border-border text-center space-y-0.5">
                                        <div>{feedLine}</div>
                                        {rangeLine && <div>{rangeLine}</div>}
                                        <button
                                          type="button"
                                          onClick={() => { navigator.clipboard.writeText(feedBlock); toast.success("Copied!"); }}
                                          className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                                        >
                                          <Copy className="h-3 w-3 text-muted-foreground" />
                                        </button>
                                      </div>
                                    );
                                  })()}

                                  {/* FB ανά όροφο — κάθε γραμμή ξεχωριστή ⇒ ξεχωριστό copy */}
                                  <div className="space-y-1">
                                    <div className="text-[10px] text-muted-foreground px-0.5">
                                      FB labels (κλικ ανά όροφο για copy)
                                    </div>
                                    {Object.entries(fbGroups)
                                      .sort(([a], [b]) => a.localeCompare(b))
                                      .map(([key, fb]) => {
                                        const fl = fb.floor.startsWith("+") || fb.floor.startsWith("-") ? fb.floor : `+${fb.floor}`;
                                        const text = `FB(${fl}) ${floorFO(fb.floor)}`;
                                        return (
                                          <button
                                            key={key}
                                            type="button"
                                            onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied!"); }}
                                            className="relative group w-full font-mono text-[11px] font-semibold bg-muted/50 hover:bg-muted rounded-md px-3 py-1.5 border border-border text-center transition-colors"
                                          >
                                            {text}
                                            <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1.5" />
                                          </button>
                                        );
                                      })}
                                  </div>
                                </div>
                              </LabelBox>

                              {/* C. Ports → Όροφος (ΟΛΑ τα BMO ports από BMO-FB, ομαδοποιημένα ανά όροφο) */}
                              {(() => {
                                // Helper: μετατροπή floor id σε ΙΣ/1ος/2ος/ΗΜ/Υπόγειο
                                const floorShort = (floor: string): string => {
                                  const raw = (floor || "").trim().replace(/^\+/, "");
                                  if (/ΗΜ|HM/i.test(raw)) return "ΗΜ";
                                  if (/ΥΠ|YP|^-Η?Υ$/i.test(raw)) return "Υπόγ";
                                  const num = parseInt(raw, 10);
                                  if (!isNaN(num)) {
                                    if (num === 0) return "ΙΣ";
                                    if (num < 0) return `Υπόγ ${num}`;
                                    return `${num}ος`;
                                  }
                                  return raw;
                                };

                                const floorEntries = Object.entries(fbGroups)
                                  .map(([, fb]) => {
                                    const ports = Array.from(new Set(fb.ports.map((p) => p.mobPort))).sort((a, b) => a - b);
                                    return [fb.floor, ports] as const;
                                  })
                                  .filter(([, ports]) => ports.length > 0)
                                  .sort(([a], [b]) => a.localeCompare(b));
                                if (floorEntries.length === 0) return null;

                                return (
                                  <LabelBox label="C. Ports → Όροφος (BMO κουτί)">
                                    <div className="text-[10px] text-muted-foreground mb-1.5 px-0.5">
                                      Όλα τα BMO ports ανά όροφο (από BMO-FB)
                                    </div>
                                    <div className="space-y-1.5">
                                      {floorEntries.map(([floor, ports]) => {
                                        const floorLbl = floorShort(floor);
                                        const portsTxt = ports.join(", ");
                                        const text = `${floorLbl} · Port ${portsTxt}`;
                                        return (
                                          <button
                                            key={floor}
                                            type="button"
                                            onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied!"); }}
                                            className="relative group w-full flex items-center justify-between gap-2 font-mono text-[11px] font-semibold bg-muted/50 hover:bg-muted rounded-md px-3 py-1.5 border border-border transition-colors"
                                          >
                                            <span className="text-foreground font-bold">{floorLbl}</span>
                                            <span className="text-muted-foreground">Port {portsTxt}</span>
                                            <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1" />
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </LabelBox>
                                );
                              })()}
                           </LabelCard>
                          );
                        })()}

                       {/* ═══ 5. BMO (BEP ONLY) ═══ */}
                        {bepOnly && bepName && (
                         <LabelCard color="accent-foreground" icon="📡" title="Labels BMO (BEP ONLY)">
                             <LabelBox label="A. Εσωτερικά BMO">
                               <LabelBlock lines={[
                                 `${cabName || bcpName || "ΚΑΜΠΙΝΑ"} - ${fiberCount}`,
                                 ...(fiberRange ? [fiberRange.replace("-", " - ")] : []),
                                 `${bepName} → ${mobName || "BMO"}`,
                               ]} />
                             </LabelBox>
                              <LabelBox label="B. Εξωτερικό Label BMO">
                                <LabelBlock lines={[
                                  `${mobName || "BMO"}`,
                                  ...(cabName ? [`CAB: ${cabName}`] : []),
                                  ...(bcpName ? [`BCP: ${bcpName}`] : []),
                                  ...(address ? [`${address}`] : []),
                                  "BEP ONLY",
                                ]} />
                            </LabelBox>
                         </LabelCard>
                       )}

                        {/* ═══ 6. FB ═══ */}
                        {hasFbLabel && (() => {
                          // Group all BMO-FB ports by floor
                          const floorPortMap: Record<string, number[]> = {};
                          for (const [, fb] of Object.entries(fbGroups)) {
                            const floorId = fb.floor;
                            if (!floorPortMap[floorId]) floorPortMap[floorId] = [];
                            for (const p of fb.ports) {
                              if (!floorPortMap[floorId].includes(p.mobPort)) {
                                floorPortMap[floorId].push(p.mobPort);
                              }
                            }
                          }
                          // Sort floors
                          const sortedFloors = Object.entries(floorPortMap).sort(([a], [b]) => a.localeCompare(b));
                          return (
                          <LabelCard color="muted-foreground" icon="🏠" title="Labels FB">
                            <div className="space-y-1.5">
                              {sortedFloors.map(([floorId, ports]) => {
                                const sorted = ports.sort((a, b) => a - b);
                                const floorLabel = floorId.startsWith("+") || floorId.startsWith("-") ? floorId : `+${floorId}`;
                                const portRange = sorted.length > 1
                                  ? `${sorted[0]}-${sorted[sorted.length - 1]}`
                                  : `${sorted[0]}`;
                                return (
                                  <LabelBox key={floorId} label={`Στην πόρτα: FB ${floorLabel}`}>
                                    <LabelLine text={`FB(${floorLabel}) ${portRange}`} bold />
                                  </LabelBox>
                                );
                              })}
                            </div>
                          </LabelCard>
                          );
                        })()}
                     </div>
                    ) : null;
                 })()}
                {/* Summary */}
                <div className="text-[10px] text-muted-foreground mt-1 px-1">
                  📌 Σύνολο: {paths.length} διαδρομές
                </div>
              </div>
            );
          })()}
        </Card>
      )}

      {/* ΔΙΑΔΡΟΜΕΣ */}
      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("routes")}
          className="w-full flex items-center justify-between p-5 hover:bg-muted/40 transition-colors rounded-2xl"
        >
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-2 pointer-events-none"><span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <Route className="h-3.5 w-3.5" />
            Διαδρομές
            <Badge variant="secondary" className="text-[10px] ml-1">{totalKoi.toFixed(0)}μ</Badge>
          </Label>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openSections.includes("routes") ? "rotate-180" : ""}`} />
        </button>
        {openSections.includes("routes") && (
        <div className="px-5 pb-5 space-y-3.5 border-t border-border/40 pt-4">
        <div className="space-y-2">
          {effectiveRoutes.map((route, idx) => {
            // Crew visibility:
            //  - Φάση 2: μόνο INHOUSE (idx 3)
            //  - Φάση 3: όλες οι διαδρομές
            //  - Admin: όλες
            if (isCrewMode && phase === 2 && idx !== 3) return null;
            const isInhouse = idx === 3;
            return (
            <div key={idx} className="border border-border rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">{route.label}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">
                    KOI (m){isInhouse && " — auto από Μέτρα BMO→FB"}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={route.koi}
                    onChange={(e) => !isInhouse && updateRoute(idx, "koi", e.target.value)}
                    placeholder="0"
                    readOnly={isInhouse}
                    className={`text-sm mt-0.5 h-10 ${isInhouse ? "bg-muted cursor-not-allowed" : ""}`}
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">ΦΥΡΑ KOI (m)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={route.fyraKoi}
                    onChange={(e) => updateRoute(idx, "fyraKoi", e.target.value)}
                    placeholder="0"
                    className="text-sm mt-0.5 h-10"
                  />
                </div>
              </div>
              {(idx === 0 || idx === 1) && (
                <div>
                  <Label className="text-[10px] text-muted-foreground">Τύπος ΚΟΙ</Label>
                  <select
                    value={idx === 0 ? koiTypeCabBep : koiTypeCabBcp}
                    onChange={(e) => idx === 0 ? setKoiTypeCabBep(e.target.value) : setKoiTypeCabBcp(e.target.value)}
                    className="w-full mt-0.5 text-sm border border-border rounded-md px-2 py-1 h-10 bg-background text-foreground"
                  >
                    <option value="4' μ cable">4' μ cable</option>
                    <option value="12' μ cable">12' μ cable</option>
                  </select>
                </div>
              )}
            </div>
            );
          })}
          <div className="flex justify-between text-xs font-semibold text-foreground bg-muted/50 rounded-lg p-2">
            <span>Σύνολο</span>
            <span>KOI: {totalKoi.toFixed(1)}m · ΦΥΡΑ: {totalFyraKoi.toFixed(1)}m</span>
          </div>
        </div>
        </div>
        )}
      </Card>

      {/* 📐 Μέτρα BMO→FB ανά Όροφο (collapsible) — εμφανίζεται πάντα σε Φάση 2/3/admin */}
      {(!phase || phase === 2 || phase === 3) && (() => {
        // Σε Φάση 2 ο τεχνικός συμπληρώνει μόνο μέτρα — δεν προσθέτει/διαγράφει ορόφους
        // ούτε αλλάζει τύπο ίνας. Αυτά τα ορίζει ο υπεύθυνος έργου / GIS.
        const isPhase2Crew = phase === 2;
        const showOnlyMeters = isPhase2Crew;
        const gridCols = showOnlyMeters
          ? "grid-cols-[80px_1fr_70px]"
          : "grid-cols-[70px_1fr_90px_36px]";
        return (
        <Card className={`p-5 space-y-2.5 ${isPhase2Crew && floorMeters.length === 0 ? "border-blue-500/40 bg-blue-50/40 dark:bg-blue-950/20" : ""}`}>
          <button
            type="button"
            onClick={() => setFloorMetersCardOpen((o) => !o)}
            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              📐 Μέτρα BMO→FB ανά Όροφο
              <Badge variant="secondary" className="text-[10px]">{floorMeters.length}</Badge>
              {isPhase2Crew && floorMeters.length === 0 && (
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 normal-case tracking-normal">
                  ⚠ Δεν έχουν οριστεί όροφοι από τον υπεύθυνο
                </span>
              )}
            </span>
            {floorMetersCardOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {floorMetersCardOpen && (
            <div className="space-y-2 pt-2">
              <p className="text-[10px] text-muted-foreground px-2">
                Σύνολο: {inhouseKoiTotal.toFixed(1)}μ
                {inhouse4FoMeters > 0 && ` · 4FO: ${inhouse4FoMeters}μ`}
                {inhouse12FoMeters > 0 && ` · 12FO: ${inhouse12FoMeters}μ`}
              </p>
              {floorMeters.length > 0 && (
                <div className={`grid ${gridCols} gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-2`}>
                  <span>Όροφος</span>
                  <span>Μέτρα (BMO→FB)</span>
                  {showOnlyMeters ? <span className="text-right">Ίνα</span> : <><span>Τύπος Ίνας</span><span></span></>}
                </div>
              )}
              {floorMeters.map((fm, idx) => (
                <div key={idx} className={`grid ${gridCols} gap-2 items-center`}>
                  {showOnlyMeters ? (
                    <div className="h-10 flex items-center px-3 text-sm font-semibold text-foreground bg-muted/50 rounded-md">
                      {fm.floor || "—"}
                    </div>
                  ) : (
                    <Input
                      value={fm.floor}
                      onChange={(e) =>
                        setFloorMeters((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, floor: e.target.value } : p))
                        )
                      }
                      placeholder="ΙΣ"
                      className="h-10 text-sm"
                    />
                  )}
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={fm.meters}
                    onChange={(e) =>
                      setFloorMeters((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, meters: e.target.value } : p))
                      )
                    }
                    placeholder="0"
                    className="h-10 text-sm"
                  />
                  {showOnlyMeters ? (
                    <div className="h-10 flex items-center justify-end px-2 text-xs font-medium text-muted-foreground">
                      {fm.fo_type || "4FO"}
                    </div>
                  ) : (
                    <>
                      <select
                        value={fm.fo_type || "4FO"}
                        onChange={(e) => {
                          const newFoType = e.target.value;
                          const derivedPipe = newFoType === "12FO" ? '4"' : '2"';
                          setFloorMeters((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, fo_type: newFoType, pipe_type: derivedPipe } : p
                            )
                          );
                        }}
                        className="h-10 text-sm border border-border rounded-md px-2 bg-background text-foreground"
                      >
                        <option value="4FO">4 FO</option>
                        <option value="12FO">12 FO</option>
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          setFloorMeters((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label="Διαγραφή ορόφου"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {floorMeters.length === 0 && (
                <p className="text-xs text-muted-foreground italic px-2 py-3 text-center">
                  {showOnlyMeters
                    ? "Δεν έχουν οριστεί όροφοι. Επικοινώνησε με τον υπεύθυνο έργου."
                    : "Δεν έχουν καταχωρηθεί όροφοι. Πάτα «Προσθήκη Ορόφου» για να ξεκινήσεις."}
                </p>
              )}
              {!showOnlyMeters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => {
                    const nextFloorLabel = (() => {
                      const count = floorMeters.length;
                      if (count === 0) return "ΙΣ";
                      if (count === 1) return "1ος";
                      return `${count}ος`;
                    })();
                    setFloorMeters((prev) => [
                      ...prev,
                      { floor: nextFloorLabel, meters: "", pipe_type: '2"', fo_type: "4FO" },
                    ]);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Προσθήκη Ορόφου
                </Button>
              )}
            </div>
          )}
        </Card>
        );
      })()}

      {/* 🗺️ Οριζοντογραφία AS-BUILD (collapsible) — admin + Φάση 2/3 */}
      {(!isCrewMode || phase === 2 || phase === 3) && (
        <Card className="p-5 space-y-2.5">
          <button
            type="button"
            onClick={() => setAsbuiltCardOpen((o) => !o)}
            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            <span>🗺️ Οριζοντογραφία AS-BUILD</span>
            {asbuiltCardOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {asbuiltCardOpen && (
            <div className="space-y-3 pt-2">
              {/* Α — πάντα */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Απόσταση BMO-BEP (m)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={section6.bmo_bep_distance}
                    onChange={(e) => setSection6((s) => ({ ...s, bmo_bep_distance: e.target.value }))}
                    className="h-10 text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Είδος Εισαγωγής</Label>
                  <select
                    value={section6.eisagogi_type}
                    onChange={(e) => setSection6((s) => ({ ...s, eisagogi_type: e.target.value }))}
                    className="w-full mt-1 h-10 text-sm border border-border rounded-md px-2 bg-background text-foreground"
                  >
                    <option value="">— Επιλέξτε —</option>
                    <option value="ΝΕΑ ΥΠΟΔΟΜΗ">ΝΕΑ ΥΠΟΔΟΜΗ</option>
                    <option value="ΕΣΚΑΛΗΤ">ΕΣΚΑΛΗΤ</option>
                    <option value="ΕΣΚΑΛΗΤ Β1">ΕΣΚΑΛΗΤ Β1</option>
                    <option value="BCP">BCP</option>
                  </select>
                </div>
              </div>

              {/* Β — ΝΕΑ ΥΠΟΔΟΜΗ */}
              {section6.eisagogi_type === "ΝΕΑ ΥΠΟΔΟΜΗ" && (
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                  <div>
                    <Label className="text-xs">Ball Marker BEP</Label>
                    <Input
                      type="number"
                      value={ballMarkerBep}
                      onChange={(e) => setBallMarkerBep(e.target.value)}
                      className="h-10 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Μ/Σ (Σκάμμα)</Label>
                    <Input
                      type="number"
                      value={section6.ms_skamma}
                      onChange={(e) => setSection6((s) => ({ ...s, ms_skamma: e.target.value }))}
                      className="h-10 text-sm mt-1"
                    />
                  </div>
                </div>
              )}

              {/* Γ — ΕΣΚΑΛΗΤ */}
              {section6.eisagogi_type === "ΕΣΚΑΛΗΤ" && (
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                  <div>
                    <Label className="text-xs">Μ/Σ</Label>
                    <Input
                      value={section6.eskalit_ms}
                      onChange={(e) => setSection6((s) => ({ ...s, eskalit_ms: e.target.value }))}
                      className="h-10 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Νέα Σωλήνωση</Label>
                    <Input
                      value={section6.eskalit_nea_solienosi}
                      onChange={(e) => setSection6((s) => ({ ...s, eskalit_nea_solienosi: e.target.value }))}
                      className="h-10 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Σωλήνωση Εισαγωγής</Label>
                    <Input
                      value={section6.eskalit_solienosi_eisagogis}
                      onChange={(e) => setSection6((s) => ({ ...s, eskalit_solienosi_eisagogis: e.target.value }))}
                      className="h-10 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">ΕΣΚΑΛΗΤ-BEP</Label>
                    <Input
                      value={section6.eskalit_bep}
                      onChange={(e) => setSection6((s) => ({ ...s, eskalit_bep: e.target.value }))}
                      className="h-10 text-sm mt-1"
                    />
                  </div>
                </div>
              )}

              {/* Δ — ΕΣΚΑΛΗΤ Β1 */}
              {section6.eisagogi_type === "ΕΣΚΑΛΗΤ Β1" && (
                <div className="border-t border-border pt-3">
                  <Label className="text-xs">ΕΣΚΑΛΗΤ-BEP</Label>
                  <Input
                    value={section6.eskalit_b1_bep}
                    onChange={(e) => setSection6((s) => ({ ...s, eskalit_b1_bep: e.target.value }))}
                    className="h-10 text-sm mt-1"
                  />
                </div>
              )}

              {/* Ε — BCP */}
              {section6.eisagogi_type === "BCP" && (
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                  <div>
                    <Label className="text-xs">BCP Είδος</Label>
                    <Input
                      value={section6.bcp_eidos}
                      onChange={(e) => setSection6((s) => ({ ...s, bcp_eidos: e.target.value }))}
                      className="h-10 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Ball Marker BCP</Label>
                    <Input
                      type="number"
                      value={ballMarkerBcp}
                      onChange={(e) => setBallMarkerBcp(e.target.value)}
                      className="h-10 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Μ/Σ</Label>
                    <Input
                      type="number"
                      value={section6.bcp_ms}
                      onChange={(e) => setSection6((s) => ({ ...s, bcp_ms: e.target.value }))}
                      className="h-10 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">BCP-BEP (υπόγεια)</Label>
                    <Input
                      value={section6.bcp_bep_ypogeia}
                      onChange={(e) => setSection6((s) => ({ ...s, bcp_bep_ypogeia: e.target.value }))}
                      className="h-10 text-sm mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">BCP-BEP (εναέρια)</Label>
                    <Input
                      value={section6.bcp_bep_enaeria}
                      onChange={(e) => setSection6((s) => ({ ...s, bcp_bep_enaeria: e.target.value }))}
                      className="h-10 text-sm mt-1"
                    />
                  </div>
                </div>
              )}

              {/* ΣΤ — FB & Οριζόντια όδευση + Κατειλημμένη υποδομή Cab→BEP */}
              <div className="border-t border-border pt-3 space-y-3">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  FB & Οριζόντια όδευση
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none p-2 rounded-md border border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={Boolean(section6?.fb_same_level_as_bep)}
                      onChange={(e) =>
                        setSection6((s) => ({ ...s, fb_same_level_as_bep: e.target.checked as unknown as string }))
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    <span>FB στο ίδιο επίπεδο με BEP</span>
                  </label>
                  <div>
                    <Label className="text-xs">Οριζόντια μέτρα FB→BEP (m)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={(section6?.horizontal_meters as string) || ""}
                      onChange={(e) => setSection6((s) => ({ ...s, horizontal_meters: e.target.value }))}
                      className="h-10 text-sm mt-1"
                      placeholder="0"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none p-2 rounded-md border border-border bg-muted/30 hover:bg-muted/50 transition-colors md:col-span-2">
                    <input
                      type="checkbox"
                      checked={Boolean(section6?.cab_to_bep_damaged)}
                      onChange={(e) =>
                        setSection6((s) => ({ ...s, cab_to_bep_damaged: e.target.checked as unknown as string }))
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    <span>Κατειλημμένη υποδομή Cab→BEP <span className="text-muted-foreground">(χρεώνει 1980.2 αντί 1980.1)</span></span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Warning αν λείπει floors & δεν είναι μικρό κτίριο */}
      {!isCrewMode && buildingType === "poly" && (parseInt(floors) || 0) === 0 && (
        <div className="rounded-xl border border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center text-base shrink-0">⚠️</div>
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-semibold text-amber-900">Λείπουν όροφοι!</div>
            <div className="text-xs text-amber-800">
              Η τιμολόγηση δεν μπορεί να υπολογίσει κατακόρυφη κόι (1985.2) και κολλήσεις ίνας (1986.3).
              <br />
              <b>Συμπλήρωσε το πεδίο "Όροφοι"</b> στα Τεχνικά Στοιχεία.
            </div>
          </div>
        </div>
      )}

      {/* BCP Warning — αν επέλεξε BCP αλλά δεν έχει συμπληρώσει BCP Είδος */}
      {!isCrewMode &&
        section6?.eisagogi_type === "BCP" &&
        !section6?.bcp_eidos &&
        parseFloat(section6?.bcp_ms || "0") > 0 && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-destructive/20 flex items-center justify-center text-base shrink-0">⚠️</div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-destructive">Λείπει BCP Είδος!</div>
              <div className="text-xs text-muted-foreground">
                Συμπλήρωσε «ΔΗΜΟΣΙΟ» ή «ΙΔΙΩΤΙΚΟ» στο πεδίο BCP Είδος — αλλιώς το σκάμα ΔΕΝ θα χρεωθεί.
              </div>
            </div>
          </div>
        )}

      {/* Work Items - Category based */}
      {lastAutoBillingSummary && (lastAutoBillingSummary.added > 0 || lastAutoBillingSummary.updated > 0) && (
        <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-base shrink-0">✨</div>
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-semibold text-foreground">Αυτόματη καταχώρηση εργασιών</div>
            <div className="text-xs text-muted-foreground">
              {lastAutoBillingSummary.added > 0 && `${lastAutoBillingSummary.added} προστέθηκαν`}
              {lastAutoBillingSummary.added > 0 && lastAutoBillingSummary.updated > 0 && " · "}
              {lastAutoBillingSummary.updated > 0 && `${lastAutoBillingSummary.updated} ενημερώθηκαν`} με βάση το AS-BUILD
            </div>
          </div>
        </div>
      )}

      {!isCrewMode && lastMaterialsAutoSummary && (lastMaterialsAutoSummary.added > 0 || lastMaterialsAutoSummary.updated > 0) && (
        <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-base shrink-0">📦</div>
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-semibold text-foreground">Αυτόματη χρέωση υλικών</div>
            <div className="text-xs text-muted-foreground">
              {lastMaterialsAutoSummary.added > 0 && `${lastMaterialsAutoSummary.added} προστέθηκαν`}
              {lastMaterialsAutoSummary.added > 0 && lastMaterialsAutoSummary.updated > 0 && " · "}
              {lastMaterialsAutoSummary.updated > 0 && `${lastMaterialsAutoSummary.updated} ενημερώθηκαν`} από GIS + Οριζοντογραφία
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("works")}
          className="w-full flex items-center justify-between p-5 hover:bg-muted/40 transition-colors rounded-2xl"
        >
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-2 pointer-events-none"><span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <Wrench className="h-3.5 w-3.5" />
            Εργασίες <span className="text-destructive">*</span>
            {workItems.length > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-1">{workItems.length} εργασίες</Badge>
            )}
          </Label>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openSections.includes("works") ? "rotate-180" : ""}`} />
        </button>
        {openSections.includes("works") && (
        <div className="px-4 pb-4 space-y-2 border-t border-border/50 pt-3">
        <div className="space-y-1">
          {WORK_CATEGORIES.map((cat) => {
            const catWorks = worksByCategory[cat.prefix] || [];
            if (catWorks.length === 0) return null;
            const isOpen = openWorkCategories.includes(cat.prefix);
            const selectedCount = selectedWorkCount(cat.prefix);

            // Auto-suggest based on form state (μόνο όταν δεν έχει επιλεγεί κάτι ήδη στην κατηγορία)
            const suggestionInput: SuggestionInput = {
              building_type: buildingType,
              floors: parseInt(floors) || 0,
              fb_same_level_as_bep: Boolean(section6?.fb_same_level_as_bep),
              distribution_type: (section6?.distribution_type as string) || null,
              distribution_meters: Number(section6?.distribution_meters) || 0,
              cab_to_bep_damaged: Boolean(section6?.cab_to_bep_damaged),
              horizontal_meters: Number(section6?.horizontal_meters) || 0,
              is_aerial: Boolean(section6?.is_aerial),
              aerial_meters: Number(section6?.aerial_meters) || 0,
            };
            const suggested =
              selectedCount === 0 && oteArticlesRaw
                ? suggestArticleForPrefix(cat.prefix, suggestionInput, oteArticlesRaw)
                : null;
            const suggestedItem = suggested
              ? catWorks.find((w: any) => w.code === suggested.code)
              : null;

            // Sum για το header (πόσα € σε αυτή την κατηγορία)
            const catSubtotal = workItems
              .filter((wi) => catWorks.some((cw: any) => cw.id === wi.work_pricing_id))
              .reduce((sum, wi) => sum + wi.unit_price * wi.quantity, 0);

            return (
              <div key={cat.prefix} className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleWorkCategory(cat.prefix)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors min-h-[48px]"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm">{cat.icon}</span>
                  <span className="text-sm font-medium flex-1">{cat.label}</span>
                  <span className="text-xs text-muted-foreground">{catWorks.length}</span>
                  {selectedCount > 0 && (
                    <Badge className="text-[10px] h-5 min-w-[20px] justify-center bg-primary">
                      {selectedCount}
                      {isAdminUser && catSubtotal > 0 && (
                        <span className="ml-1 font-mono">· {catSubtotal.toFixed(2)}€</span>
                      )}
                    </Badge>
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-border bg-muted/20">
                    {/* Suggestion banner */}
                    {suggestedItem && (
                      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b border-amber-200 dark:border-amber-800 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                              Πρόταση από GIS
                            </div>
                            <div className="text-xs text-amber-800 dark:text-amber-300 truncate">
                              {(suggestedItem as any)._short_label || suggestedItem.description}{" "}
                              <span className="font-mono opacity-70">({suggestedItem.code})</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const qty = calculateDefaultQuantity(suggestedItem.code, suggestionInput) || 1;
                              toggleWork(suggestedItem);
                              if (qty > 1) {
                                setTimeout(() => updateWorkQty(suggestedItem.id, qty, suggestedItem.code), 0);
                              }
                              hapticFeedback.success();
                            }}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg active:scale-95 transition-transform min-h-[32px] shrink-0"
                          >
                            Εφαρμογή
                          </button>
                        </div>
                      </div>
                    )}

                    {catWorks.map((w: any) => {
                      const selected = isWorkSelected(w);
                      const qty = getWorkQty(w);
                      const shortLabel = w._short_label || w.description;
                      const annotation = w._user_annotation;
                      const isDefault = w._is_default;
                      return (
                        <div
                          key={w.id}
                          className={`flex items-center gap-2 px-3 py-2.5 border-b border-border/30 last:border-0 transition-colors min-h-[52px] ${
                            selected ? "bg-primary/5" : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleWork(w)}
                            className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              selected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground/30 hover:border-primary"
                            }`}
                          >
                            {selected && <CheckCircle className="h-3 w-3" />}
                          </button>

                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleWork(w)}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold">
                                {shortLabel}
                                {isDefault && <span className="ml-1 text-amber-500">★</span>}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                              <span className="font-mono font-bold text-primary">{w.code}</span>
                              {annotation && (
                                <span className="text-purple-600 dark:text-purple-400">· {annotation}</span>
                              )}
                              {isAdminUser && (
                                <span className="font-mono ml-auto">
                                  {Number(w.unit_price).toFixed(2)}€
                                </span>
                              )}
                            </div>
                          </div>

                          {selected && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => updateWorkQty(w.id, qty - 1, w.code)}
                                className="w-7 h-7 rounded bg-muted flex items-center justify-center hover:bg-muted-foreground/20 active:scale-95"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <Input
                                type="number"
                                min="1"
                                value={qty}
                                onChange={(e) => updateWorkQty(w.id, parseFloat(e.target.value) || 1, w.code)}
                                className="w-12 h-7 text-xs text-center p-0"
                              />
                              <button
                                type="button"
                                onClick={() => updateWorkQty(w.id, qty + 1, w.code)}
                                className="w-7 h-7 rounded bg-muted flex items-center justify-center hover:bg-muted-foreground/20 active:scale-95"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
        )}
      </Card>
      {(!phase || phase === 1 || phase === 2) && <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("materials")}
          className="w-full flex items-center justify-between p-5 hover:bg-muted/40 transition-colors rounded-2xl"
        >
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-2 pointer-events-none"><span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <Package className="h-3.5 w-3.5" />
            Υλικά
            {materialItems.length > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-1">{materialItems.length} υλικά</Badge>
            )}
          </Label>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openSections.includes("materials") ? "rotate-180" : ""}`} />
        </button>
        {openSections.includes("materials") && (
        <div className="px-4 pb-4 space-y-2 border-t border-border/50 pt-3">
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {materialItems.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {oteMaterials.length} ΟΤΕ · {deltanetMaterials.length} {orgName}
            </Badge>
          )}
          {gisData && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={handleManualGisRefill}
              title="Επαναφορτώνει τα υλικά από τα δεδομένα GIS του SR"
            >
              <RefreshCw className="h-3 w-3" />
              Από GIS
            </Button>
          )}
        </div>

        <Tabs value={materialTab} onValueChange={setMaterialTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-9">
            <TabsTrigger value="OTE" className="text-xs gap-1">
              <Badge variant="outline" className="text-[9px] px-1 border-blue-500/30 text-blue-600 h-4">ΟΤΕ</Badge>
              {oteMaterials.length > 0 && <span className="text-primary font-bold">{oteMaterials.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="DELTANETWORK" className="text-xs gap-1">
              <Badge variant="outline" className="text-[9px] px-1 border-orange-500/30 text-orange-600 h-4">{orgName}</Badge>
              {deltanetMaterials.length > 0 && <span className="text-primary font-bold">{deltanetMaterials.length}</span>}
            </TabsTrigger>
          </TabsList>

          {["OTE", "DELTANETWORK"].map((source) => (
            <TabsContent key={source} value={source} className="space-y-1 mt-2">
              {Object.keys(materialsByCategory[source] || {}).length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Δεν υπάρχουν υλικά {source === "OTE" ? "ΟΤΕ" : orgName}</p>
                </div>
              )}
              {Object.entries(materialsByCategory[source] || {}).map(([catLabel, catMats]) => {
                if (!catMats || catMats.length === 0) return null;
                const catKey = `${source}-${catLabel}`;
                const isOpen = openMaterialCategories.includes(catKey);
                const selCount = selectedMaterialCount(source, catLabel);

                return (
                  <div key={catKey} className="border border-border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleMaterialCategory(catKey)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium flex-1">{catLabel}</span>
                      <span className="text-xs text-muted-foreground">{catMats.length}</span>
                      {selCount > 0 && (
                        <Badge className="text-[10px] h-5 min-w-[20px] justify-center bg-primary">
                          {selCount}
                        </Badge>
                      )}
                    </button>

                    {isOpen && (
                      <div className="border-t border-border bg-muted/20">
                        {catMats.map((m) => {
                          const selected = isMaterialSelected(m.id);
                          const qty = getMaterialQty(m.id);
                          return (
                            <div
                              key={m.id}
                              className={`flex items-center gap-2 px-3 py-2 border-b border-border/30 last:border-0 transition-colors ${
                                selected ? "bg-primary/5" : ""
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleMaterial(m)}
                                className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                  selected
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "border-muted-foreground/30 hover:border-primary"
                                }`}
                              >
                                {selected && <CheckCircle className="h-3 w-3" />}
                              </button>

                              <div className="flex-1 min-w-0" onClick={() => toggleMaterial(m)}>
                                <span className="text-xs text-primary font-bold">{m.code}</span>
                                {phase && techInventoryMap.has(m.id) && (
                                  <span className={`text-[10px] ml-1.5 font-bold ${(techInventoryMap.get(m.id) || 0) <= 5 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                    (απόθεμα: {techInventoryMap.get(m.id)} {m.unit})
                                  </span>
                                )}
                                <p className="text-[11px] text-muted-foreground leading-tight truncate">{m.name}</p>
                              </div>

                              {selected && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => updateMaterialQty(m.id, qty - 1)}
                                    className="w-6 h-6 rounded bg-muted flex items-center justify-center hover:bg-muted-foreground/20"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={qty}
                                    onChange={(e) => updateMaterialQty(m.id, parseFloat(e.target.value) || 1)}
                                    className="w-12 h-6 text-xs text-center p-0"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateMaterialQty(m.id, qty + 1)}
                                    className="w-6 h-6 rounded bg-muted flex items-center justify-center hover:bg-muted-foreground/20"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </TabsContent>
          ))}
        </Tabs>

        </div>
        )}
      </Card>}

      {/* Construction Photos - Categorized */}
      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("photos")}
          className="w-full flex flex-col gap-2 p-5 hover:bg-muted/40 transition-colors rounded-2xl"
        >
          <div className="w-full flex items-center justify-between">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-2 pointer-events-none flex-wrap">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <Camera className="h-3.5 w-3.5" />
              Φωτογραφίες Κατασκευής
              {totalPhotos > 0 && (
                <Badge variant="secondary" className="text-[10px] ml-1">{totalPhotos} φωτο</Badge>
              )}
              {phase === 3 && photoChecklist && photoChecklist.total_required > 0 && (
                photoChecklist.all_required_satisfied ? (
                  <Badge className="text-[10px] ml-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
                    ✅ Έτοιμο
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] ml-1 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10">
                    ⚠️ Λείπουν {photoChecklist.missing_required.length} υποχρ.
                  </Badge>
                )
              )}
            </Label>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openSections.includes("photos") ? "rotate-180" : ""}`} />
          </div>
          {phase === 3 && photoChecklist && photoChecklist.total_required > 0 && (() => {
            const pct = Math.round((photoChecklist.total_satisfied / photoChecklist.total_required) * 100);
            const ready = photoChecklist.all_required_satisfied;
            return (
              <div className="w-full flex items-center gap-2 pointer-events-none">
                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${ready ? "bg-emerald-500" : "bg-amber-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-[10px] font-bold tabular-nums shrink-0 ${ready ? "text-emerald-600" : "text-amber-600"}`}>
                  {photoChecklist.total_satisfied}/{photoChecklist.total_required} · {pct}%
                </span>
              </div>
            );
          })()}
        </button>
        {openSections.includes("photos") && (
        <div className="px-5 pb-5 space-y-3.5 border-t border-border/40 pt-4">


        <div className="space-y-2">
          {visiblePhotoCategories.map((cat) => {
            const catPhotos = categorizedPhotos[cat.key] || [];
            const catPreviews = categorizedPreviews[cat.key] || [];
            
            return (
              <div key={cat.key} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {/* Phase 3: status icon based on checklist */}
                    {phase === 3 && checklistByCatKey.get(cat.key) && (() => {
                      const item = checklistByCatKey.get(cat.key)!;
                      if (item.is_satisfied) {
                        return (
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 shrink-0" title="Πληροί τις απαιτήσεις">
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          </span>
                        );
                      }
                      if (item.is_required) {
                        return (
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive/20 text-destructive shrink-0" title="Λείπουν υποχρεωτικές">
                            <X className="h-2.5 w-2.5" strokeWidth={3} />
                          </span>
                        );
                      }
                      return null;
                    })()}
                    <span className="text-sm">{cat.icon}</span>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium">{cat.label}</span>
                        {phase === 3 && checklistByCatKey.get(cat.key) ? (
                          checklistByCatKey.get(cat.key)!.is_required ? (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1">ΥΠΟΧΡ.</Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">(προαιρ.)</span>
                          )
                        ) : mandatoryPhotoKeys.has(cat.key) ? (
                          <Badge variant="destructive" className="text-[9px] h-4 px-1">ΥΠΟΧΡ.</Badge>
                        ) : (
                          cat.workPrefixes.length > 0 && <span className="text-[10px] text-muted-foreground">(προαιρ.)</span>
                        )}
                      </div>
                      {phase === 3 && checklistByCatKey.get(cat.key) && (() => {
                        const item = checklistByCatKey.get(cat.key)!;
                        return (
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {item.current_count}/{item.min_count} φωτογραφίες
                            {item.missing > 0 && item.is_required && (
                              <span className="text-amber-600 font-semibold"> · λείπουν {item.missing}</span>
                            )}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {existingPhotoCounts[cat.key] > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPhotoCategory(
                            expandedPhotoCategory === cat.key ? null : cat.key
                          )
                        }
                        className="flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded-full border border-blue-200 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        ✅ {existingPhotoCounts[cat.key]}
                        <span className="text-[9px] opacity-70">
                          {expandedPhotoCategory === cat.key ? "▲" : "▼"}
                        </span>
                      </button>
                    )}
                    {catPhotos.length > 0 && (
                      <Badge variant="outline" className="text-[10px] h-5">{catPhotos.length} νέες</Badge>
                    )}
                    {/* Gallery input (no capture) */}
                    <input
                      ref={(el) => { fileInputRefs.current[cat.key] = el; }}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleCategoryPhotoSelect(cat.key, e)}
                      className="hidden"
                    />
                    {/* Camera input */}
                    <input
                      ref={(el) => { fileInputRefs.current[`${cat.key}_camera`] = el; }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleCategoryPhotoSelect(cat.key, e)}
                      className="hidden"
                    />
                    <div className="flex gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRefs.current[cat.key]?.click()}
                          className="h-9 text-xs gap-1.5 px-3"
                          title="Από γκαλερί"
                        >
                          📁
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRefs.current[`${cat.key}_camera`]?.click()}
                          className="h-9 text-xs gap-1.5 px-3"
                          title="Κάμερα"
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      </div>
                  </div>
                </div>

                {/* Preview grid: prefer Drive thumbnails, fallback to Storage signed URLs */}
                {(() => {
                  const drivePhotos = drivePhotoUrls[cat.key] || [];
                  const storageUrls = existingPhotoUrls[cat.key] || [];
                  const hasDrive = drivePhotos.length > 0;
                  const hasStorage = storageUrls.length > 0;
                  const isExpanded = expandedPhotoCategory === cat.key;

                  if (!isExpanded) return null;

                  if (hasDrive) {
                    return (
                      <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                          {drivePhotos.map((photo, i) => (
                            <div key={i} className="relative group aspect-square">
                              <img
                                src={photo.thumb}
                                alt={photo.name || `${cat.label} ${i + 1}`}
                                loading="lazy"
                                className="w-full h-full object-cover rounded-lg border border-border cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => window.open(photo.url, "_blank")}
                              />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <div className="bg-black/50 rounded-full p-1.5">
                                  <Maximize2 className="h-3 w-3 text-white" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {existingPhotoCounts[cat.key] > drivePhotos.length && (
                          <p className="text-[10px] text-muted-foreground text-center">
                            +{existingPhotoCounts[cat.key] - drivePhotos.length} ακόμα
                          </p>
                        )}
                      </div>
                    );
                  }

                  if (hasStorage) {
                    return (
                      <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                          {storageUrls.map((url, i) => (
                            <div key={i} className="relative group aspect-square">
                              <img
                                src={url}
                                alt={`${cat.label} ${i + 1}`}
                                className="w-full h-full object-cover rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(url, "_blank")}
                                loading="lazy"
                              />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <div className="bg-black/50 rounded-full p-1.5">
                                  <Maximize2 className="h-3 w-3 text-white" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {existingPhotoCounts[cat.key] > storageUrls.length && (
                          <p className="text-[10px] text-muted-foreground text-center">
                            +{existingPhotoCounts[cat.key] - storageUrls.length} ακόμα
                          </p>
                        )}
                      </div>
                    );
                  }

                  // Loading skeleton when expanded but no URLs yet
                  if (existingPhotoCounts[cat.key] > 0) {
                    return (
                      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                        {Array.from({ length: Math.min(existingPhotoCounts[cat.key], 4) }).map((_, i) => (
                          <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
                        ))}
                      </div>
                    );
                  }

                  return null;
                })()}


                {catPreviews.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {catPreviews.map((preview, i) => {
                      return (
                        <div key={i} className="relative group">
                          <img
                            src={preview}
                            alt={`${cat.label} ${i + 1}`}
                            className="w-full h-20 sm:h-16 object-cover rounded-lg border border-border"
                          />
                          <button
                            type="button"
                            onClick={() => removeCategoryPhoto(cat.key, i)}
                            className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
        )}
      </Card>
      {(!phase || phase === 3) && <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("otdr")}
          className="w-full flex items-center justify-between p-5 hover:bg-muted/40 transition-colors rounded-2xl"
        >
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-2 pointer-events-none"><span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            📊 Μετρήσεις OTDR (PDF)
            {totalOtdrFiles > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-1">{totalOtdrFiles} PDF</Badge>
            )}
          </Label>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${openSections.includes("otdr") ? "rotate-180" : ""}`} />
        </button>
        {openSections.includes("otdr") && (
        <div className="px-5 pb-5 space-y-3.5 border-t border-border/40 pt-4">

        <div className="space-y-2">
          {OTDR_CATEGORIES.map((cat) => {
            const catFiles = otdrFiles[cat.key] || [];
            return (
              <div key={cat.key} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">📊 {cat.label}</span>
                  <div className="flex items-center gap-2">
                    {catFiles.length > 0 && (
                      <Badge variant="outline" className="text-[10px] h-5">{catFiles.length}</Badge>
                    )}
                    <input
                      ref={(el) => { otdrInputRefs.current[cat.key] = el; }}
                      type="file"
                      accept=".pdf,application/pdf"
                      multiple
                      onChange={(e) => handleOtdrSelect(cat.key, e)}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => otdrInputRefs.current[cat.key]?.click()}
                      className="h-7 text-[11px] gap-1 px-2"
                    >
                      PDF
                    </Button>
                  </div>
                </div>
                
                {catFiles.length > 0 && (
                  <div className="space-y-1">
                    {catFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5">
                        <span className="text-muted-foreground">📄</span>
                        <span className="flex-1 truncate">{file.name}</span>
                        <span className="text-muted-foreground">{(file.size / 1024).toFixed(0)}KB</span>
                        <button
                          type="button"
                          onClick={() => removeOtdrFile(cat.key, i)}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
        )}
      </Card>}





      {/* Check Out button */}
      {activeEntry && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-green-600">Σε εξέλιξη...</span>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5 min-h-[40px]"
            onClick={async () => {
              try {
                await checkOut.mutateAsync(undefined);
                toast.success("✅ Check Out επιτυχές!");
              } catch (err: any) {
                toast.error(err.message || "Σφάλμα check-out");
              }
            }}
            disabled={checkOut.isPending}
          >
            <LogOut className="h-3.5 w-3.5" />
            Check Out
          </Button>
        </div>
      )}

      {/* Sticky Submit Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-border p-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <div className="max-w-2xl mx-auto flex gap-2">
          <Button
            variant="secondary"
            onClick={handleSubmit}
            disabled={submitting || completing}
            className="flex-1 py-5 text-sm font-bold gap-2 !bg-amber-600 !text-white border-0"
          >
            {submitting && !completing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {submitProgress || (isCrewMode ? "Αποθήκευση..." : "Υποβολή...")}
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {isCrewMode ? "💾 Αποθήκευση" : "💾 Αποθήκευση"}
              </>
            )}
          </Button>

          {/* Completion button — ONLY admin (no phase) or Phase 3 crew */}
          {!isCrewMode && !phase && (
            <AlertDialog open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={submitting || completing}
                  variant="default"
                  className="flex-1 py-5 text-sm font-bold gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  {completing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {submitProgress || "Ολοκλήρωση..."}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      ✅ Ολοκλήρωση
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Ολοκλήρωση Κατασκευής</AlertDialogTitle>
                  <AlertDialogDescription>
                    Είστε σίγουροι ότι θέλετε να ολοκληρώσετε την κατασκευή για το SR <strong>{assignment.sr_id}</strong>;
                    <br /><br />
                    Θα δημιουργηθεί ο φάκελος πελάτη και θα σταλεί email ολοκλήρωσης.
                    <br /><br />
                    <strong>Αυτή η ενέργεια δεν αναιρείται.</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Ακύρωση</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      completingRef.current = true;
                      setCompleting(true);
                      handleSubmit();
                    }}
                  >
                    Ναι, Ολοκλήρωση
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Phase completion button — for any crew technician with a phase */}
          {phase && (() => {
            const photosBlocked = phase === 3 && photoChecklist && !photoChecklist.all_required_satisfied && !isAdminUser;
            // Building type required για Φάση 2 και 3 (αλλιώς δεν δημιουργείται earning record)
            const buildingTypeBlocked = (phase === 2 || phase === 3) && !buildingType;
            const blocked = photosBlocked || buildingTypeBlocked;
            const missingCount = photoChecklist?.missing_required.length ?? 0;
            return (
              <Button
                onClick={async (e) => {
                  if (buildingTypeBlocked) {
                    e.preventDefault();
                    hapticFeedback.error();
                    toast.error("Επίλεξε πρώτα τύπο κτιρίου", {
                      description: "Χωρίς τύπο κτιρίου δεν μπορεί να καταχωρηθεί η αμοιβή σου.",
                    });
                    // Scroll στο selector
                    document.getElementById("building-type-selector")?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                    return;
                  }
                  if (photosBlocked) {
                    e.preventDefault();
                    hapticFeedback.error();
                    toast.error(`Λείπουν ${missingCount} υποχρεωτικές κατηγορίες φωτογραφιών`, {
                      description: photoChecklist!.missing_required
                        .map((i) => `${i.category_icon} ${i.category_label}`)
                        .join(" · "),
                    });
                    return;
                  }
                  if (phase === 3 && photoChecklist && !photoChecklist.all_required_satisfied && isAdminUser) {
                    setShowOverrideDialog(true);
                    return;
                  }
                  await handleSubmit();
                  const { data: existing } = await supabase
                    .from("constructions")
                    .select("id")
                    .eq("assignment_id", assignment.id)
                    .maybeSingle();
                  if (existing?.id) {
                    const phaseField = `phase${phase}_status`;
                    const phaseDate = `phase${phase}_completed_at`;
                    await supabase
                      .from("constructions")
                      .update({ [phaseField]: "completed", [phaseDate]: new Date().toISOString() } as any)
                      .eq("id", existing.id);
                    toast.success(`✅ Φάση ${phase} ολοκληρώθηκε!`, {
                      description: phase === 2 ? "Η Φάση 3 ξεκλειδώθηκε" : undefined,
                      duration: 4000,
                    });
                    queryClient.invalidateQueries({ queryKey: ["phase-statuses"] });
                    queryClient.invalidateQueries({ queryKey: ["construction-phases"] });
                    queryClient.invalidateQueries({ queryKey: ["phase-status"] });
                  }
                }}
                disabled={submitting || completing || blocked}
                className={`flex-1 py-5 text-sm font-bold gap-2 text-white ${
                  blocked
                    ? "bg-muted-foreground cursor-not-allowed opacity-60"
                    : phase === 1
                    ? "bg-amber-600 hover:bg-amber-700"
                    : phase === 2
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {buildingTypeBlocked ? (
                  <><AlertTriangle className="h-4 w-4" /> Επίλεξε τύπο κτιρίου</>
                ) : photosBlocked ? (
                  <><AlertTriangle className="h-4 w-4" /> Λείπουν {missingCount} φωτογραφίες</>
                ) : (
                  <><CheckCircle className="h-4 w-4" /> ✅ Ολοκλήρωση Φάσης {phase}{phase === 1 ? " — Χωματουργικά" : phase === 2 ? " — Οδεύσεις" : " — Κόλληση"}</>
                )}
              </Button>
            );
          })()}
        </div>
      </div>

      {/* Photo Checklist UI is now embedded in the "Φωτογραφίες Κατασκευής" section header + rows above */}


      {/* Admin Override Dialog */}
      <AlertDialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Παράκαμψη Ελέγχου Φωτογραφιών
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Λείπουν υποχρεωτικές φωτογραφίες. Ως admin μπορείς να ολοκληρώσεις τη φάση παρά ταύτα — η ενέργεια θα καταγραφεί στο audit log.</p>
                {photoChecklist && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 space-y-1">
                    {photoChecklist.missing_required.map((i) => (
                      <p key={i.id} className="text-xs text-amber-700">• {i.category_icon} {i.category_label} — λείπουν {i.missing}</p>
                    ))}
                  </div>
                )}
                <div>
                  <Label className="text-xs">Λόγος παράκαμψης (υποχρεωτικός)</Label>
                  <Textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="π.χ. Φωτογραφίες έχουν ήδη παραδοθεί χειροκίνητα στον πελάτη..."
                    rows={3}
                    className="mt-1"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOverrideReason("")}>Ακύρωση</AlertDialogCancel>
            <AlertDialogAction
              disabled={overrideReason.trim().length < 5}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={async () => {
                try {
                  const { data: existing } = await supabase
                    .from("constructions")
                    .select("id")
                    .eq("assignment_id", assignment.id)
                    .maybeSingle();
                  await supabase.from("completion_overrides").insert({
                    organization_id: organizationId,
                    construction_id: existing?.id || null,
                    assignment_id: assignment.id,
                    sr_id: assignment.sr_id,
                    phase: phase!,
                    overridden_by: (await supabase.auth.getUser()).data.user?.id!,
                    reason: overrideReason.trim(),
                    missing_categories: photoChecklist?.missing_required.map((i) => ({
                      key: i.category_key,
                      label: i.category_label,
                      missing: i.missing,
                    })) || [],
                  });
                  await handleSubmit();
                  if (existing?.id) {
                    await supabase
                      .from("constructions")
                      .update({ [`phase${phase}_status`]: "completed", [`phase${phase}_completed_at`]: new Date().toISOString() } as any)
                      .eq("id", existing.id);
                  }
                  toast.success(`Φάση ${phase} ολοκληρώθηκε με παράκαμψη`, { description: "Καταγράφηκε στο audit log" });
                  queryClient.invalidateQueries({ queryKey: ["phase-statuses"] });
                  setShowOverrideDialog(false);
                  setOverrideReason("");
                } catch (err: any) {
                  toast.error(err.message || "Σφάλμα παράκαμψης");
                }
              }}
            >
              Ολοκλήρωση με παράκαμψη
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mandatory photos warning (Phase 3 crew before completion) */}
      {isCrewMode && phase === 3 && !mandatoryPhotosValid && mandatoryPhotoKeys.size > 0 && (
        <Alert className="border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertTitle className="text-xs font-semibold text-destructive">Υποχρεωτικές φωτογραφίες</AlertTitle>
          <AlertDescription className="text-xs text-destructive/80">
            {`Λείπουν φωτογραφίες: ${missingMandatoryCategories.join(", ")}`}
          </AlertDescription>
        </Alert>
      )}

      {/* Spacer for sticky bar */}
      <div className="h-20" />

      {/* Floating Camera Button (FAB) — Phase 1/2/3 only */}
      {phase && visiblePhotoCategories.length > 0 && (
        <>
          <div className="fixed bottom-24 right-4 z-50" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
            <Button
              type="button"
              onClick={() => setShowCameraSheet(true)}
              className="h-14 w-14 rounded-full shadow-xl gap-0 p-0 bg-primary hover:bg-primary/90"
              aria-label="Φωτογραφία"
            >
              <Camera className="h-6 w-6" />
            </Button>
          </div>
          <Sheet open={showCameraSheet} onOpenChange={setShowCameraSheet}>
            <SheetContent side="bottom" className="rounded-t-2xl pb-8">
              <SheetHeader className="mb-4">
                <SheetTitle className="text-base">📸 Φωτογραφία — Επίλεξε Κατηγορία</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                {visiblePhotoCategories.map((cat) => {
                  const existingCount = existingPhotoCounts[cat.key] || 0;
                  const newCount = (categorizedPhotos[cat.key] || []).length;
                  const totalCount = existingCount + newCount;
                  const isMandatory = mandatoryPhotoKeys.has(cat.key);
                  const hasPhotos = totalCount > 0;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => {
                        setShowCameraSheet(false);
                        setTimeout(() => {
                          fileInputRefs.current[`${cat.key}_camera`]?.click();
                        }, 300);
                      }}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        hasPhotos
                          ? "border-green-500/30 bg-green-500/5"
                          : isMandatory
                          ? "border-destructive/30 bg-destructive/5"
                          : "border-border bg-muted/30"
                      }`}
                    >
                      <span className="text-2xl">{cat.icon}</span>
                      <span className="text-xs font-medium text-center leading-tight">{cat.label}</span>
                      {hasPhotos ? (
                        <span className="text-[10px] text-green-600 font-bold">✅ {totalCount} φωτο</span>
                      ) : isMandatory ? (
                        <span className="text-[10px] text-destructive font-bold">ΥΠΟΧΡ.</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}

    </div>
  );
};

export default ConstructionForm;
