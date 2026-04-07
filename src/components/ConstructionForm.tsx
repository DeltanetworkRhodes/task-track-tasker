import { useState, useMemo, useRef, useEffect, useCallback } from "react"; // BEP door fix v2
import { uploadPhotoDrive } from "@/lib/driveUpload";
import { hapticFeedback } from "@/lib/haptics";
import { compressImage } from "@/lib/imageCompression";
import { applyWatermark, type WatermarkData } from "@/lib/watermark";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTimeTracking } from "@/hooks/useTimeTracking";
import { Trash2, Loader2, CheckCircle, HardHat, Package, Wrench, Camera, X, ChevronDown, ChevronRight, Plus, Minus, MapPin, Route, AlertTriangle, Save, GitMerge, Building2, Copy, LogOut } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

import { isOnline, enqueueConstruction, fileToOfflineFile, type OfflineConstructionPayload } from "@/lib/offlineQueue";

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
}

// Category definitions for works based on code prefix
const WORK_CATEGORIES: { prefix: string; label: string; icon: string }[] = [
  { prefix: "1956", label: "Αυτοψία", icon: "🔍" },
  { prefix: "1991", label: "BCP – Σκάψιμο έως BCP", icon: "⛏️" },
  { prefix: "1993", label: "BCP – Από BCP έως BEP", icon: "🔗" },
  { prefix: "1963", label: "BEP – ΕΣΚΑΛΙΤ σωλήνωση", icon: "🕳️" },
  { prefix: "1965", label: "BEP – Σκάψιμο έως BEP", icon: "⛏️" },
  { prefix: "1970", label: "BEP – Τοποθέτηση BEP/ΚΟΙ", icon: "📦" },
  { prefix: "1984", label: "FB–BEP στο ίδιο επίπεδο", icon: "↔️" },
  { prefix: "1985", label: "FB – Τοποθέτηση & Κατακόρυφη ΚΟΙ", icon: "📋" },
  { prefix: "1986", label: "FB – Κολλήσεις & Διασυνδέσεις", icon: "🔧" },
  { prefix: "1980", label: "Εμφύσηση CAB", icon: "💨" },
  { prefix: "1955", label: "Γ' Φάση – Σύνδεση Πελάτη", icon: "👤" },
  { prefix: "1930", label: "Διασύνδεση Σωληνίσκου Φρεατίου", icon: "🔗" },
];

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

const ConstructionForm = ({ assignment, onComplete, filterPhotoCatKeys, crewAssignmentIds, isCrewMode, filterWorkPrefixes, filterMaterialCodes }: Props) => {
  const { user } = useAuth();
  const { organizationId, organization } = useOrganization();
  const orgName = organization?.name || "DELTANETWORK";
  const queryClient = useQueryClient();
  
  const { activeEntry, checkOut } = useTimeTracking(assignment.id);




  // Form state
  const [sesId, setSesId] = useState("");
  const [ak, setAk] = useState("");
  const [cab, setCab] = useState(assignment.cab || "");
  const [floors, setFloors] = useState("0");
  const [routingType, setRoutingType] = useState("");
  const [pendingNote, setPendingNote] = useState("");

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

  const totalKoi = routes.reduce((sum, r) => sum + (parseFloat(r.koi) || 0), 0);
  const totalFyraKoi = routes.reduce((sum, r) => sum + (parseFloat(r.fyraKoi) || 0), 0);

  // Work items
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [openWorkCategories, setOpenWorkCategories] = useState<string[]>([]);

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
  const selectedWorkPrefixes = new Set(workItems.map((w) => WORK_CATEGORIES.find((c) => w.code.startsWith(c.prefix))?.prefix).filter(Boolean));

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

  // In crew mode, show filtered categories with alias support (fallback: show all)
  // In normal mode, show categories based on selected works
  const visiblePhotoCategories = filterPhotoCatKeys
    ? (crewFilteredPhotoCategories.length > 0 ? crewFilteredPhotoCategories : ALL_PHOTO_CATEGORIES)
    : ALL_PHOTO_CATEGORIES.filter((cat) =>
        cat.workPrefixes.length === 0 ||
        cat.workPrefixes.some((p) => selectedWorkPrefixes.has(p)) ||
        (existingPhotoCounts[cat.key] || 0) > 0
      );

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

  const fbOtdrCategories = useMemo(() => {
    const count = Math.max(0, Math.round(totalFbCharged));
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
  }, [totalFbCharged]);

  const OTDR_CATEGORIES = useMemo(() => {
    const allOtdr = [
      OTDR_CATEGORIES_STATIC[0], // BMO
      ...fbOtdrCategories,
      ...OTDR_CATEGORIES_STATIC.slice(1), // ΚΑΜΠΙΝΑ, BEP, BCP, LIVE
    ];

    if (!filterPhotoCatKeys) return allOtdr;
    if (allowAllOtdrInCrewMode) return allOtdr;

    const crewFilteredOtdr = allOtdr.filter((otdr) => {
      if (otdr.key === "LIVE") return true;
      if (otdr.key.startsWith("FB_")) return normalizedCrewPhotoKeys.has("FB");
      return normalizedCrewPhotoKeys.has(otdr.key);
    });

    // If filters from DB were malformed, keep OTDR visible instead of hiding everything.
    return crewFilteredOtdr.length > 1 ? crewFilteredOtdr : allOtdr;
  }, [fbOtdrCategories, filterPhotoCatKeys, normalizedCrewPhotoKeys, allowAllOtdrInCrewMode]);

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

  // Hydrate base form fields from saved construction so edits persist across reopen/save cycles
  useEffect(() => {
    if (existingConstructionLoaded || !existingConstruction) return;

    setSesId(existingConstruction.ses_id || "");
    setAk(existingConstruction.ak || "");
    setCab(existingConstruction.cab || assignment.cab || "");
    setFloors(String(existingConstruction.floors ?? 0));
    setRoutingType(existingConstruction.routing_type || "");
    setPendingNote(existingConstruction.pending_note || "");

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

    // Prevent GIS defaults from overriding persisted values
    setGisFieldsFilled(true);
    setGisAutoFilled(true);
    setExistingConstructionLoaded(true);
  }, [existingConstruction, existingConstructionLoaded, assignment.cab]);

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
    setExistingMaterialsLoaded(true);
    setGisAutoFilled(true);
  }, [existingMaterials, existingMaterialsLoaded]);

  // Load uploaded file counters for already-saved construction (including ΣΚΑΜΑ/ΟΔΕΥΣΗ)
  useEffect(() => {
    if (!existingConstruction?.id) {
      setExistingPhotoCounts({});
      setExistingOtdrCounts({});
      return;
    }

    let cancelled = false;

    const loadExistingFileCounts = async () => {
      const safeSrId = assignment.sr_id.replace(/[^a-zA-Z0-9_-]/g, "_");
      const storagePrefix = `constructions/${safeSrId}/${existingConstruction.id}`;

      const { data: folders, error } = await supabase.storage.from("photos").list(storagePrefix);

      const photoCounts: Record<string, number> = {};
      const otdrCounts: Record<string, number> = {};

      if (!error && folders && !cancelled) {
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

      // Fallback 2: If still no photo counts and assignment has drive_folder_url, fetch from Google Drive
      const hasAnyPhotoCounts = Object.values(photoCounts).some(c => c > 0);
      if (!hasAnyPhotoCounts && assignment.drive_folder_url && !cancelled) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token) {
            const driveRes = await supabase.functions.invoke("google-drive-files", {
              body: { action: "sr_folder", sr_id: assignment.sr_id },
            });
            
            if (driveRes.data?.found && driveRes.data?.subfolders) {
              const driveFolderToCategory: Record<string, string> = {
                "ΣΚΑΜΑ": "ΣΚΑΜΑ", "ΣΚΑΜΜΑ": "ΣΚΑΜΑ", "SKAMA": "ΣΚΑΜΑ", "ΣΚΆΜΑ": "ΣΚΑΜΑ",
                "ΟΔΕΥΣΗ": "ΟΔΕΥΣΗ", "ODEFSI": "ΟΔΕΥΣΗ", "ΌΔΕΥΣΗ": "ΟΔΕΥΣΗ",
                "BCP": "BCP", "BEP": "BEP", "BMO": "BMO", "FB": "FB",
                "FLOOR BOX": "FB", "FLOORBOX": "FB",
                "ΚΑΜΠΙΝΑ": "ΚΑΜΠΙΝΑ", "ΚΑΜΠΊΝΑ": "ΚΑΜΠΙΝΑ", "KAMPINA": "ΚΑΜΠΙΝΑ",
                "Γ_ΦΑΣΗ": "Γ_ΦΑΣΗ", "Γ ΦΑΣΗ": "Γ_ΦΑΣΗ", "G_FASI": "Γ_ΦΑΣΗ", "Γ' ΦΑΣΗ": "Γ_ΦΑΣΗ", "Γ' ΦΆΣΗ": "Γ_ΦΑΣΗ",
              };

              const normalizeFolderName = (name: string): string => {
                return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
              };

              for (const [folderName, folderData] of Object.entries(driveRes.data.subfolders as Record<string, any>)) {
                // Try exact match, then uppercase, then normalized (accent-stripped)
                let categoryKey = driveFolderToCategory[folderName] || driveFolderToCategory[folderName.toUpperCase()];
                if (!categoryKey) {
                  const normalized = normalizeFolderName(folderName);
                  categoryKey = Object.entries(driveFolderToCategory).find(
                    ([k]) => normalizeFolderName(k) === normalized
                  )?.[1] || "";
                }
                if (categoryKey && folderData.files?.length > 0) {
                  const imageCount = folderData.files.filter((f: any) =>
                    f.mimeType?.startsWith("image/")
                  ).length;
                  if (imageCount > 0) {
                    photoCounts[categoryKey] = imageCount;
                  }
                }
              }

              // Save the discovered counts back to the construction record for future use
              const drivePhotoCounts = { ...photoCounts };
              if (Object.keys(drivePhotoCounts).length > 0) {
                await supabase
                  .from("constructions")
                  .update({ photo_counts: drivePhotoCounts } as any)
                  .eq("id", existingConstruction.id);
              }
            }
          }
        } catch (driveErr) {
          console.warn("Drive fallback for photo counts failed:", driveErr);
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

  // Fetch work pricing
  const { data: workPricing } = useQuery({
    queryKey: ["work_pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_pricing")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

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

  // Auto-fill OTE materials from GIS data (ONLY if no saved materials exist in DB)
  const [gisAutoFilled, setGisAutoFilled] = useState(false);
  useEffect(() => {
    const hasExistingConstruction = !!existingConstruction;
    const hasExistingSavedMaterials = (existingMaterials?.length || 0) > 0;
    const existingMaterialLookupReady = !existingConstruction ? existingConstructionFetched : existingMaterialsFetched;

    // Skip GIS auto-fill if: DB lookup not finished, already done, no GIS data/material catalog,
    // user already has items, OR this assignment already has persisted construction data
    if (!existingMaterialLookupReady || !gisData || !materials || gisAutoFilled || materialItems.length > 0 || hasExistingSavedMaterials || hasExistingConstruction) return;
    
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

    // Helper: flexible material name matching (case-insensitive, multiple patterns)
    const nameMatches = (name: string, ...patterns: string[]) => {
      const upper = name.toUpperCase();
      return patterns.every((p) => upper.includes(p.toUpperCase()));
    };

    // 1. BEP - match size from bep_type (e.g. "MEDIUM/12/ZTT (01..12)")
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
      // Also try matching by capacity number
      const capMatch = bepSize.match(/\/(\d+)\//);
      if (capMatch && autoItems.length === 0) {
        addMaterial((m) => nameMatches(m.name, "BEP") && m.name.includes(capMatch[1]), 1);
      }
    }

    // 2. BMO - match size from bmo_type (e.g. "SMALL/16/RAYCAP")
    if (gisData.bmo_type) {
      const bmoSize = gisData.bmo_type.toUpperCase();
      if (bmoSize.includes("SMALL")) {
        addMaterial((m) => nameMatches(m.name, "SMALL", "BMO"), 1);
      } else if (bmoSize.includes("MEDIUM")) {
        addMaterial((m) => nameMatches(m.name, "MEDIUM", "BMO"), 1);
      } else if (bmoSize.includes("X-LARGE") || bmoSize.includes("XLARGE")) {
        addMaterial((m) => nameMatches(m.name, "X-LARGE", "BMO") || nameMatches(m.name, "XLARGE", "BMO"), 1);
      } else if (bmoSize.includes("LARGE")) {
        addMaterial((m) => nameMatches(m.name, "LARGE", "BMO") && !nameMatches(m.name, "X-LARGE") && !nameMatches(m.name, "XLARGE"), 1);
      }
    }

    // 3. Floor Boxes - count from floor_details (scan ALL keys for FB patterns)
    const floorDetails = (gisData.floor_details as any[]) || [];
    let fb4Total = 0;
    let fb12Total = 0;
    let fbGenericTotal = 0;

    for (const fd of floorDetails) {
      const row = fd.raw && typeof fd.raw === "object" ? fd.raw : fd;
      const keys = Object.keys(row);
      
      // Scan all keys for FB-related columns
      for (const key of keys) {
        const upperKey = key.toUpperCase().trim();
        
        // Match keys like "FB01", "FB 01", "FB1", "FB02", "FLOOR BOX", etc.
        const isFbKey = /^FB\s?\d+$/i.test(upperKey) || upperKey === "FB" || upperKey === "FLOOR BOX" || upperKey === "FLOORBOX";
        const isFbCountKey = /^(FB\s?\d+|FLOOR\s?BOX)$/i.test(upperKey);
        
        if (isFbKey || isFbCountKey) {
          const val = parseInt(String(row[key])) || 0;
          if (val <= 0) continue;
          
          // Find corresponding TYPE key
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
            fbGenericTotal += val; // Will default to 4-port
          }
        }
      }
      
      // Fallback: if no specific FB keys found, check if this floor row has any FB indication
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

    // If no FB counts found from columns, count floors that have FB data (1 FB per floor as minimum)
    if (fb4Total === 0 && fb12Total === 0 && fbGenericTotal === 0 && floorDetails.length > 0) {
      // Each floor typically gets at least 1 FB
      fbGenericTotal = floorDetails.length;
    }

    fb4Total += fbGenericTotal; // Default generic FBs to 4-port
    
    if (fb4Total > 0) {
      addMaterial((m) => nameMatches(m.name, "FLOOR", "BOX", "4") || nameMatches(m.name, "FB", "4"), fb4Total);
      // Fallback: any floor box material
      if (!autoItems.some((a) => nameMatches(a.name, "FLOOR") || nameMatches(a.name, "FB"))) {
        addMaterial((m) => nameMatches(m.name, "FLOOR", "BOX") || (nameMatches(m.name, "FB") && !nameMatches(m.name, "BEP")), fb4Total);
      }
    }
    if (fb12Total > 0) {
      addMaterial((m) => nameMatches(m.name, "FLOOR", "BOX", "12") || nameMatches(m.name, "FB", "12"), fb12Total);
      if (!autoItems.some((a) => (nameMatches(a.name, "FLOOR") || nameMatches(a.name, "FB")) && a.name.includes("12"))) {
        addMaterial((m) => nameMatches(m.name, "FLOOR", "BOX") || (nameMatches(m.name, "FB") && !nameMatches(m.name, "BEP")), fb12Total);
      }
    }

    // 4. Splitter from bep_template (e.g. "BEP 1SP 1:8(01..12)")
    if (gisData.bep_template) {
      const tmpl = gisData.bep_template.toUpperCase();
      if (tmpl.includes("1:8")) {
        addMaterial((m) => nameMatches(m.name, "SPLITTER") && m.name.includes("1:8"), 1);
      } else if (tmpl.includes("1:4")) {
        addMaterial((m) => nameMatches(m.name, "SPLITTER") && m.name.includes("1:4"), 1);
      } else if (tmpl.includes("1:2")) {
        addMaterial((m) => nameMatches(m.name, "SPLITTER") && m.name.includes("1:2"), 1);
      } else if (tmpl.includes("1:16")) {
        addMaterial((m) => nameMatches(m.name, "SPLITTER") && m.name.includes("1:16"), 1);
      }
    }

    // 5. BCP from GIS (nearby_bcp, new_bcp, associated_bcp)
    if (gisData.nearby_bcp || gisData.new_bcp) {
      addMaterial((m) => nameMatches(m.name, "BCP"), 1);
    }

    // 6. Nanotronix / Smart readiness
    if (gisData.nanotronix) {
      addMaterial((m) => nameMatches(m.name, "NANOTRONIX") || nameMatches(m.name, "NANO"), 1);
    }

    if (autoItems.length > 0) {
      setMaterialItems(autoItems);
      setMaterialTab("OTE");
      setGisAutoFilled(true);
      toast.success(`✅ Αυτόματη χρέωση ${autoItems.length} υλικών από GIS (${fb4Total + fb12Total} FB, ${gisData.bep_type ? 'BEP: ' + gisData.bep_type : ''} ${gisData.bmo_type ? 'BMO: ' + gisData.bmo_type : ''})`, { duration: 6000 });
    } else if (gisData) {
      console.log("GIS auto-fill: no matching materials found. GIS data:", {
        bep_type: gisData.bep_type,
        bmo_type: gisData.bmo_type,
        bep_template: gisData.bep_template,
        floor_details: gisData.floor_details,
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
  ]);

  // Auto-fill basic fields from GIS data
  const [gisFieldsFilled, setGisFieldsFilled] = useState(false);
  useEffect(() => {
    if (!gisData || gisFieldsFilled || !!existingConstruction) return;

    // CAB from assignment or GIS associated_bcp
    if (!cab && gisData.associated_bcp) {
      setCab(gisData.associated_bcp);
    }

    // Floors
    if (gisData.floors && floors === "0") {
      setFloors(String(gisData.floors));
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
      const cat = WORK_CATEGORIES.find((c) => w.code.startsWith(c.prefix));
      if (cat) {
        // Skip categories not in allowed prefixes (crew mode)
        if (allowedPrefixes && !allowedPrefixes.some((p) => w.code.startsWith(p))) continue;
        if (!groups[cat.prefix]) groups[cat.prefix] = [];
        groups[cat.prefix].push(w);
      } else {
        if (!allowedPrefixes) uncategorized.push(w);
      }
    }
    if (uncategorized.length > 0) groups["other"] = uncategorized;
    return groups;
  }, [workPricing, filterWorkPrefixes]);

  // Group materials by category
  const materialsByCategory = useMemo(() => {
    if (!materials) return {};
    const groups: Record<string, Record<string, typeof materials>> = { OTE: {}, DELTANETWORK: {} };
    
    // In crew mode, filter to only allowed material codes
    const allowedCodes = filterMaterialCodes && filterMaterialCodes.length > 0 ? new Set(filterMaterialCodes) : null;
    
    for (const m of materials) {
      // Skip materials not in allowed codes (crew mode)
      if (allowedCodes && !allowedCodes.has(m.code)) continue;
      
      const source = m.source as "OTE" | "DELTANETWORK";
      if (!groups[source]) groups[source] = {};
      
      const cat = MATERIAL_CATEGORIES.find((c) => c.match(m.name, m.code));
      const catLabel = cat?.label || "Λοιπά";
      if (!groups[source][catLabel]) groups[source][catLabel] = [];
      groups[source][catLabel].push(m);
    }
    return groups;
  }, [materials, filterMaterialCodes]);

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
  const isWorkSelected = (id: string) => workItems.some((w) => w.work_pricing_id === id);
  const getWorkQty = (id: string) => workItems.find((w) => w.work_pricing_id === id)?.quantity || 0;
  
  const isMaterialSelected = (id: string) => materialItems.some((m) => m.material_id === id);
  const getMaterialQty = (id: string) => materialItems.find((m) => m.material_id === id)?.quantity || 0;

  // Toggle work item
  const toggleWork = (w: any) => {
    if (isWorkSelected(w.id)) {
      setWorkItems((prev) => prev.filter((wi) => wi.work_pricing_id !== w.id));
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
  const updateWorkQty = (id: string, qty: number) => {
    if (qty < 1) qty = 1;
    setWorkItems((prev) => prev.map((w) => (w.work_pricing_id === id ? { ...w, quantity: qty } : w)));
  };
  const updateMaterialQty = (id: string, qty: number) => {
    if (qty < 1) qty = 1;
    setMaterialItems((prev) => prev.map((m) => (m.material_id === id ? { ...m, quantity: qty } : m)));
  };

  // compressImage imported from shared utility

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

        const routesData = routes
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

        // Insert works
        if (workItems.length > 0) {
          const { error: worksError } = await supabase.from("construction_works").insert(
            workItems.map((w) => ({
              construction_id: constructionId,
              work_pricing_id: w.work_pricing_id,
              quantity: w.quantity,
              unit_price: w.unit_price,
              subtotal: w.unit_price * w.quantity,
              organization_id: organizationId,
            }))
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

        toast.success("✅ Αποθηκεύτηκε επιτυχώς!");
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

    // ═══════ ONLINE BRANCH (unchanged) ═══════
    setSubmitting(true);
    try {
      setSubmitProgress("Καταχώρηση κατασκευής...");

      const routesData = routes
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
        status: "completed",
        routing_type: routingType.trim() || null,
        pending_note: pendingNote.trim() || null,
        routes: routesData.length > 0 ? routesData : null,
        organization_id: organizationId,
        photo_counts: mergedPhotoCounts,
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
        const { error: worksError } = await supabase.from("construction_works").insert(
          workItems.map((w) => ({
            construction_id: constructionId,
            work_pricing_id: w.work_pricing_id,
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

      toast.success("Η κατασκευή καταχωρήθηκε επιτυχώς!");
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["constructions"] });
      queryClient.invalidateQueries({ queryKey: ["existing_construction", assignment.id] });
      queryClient.invalidateQueries({ queryKey: ["existing_construction_works"] });
      queryClient.invalidateQueries({ queryKey: ["existing_construction_materials"] });
      setTimeout(() => onComplete(), 2000);
    } catch (err: any) {
      console.error(err);
      toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setSubmitting(false);
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
    return catWorks.filter((w) => isWorkSelected(w.id)).length;
  };

  const selectedMaterialCount = (source: string, catLabel: string) => {
    const catMats = materialsByCategory[source]?.[catLabel] || [];
    return catMats.filter((m) => isMaterialSelected(m.id)).length;
  };

  return (
    <div className="space-y-4 pb-8">
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <HardHat className="h-5 w-5" />
        {isCrewMode ? "Κατασκευή – Η Δουλειά μου" : "Φόρμα Κατασκευής"}
      </h2>

      {/* Technical Details */}
      {!isCrewMode && <Card className="p-4 space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Τεχνικά Στοιχεία
        </Label>
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
        </div>
      </Card>}

      {/* GIS: Δομή Κτιρίου */}
      {gisData && Array.isArray(gisData.floor_details) && (gisData.floor_details as any[]).length > 0 && (
        <Card className="p-4 space-y-3 border-primary/20 bg-primary/5">
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
            {(gisData.floor_details as any[]).map((f: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-2 border border-border rounded-md bg-background text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">Όροφος {f["ΟΡΟΦΟΣ"] || "-"}</span>
                  <span className="text-xs text-muted-foreground">
                    {f["ΔΙΑΜΕΡΙΣΜΑΤΑ"] || "0"} διαμ. / {f["ΚΑΤΑΣΤΗΜΑΤΑ"] || "0"} κατ.
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {["FB01", "FB02", "FB03", "FB04"].map((fbKey) => {
                    const count = parseInt(f[fbKey]) || 0;
                    const type = f[`${fbKey} TYPE`] || "";
                    if (count <= 0 && !type) return null;
                    return (
                      <div key={fbKey} className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[10px]">{type || fbKey}</Badge>
                        <span className="text-muted-foreground">×{count}</span>
                      </div>
                    );
                  })}
                  {f["FB ΠΕΛΑΤΗ"] && <span className="text-primary font-medium">👤 {f["FB ΠΕΛΑΤΗ"]}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* GIS: Οδηγίες Κόλλησης ανά Όροφο */}
      {!isCrewMode && gisData && Array.isArray(gisData.optical_paths) && (gisData.optical_paths as any[]).length > 0 && (
        <Card className="p-4 space-y-3 border-accent/30 bg-accent/5">
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
                   
                   // --- BEP fiber pair mapping for BEP door label ---
                   // Each pair (e.g. 01a/01b) maps to: ΟΡΙΑ (CAB-BEP), floor (BEP-BMO), or ΕΦΕΔ (spare BEP)
                   const bepPairMap: Record<number, string> = {}; // pair number → label

                   // 1. CAB-BEP pairs → ΟΡΙΑ
                   for (const p of cabBepPaths) {
                     const pathStr = p["OPTICAL PATH"] || "";
                     const m = pathStr.match(/_BEP\d+(?:\([^)]+\))?_(\d+)[a-z]/i);
                     if (m) bepPairMap[parseInt(m[1], 10)] = "ΟΡΙΑ";
                   }

                   // 2. BEP-BMO pairs → floor (via BMO port → bmoPortToFloor)
                   // Handle SB splitter notation: BEP01_SB01(1:8).01_03a_BMO01_1
                   const bepToBmo: Record<number, number> = {};
                   for (const p of bepBmoPaths) {
                     const pathStr = p["OPTICAL PATH"] || "";
                     // Extract fiber pair number (before a/b) and BMO port
                     const m = pathStr.match(/_(\d+)[a-z]_BMO\d+_(\d+)/i);
                     if (m) {
                       const pairNum = parseInt(m[1], 10);
                       const bmoPort = parseInt(m[2], 10);
                       bepToBmo[pairNum] = bmoPort;
                       const floor = bmoPortToFloor[bmoPort];
                       if (floor) bepPairMap[pairNum] = floorShort(floor);
                     }
                   }

                   // 3. BEP spare paths → ΕΦΕΔ
                   for (const p of bepPaths) {
                     const pathStr = p["OPTICAL PATH"] || "";
                     const m = pathStr.match(/_(\d+)[a-z]$/i);
                     if (m) {
                       const pairNum = parseInt(m[1], 10);
                       if (!bepPairMap[pairNum]) bepPairMap[pairNum] = "ΕΦΕΔ";
                     }
                   }

                   // 4. Fallback: if no pair data from paths, use floor_details
                   if (Object.keys(bepPairMap).length === 0 && floorDetailsArr.length > 0) {
                     let pairCounter = 1;
                     // First, count CAB-BEP fibers to reserve ΟΡΙΑ pairs
                     const cabFiberPairCount = Math.ceil(cabFiberNums.length / 2);
                     for (let i = 0; i < cabFiberPairCount; i++) {
                       bepPairMap[pairCounter++] = "ΟΡΙΑ";
                     }
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
                       if (apts === 0) continue; // Skip floors with 0 apartments
                       for (let a = 0; a < apts; a++) {
                         bepPairMap[pairCounter++] = floorShort(fd.floor);
                       }
                     }
                   }

                   // Build sorted pair list for BEP door
                   const bepDoorPairs = Object.entries(bepPairMap)
                     .map(([pair, label]) => ({ pair: parseInt(pair, 10), label }))
                     .sort((a, b) => a.pair - b.pair);

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

                   const LabelLine = ({ text, bold }: { text: string; bold?: boolean }) => (
                     <div className={`relative group text-center text-xs whitespace-pre-line ${bold ? "font-bold" : ""} text-foreground bg-muted/50 rounded px-2 py-1.5 border border-border`}>
                       {text}
                       <button
                         type="button"
                         onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied!"); }}
                         className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                       >
                         <Copy className="h-3 w-3 text-muted-foreground" />
                       </button>
                     </div>
                   );

                   // Multi-line label with copy
                   const LabelBlock = ({ lines }: { lines: string[] }) => (
                     <div className="relative group space-y-0.5 text-center text-xs font-bold text-foreground bg-muted/50 rounded px-2 py-2 border border-border">
                       {lines.map((line, i) => <div key={i}>{line}</div>)}
                       <button
                         type="button"
                         onClick={() => { navigator.clipboard.writeText(lines.join("\n")); toast.success("Copied!"); }}
                         className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                       >
                         <Copy className="h-3 w-3 text-muted-foreground" />
                       </button>
                     </div>
                   );

                    return !isCrewMode ? (
                      <div className="space-y-2 mt-3 pt-3 border-t border-border">
                       <div className="flex items-center gap-2">
                         <Badge variant="default" className="text-[10px]">🏷️ Labels</Badge>
                         <span className="text-[10px] text-muted-foreground">Αυτοκόλλητα — COSMOTE specs</span>
                       </div>

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
                                  {/* Individual A/B paired floor labels */}
                                  {(() => {
                                    const individualLabels: string[] = [];
                                    for (const item of bepDoorPairs) {
                                      individualLabels.push(`A${item.pair} B${item.pair} - ${item.label}`);
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

                            {/* B. Εσωτερικά BMO — feed + range + departures */}
                             <LabelBox label="B. Εσωτερικά BMO">
                               <div className="space-y-1">
                                 {/* Feed source + range */}
                                 {(() => {
                                   const feedLine = `${cabName} - ${fiberCount}`;
                                   const rangeLine = fiberRange ? fiberRange.replace("-", " - ") : "";
                                   const fbLines = Object.entries(fbGroups).sort(([a], [b]) => a.localeCompare(b)).map(([, fb]) => {
                                     const fl = fb.floor.startsWith("+") || fb.floor.startsWith("-") ? fb.floor : `+${fb.floor}`;
                                     return `FB(${fl}) ${floorFO(fb.floor)}`;
                                   });
                                   const allLines = [feedLine, ...(rangeLine ? [rangeLine] : []), "", ...fbLines];
                                   return (
                                     <div className="relative group font-mono text-[11px] font-semibold bg-muted/50 rounded-md px-3 py-1.5 border border-border text-center space-y-0.5">
                                       <div>{feedLine}</div>
                                       {rangeLine && <div>{rangeLine}</div>}
                                       <div className="border-t border-border my-1" />
                                       {fbLines.map((line, i) => <div key={i}>{line}</div>)}
                                       <button
                                         type="button"
                                         onClick={() => { navigator.clipboard.writeText(allLines.filter(l => l !== "").join("\n")); toast.success("Copied!"); }}
                                         className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                                       >
                                         <Copy className="h-3 w-3 text-muted-foreground" />
                                       </button>
                                     </div>
                                   );
                                 })()}
                               </div>
                             </LabelBox>
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
      <Card className="p-4 space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Route className="h-3.5 w-3.5" />
          Διαδρομές
        </Label>
        <div className="space-y-2">
          {routes.map((route, idx) => (
            <div key={idx} className="border border-border rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">{route.label}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">KOI (m)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={route.koi}
                    onChange={(e) => updateRoute(idx, "koi", e.target.value)}
                    placeholder="0"
                    className="text-sm mt-0.5 h-8"
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
                    className="text-sm mt-0.5 h-8"
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="flex justify-between text-xs font-semibold text-foreground bg-muted/50 rounded-lg p-2">
            <span>Σύνολο</span>
            <span>KOI: {totalKoi.toFixed(1)}m · ΦΥΡΑ: {totalFyraKoi.toFixed(1)}m</span>
          </div>
        </div>
      </Card>

      {/* Work Items - Category based */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Εργασίες <span className="text-destructive">*</span>
          </Label>
          {workItems.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {workItems.length} επιλεγμένες
            </Badge>
          )}
        </div>

        <div className="space-y-1">
          {WORK_CATEGORIES.map((cat) => {
            const catWorks = worksByCategory[cat.prefix] || [];
            if (catWorks.length === 0) return null;
            const isOpen = openWorkCategories.includes(cat.prefix);
            const selectedCount = selectedWorkCount(cat.prefix);

            return (
              <div key={cat.prefix} className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleWorkCategory(cat.prefix)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
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
                    </Badge>
                  )}
                </button>
                
                {isOpen && (
                  <div className="border-t border-border bg-muted/20">
                    {catWorks.map((w) => {
                      const selected = isWorkSelected(w.id);
                      const qty = getWorkQty(w.id);
                      return (
                        <div
                          key={w.id}
                          className={`flex items-center gap-2 px-3 py-2 border-b border-border/30 last:border-0 transition-colors ${
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
                          
                          <div className="flex-1 min-w-0" onClick={() => toggleWork(w)}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-primary font-bold">{w.code}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-tight">{w.description}</p>
                          </div>

                          {selected && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => updateWorkQty(w.id, qty - 1)}
                                className="w-6 h-6 rounded bg-muted flex items-center justify-center hover:bg-muted-foreground/20"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <Input
                                type="number"
                                min="1"
                                value={qty}
                                onChange={(e) => updateWorkQty(w.id, parseFloat(e.target.value) || 1)}
                                className="w-12 h-6 text-xs text-center p-0"
                              />
                              <button
                                type="button"
                                onClick={() => updateWorkQty(w.id, qty + 1)}
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
        </div>
      </Card>

      {/* Materials - Category based */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Υλικά
          </Label>
          {materialItems.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {oteMaterials.length} ΟΤΕ · {deltanetMaterials.length} {orgName}
            </Badge>
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

      </Card>

      {/* Construction Photos - Categorized */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" />
            Φωτογραφίες Κατασκευής
          </Label>
          {totalPhotos > 0 && (
            <Badge variant="secondary" className="text-xs">{totalPhotos} φωτο</Badge>
          )}
        </div>

        <div className="space-y-2">
          {visiblePhotoCategories.map((cat) => {
            const catPhotos = categorizedPhotos[cat.key] || [];
            const catPreviews = categorizedPreviews[cat.key] || [];
            
            return (
              <div key={cat.key} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{cat.icon}</span>
                    <span className="text-xs font-medium">{cat.label}</span>
                    {mandatoryPhotoKeys.has(cat.key) ? (
                      <Badge variant="destructive" className="text-[9px] h-4 px-1">ΥΠΟΧΡ.</Badge>
                    ) : (
                      cat.workPrefixes.length > 0 && <span className="text-[10px] text-muted-foreground">(προαιρ.)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {existingPhotoCounts[cat.key] > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        ✅ {existingPhotoCounts[cat.key]}
                      </Badge>
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
                    <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRefs.current[cat.key]?.click()}
                          className="h-7 text-[11px] gap-1 px-2"
                          title="Από γκαλερί"
                        >
                          📁
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRefs.current[`${cat.key}_camera`]?.click()}
                          className="h-7 text-[11px] gap-1 px-2"
                          title="Κάμερα"
                        >
                          <Camera className="h-3 w-3" />
                        </Button>
                      </div>
                  </div>
                </div>
                
                {catPreviews.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {catPreviews.map((preview, i) => {
                      return (
                        <div key={i} className="relative group">
                          <img
                            src={preview}
                            alt={`${cat.label} ${i + 1}`}
                            className="w-full h-16 object-cover rounded border border-border"
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
      </Card>

      {/* OTDR Measurements - PDF uploads */}
      {!isCrewMode && <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            📊 Μετρήσεις OTDR (PDF)
          </Label>
          {totalOtdrFiles > 0 && (
            <Badge variant="secondary" className="text-xs">{totalOtdrFiles} PDF</Badge>
          )}
        </div>

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
      </Card>}



      {/* Existing uploaded files summary */}
      {(Object.keys(existingPhotoCounts).length > 0 || Object.keys(existingOtdrCounts).length > 0) && (
        <Alert className="border-blue-500/30 bg-blue-500/5">
          <CheckCircle className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-xs font-semibold text-blue-700">Αρχεία στο Google Drive</AlertTitle>
          <AlertDescription className="text-xs text-blue-600 space-y-1">
            {Object.entries(existingPhotoCounts).map(([key, count]) => {
              const cat = ALL_PHOTO_CATEGORIES.find(c => c.key === key);
              return <div key={key}>✅ {cat?.label || key}: {count} φωτογραφίες</div>;
            })}
            {Object.entries(existingOtdrCounts).map(([key, count]) => (
              <div key={key}>✅ OTDR {key}: {count} αρχεία</div>
            ))}
          </AlertDescription>
        </Alert>
      )}

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

      {/* Submit */}
      <div className="space-y-3">
        <Button 
          variant="secondary"
          onClick={handleSubmit} 
          disabled={submitting || completing} 
          className="w-full py-6 text-sm font-bold gap-2 !bg-amber-600 !hover:bg-amber-700 !text-white border-0"
        >
          {submitting && !completing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {submitProgress || (isCrewMode ? "Αποθήκευση..." : "Υποβολή...")}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {isCrewMode ? "💾 Αποθήκευση Εργασιών" : "Υποβολή Κατασκευής"}
            </>
          )}
        </Button>

        {isCrewMode && (
          <>
            {!mandatoryPhotosValid && mandatoryPhotoKeys.size > 0 && (
              <Alert className="border-destructive/30 bg-destructive/5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <AlertTitle className="text-xs font-semibold text-destructive">Υποχρεωτικές φωτογραφίες</AlertTitle>
                <AlertDescription className="text-xs text-destructive/80">
                  {`Λείπουν φωτογραφίες: ${missingMandatoryCategories.join(", ")}`}
                </AlertDescription>
              </Alert>
            )}
            <AlertDialog open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={submitting || completing || (!mandatoryPhotosValid && mandatoryPhotoKeys.size > 0)}
                  variant="default"
                  className="w-full py-6 text-sm font-bold gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  {completing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {submitProgress || "Ολοκλήρωση..."}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      ✅ Ολοκλήρωση Κατασκευής
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
                    Αν είστε ο τελευταίος τεχνικός, θα δημιουργηθεί ο φάκελος πελάτη και θα σταλεί email ολοκλήρωσης.
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
          </>
        )}
      </div>
    </div>
  );
};

export default ConstructionForm;
