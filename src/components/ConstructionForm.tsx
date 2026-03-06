import { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Loader2, CheckCircle, HardHat, Package, Wrench, Camera, X, ChevronDown, ChevronRight, Plus, Minus, MapPin, Route } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

const ConstructionForm = ({ assignment, onComplete }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
    { key: "ΣΚΑΜΑ", storageName: "SKAMA", label: "Σκάμα", icon: "⛏️", workPrefixes: ["1965"] },
    { key: "ΟΔΕΥΣΗ", storageName: "ODEFSI", label: "Όδευση", icon: "🛤️", workPrefixes: [] },
    { key: "BCP", storageName: "BCP", label: "BCP", icon: "📦", workPrefixes: ["1991", "1993"] },
    { key: "BEP", storageName: "BEP", label: "BEP", icon: "🔌", workPrefixes: [] },
    { key: "BMO", storageName: "BMO", label: "BMO", icon: "📡", workPrefixes: [] },
    { key: "FB", storageName: "FB", label: "Floor Box", icon: "📋", workPrefixes: ["1984", "1985", "1986"] },
    { key: "ΚΑΜΠΙΝΑ", storageName: "KAMPINA", label: "Καμπίνα", icon: "🏗️", workPrefixes: ["1980"] },
    { key: "Γ_ΦΑΣΗ", storageName: "G_FASI", label: "Γ' Φάση", icon: "👤", workPrefixes: ["1955"] },
  ];

  // Filter photo categories based on selected works
  const selectedWorkPrefixes = new Set(workItems.map((w) => WORK_CATEGORIES.find((c) => w.code.startsWith(c.prefix))?.prefix).filter(Boolean));
  
  const visiblePhotoCategories = ALL_PHOTO_CATEGORIES.filter((cat) => 
    cat.workPrefixes.length === 0 || cat.workPrefixes.some((p) => selectedWorkPrefixes.has(p))
  );

  // OTDR PDF measurement categories
  const OTDR_CATEGORIES = [
    { key: "BMO", storageName: "OTDR_BMO", label: "BMO" },
    { key: "FB", storageName: "OTDR_FB", label: "Floor Box" },
    { key: "ΚΑΜΠΙΝΑ", storageName: "OTDR_KAMPINA", label: "Καμπίνα" },
    { key: "BEP", storageName: "OTDR_BEP", label: "BEP" },
    { key: "BCP", storageName: "OTDR_BCP", label: "BCP" },
    { key: "LIVE", storageName: "OTDR_LIVE", label: "Live" },
  ];

  const [categorizedPhotos, setCategorizedPhotos] = useState<Record<string, File[]>>({});
  const [categorizedPreviews, setCategorizedPreviews] = useState<Record<string, string[]>>({});
  const [otdrFiles, setOtdrFiles] = useState<Record<string, File[]>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const otdrInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitProgress, setSubmitProgress] = useState("");

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

  // Auto-fill OTE materials from GIS data
  const [gisAutoFilled, setGisAutoFilled] = useState(false);
  useEffect(() => {
    if (!gisData || !materials || gisAutoFilled || materialItems.length > 0) return;
    
    const oteMaterials = materials.filter((m) => m.source === "OTE");
    const autoItems: MaterialItem[] = [];

    const addMaterial = (match: (m: any) => boolean, qty: number) => {
      const found = oteMaterials.find(match);
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

    // 1. BEP - match size from bep_type (e.g. "MEDIUM/12/ZTT (01..12)")
    if (gisData.bep_type) {
      const bepSize = gisData.bep_type.toUpperCase();
      if (bepSize.includes("SMALL")) {
        addMaterial((m) => m.name.includes("Small BEP") && m.name.includes("splitter"), 1);
      } else if (bepSize.includes("MEDIUM")) {
        addMaterial((m) => m.name.includes("Medium BEP") && m.name.includes("splitter"), 1);
      } else if (bepSize.includes("X-LARGE") || bepSize.includes("XLARGE")) {
        addMaterial((m) => m.name.includes("X-Large BEP"), 1);
      } else if (bepSize.includes("LARGE")) {
        addMaterial((m) => m.name.includes("Large BEP") && m.name.includes("splitter"), 1);
      }
    }

    // 2. BMO - match size from bmo_type (e.g. "SMALL/16/RAYCAP")
    if (gisData.bmo_type) {
      const bmoSize = gisData.bmo_type.toUpperCase();
      if (bmoSize.includes("SMALL")) {
        addMaterial((m) => m.name === "Small BMO", 1);
      } else if (bmoSize.includes("MEDIUM")) {
        addMaterial((m) => m.name === "Medium BMO", 1);
      } else if (bmoSize.includes("LARGE")) {
        addMaterial((m) => m.name === "Large BMO", 1);
      }
    }

    // 3. Floor Boxes - count from floor_details
    const floorDetails = (gisData.floor_details as any[]) || [];
    let fb4Total = 0;
    let fb12Total = 0;
    for (const fd of floorDetails) {
      const row = fd.raw && typeof fd.raw === "object" ? fd.raw : fd;
      // Check FB01 through FB04
      for (let i = 1; i <= 4; i++) {
        const fbKey = `FB0${i}`;
        const fbTypeKey = `FB0${i} TYPE`;
        const fbCount = parseInt(row[fbKey]) || 0;
        const fbType = (row[fbTypeKey] || "").toUpperCase();
        if (fbCount > 0) {
          if (fbType.includes("12")) {
            fb12Total += fbCount;
          } else {
            fb4Total += fbCount; // Default to 4-port
          }
        }
      }
    }
    if (fb4Total > 0) {
      addMaterial((m) => m.name.includes("Floor Box with 4 adapters"), fb4Total);
    }
    if (fb12Total > 0) {
      addMaterial((m) => m.name.includes("Floor Box with 12 adapters"), fb12Total);
    }

    // 4. Splitter from bep_template (e.g. "BEP 1SP 1:8(01..12)")
    if (gisData.bep_template) {
      const tmpl = gisData.bep_template.toUpperCase();
      if (tmpl.includes("1:8")) {
        addMaterial((m) => m.name.includes("SPLITTERS") && m.name.includes("1:8"), 1);
      } else if (tmpl.includes("1:2")) {
        addMaterial((m) => m.name.includes("SPLITTERS") && m.name.includes("1:2"), 1);
      }
    }

    if (autoItems.length > 0) {
      setMaterialItems(autoItems);
      setMaterialTab("OTE");
      setGisAutoFilled(true);
      toast.success(`Αυτόματη συμπλήρωση ${autoItems.length} υλικών ΟΤΕ από GIS`);
    }
  }, [gisData, materials, gisAutoFilled, materialItems.length]);

  const worksByCategory = useMemo(() => {
    if (!workPricing) return {};
    const groups: Record<string, typeof workPricing> = {};
    const uncategorized: typeof workPricing = [];
    
    for (const w of workPricing) {
      const cat = WORK_CATEGORIES.find((c) => w.code.startsWith(c.prefix));
      if (cat) {
        if (!groups[cat.prefix]) groups[cat.prefix] = [];
        groups[cat.prefix].push(w);
      } else {
        uncategorized.push(w);
      }
    }
    if (uncategorized.length > 0) groups["other"] = uncategorized;
    return groups;
  }, [workPricing]);

  // Group materials by category
  const materialsByCategory = useMemo(() => {
    if (!materials) return {};
    const groups: Record<string, Record<string, typeof materials>> = { OTE: {}, DELTANETWORK: {} };
    
    for (const m of materials) {
      const source = m.source as "OTE" | "DELTANETWORK";
      if (!groups[source]) groups[source] = {};
      
      const cat = MATERIAL_CATEGORIES.find((c) => c.match(m.name, m.code));
      const catLabel = cat?.label || "Λοιπά";
      if (!groups[source][catLabel]) groups[source][catLabel] = [];
      groups[source][catLabel].push(m);
    }
    return groups;
  }, [materials]);

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

  // Compress/resize image using canvas
  const compressImage = (file: File, maxWidth = 1600, quality = 0.7): Promise<File> => {
    return new Promise((resolve) => {
      // Skip non-image files
      if (!file.type.startsWith("image/")) { resolve(file); return; }
      
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width <= maxWidth && file.size < 500 * 1024) { resolve(file); return; }
        
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
              const compressed = new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
              console.log(`Compressed ${file.name}: ${(file.size/1024).toFixed(0)}KB → ${(compressed.size/1024).toFixed(0)}KB`);
              resolve(compressed);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  };

  // Photo handling per category
  const handleCategoryPhotoSelect = async (category: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const ref = fileInputRefs.current[category];
    if (ref) ref.value = "";
    
    // Compress all photos in parallel
    const compressed = await Promise.all(files.map((f) => compressImage(f)));
    
    setCategorizedPhotos((prev) => ({ ...prev, [category]: [...(prev[category] || []), ...compressed] }));
    compressed.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCategorizedPreviews((prev) => ({
          ...prev,
          [category]: [...(prev[category] || []), ev.target?.result as string],
        }));
      };
      reader.readAsDataURL(file);
    });
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

  const handleSubmit = async () => {
    if (!cab.trim()) {
      toast.error("Η Καμπίνα (CAB) είναι υποχρεωτική");
      return;
    }
    if (workItems.length === 0) {
      toast.error("Επιλέξτε τουλάχιστον μία εργασία");
      return;
    }

    setSubmitting(true);
    try {
      setSubmitProgress("Καταχώρηση κατασκευής...");

      const routesData = routes
        .filter((r) => r.koi || r.fyraKoi)
        .map((r) => ({ label: r.label, koi: parseFloat(r.koi) || 0, fyra_koi: parseFloat(r.fyraKoi) || 0 }));

      const { data: construction, error: constError } = await supabase
        .from("constructions")
        .insert({
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
        } as any)
        .select("id")
        .single();
      if (constError) throw constError;

      if (workItems.length > 0) {
        const { error: worksError } = await supabase.from("construction_works").insert(
          workItems.map((w) => ({
            construction_id: construction.id,
            work_pricing_id: w.work_pricing_id,
            quantity: w.quantity,
            unit_price: w.unit_price,
            subtotal: w.unit_price * w.quantity,
          }))
        );
        if (worksError) console.error("Works insert error:", worksError);
      }

      if (materialItems.length > 0) {
        const { error: matsError } = await supabase.from("construction_materials").insert(
          materialItems.map((m) => ({
            construction_id: construction.id,
            material_id: m.material_id,
            quantity: m.quantity,
            source: m.source,
          }))
        );
        if (matsError) console.error("Materials insert error:", matsError);
      }

      if (deltanetMaterials.length > 0) {
        setSubmitProgress("Ενημέρωση αποθέματος...");
        const { error: deductErr } = await supabase.functions.invoke("deduct-stock", {
          body: {
            construction_id: construction.id,
            materials: deltanetMaterials.map((m) => ({
              material_id: m.material_id,
              quantity: m.quantity,
              source: m.source,
            })),
          },
        });
        if (deductErr) console.error("Stock deduction error:", deductErr);
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
            const storagePath = `constructions/${safeSrId}/${construction.id}/${folderName}/${i + 1}.${ext}`;
            const { error: uploadErr } = await supabase.storage
              .from("photos")
              .upload(storagePath, photo, { upsert: true });
            if (uploadErr) console.error(`Photo upload error ${folderName}/${i}:`, uploadErr);
            else photoPaths.push(storagePath);
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
            const storagePath = `constructions/${safeSrId}/${construction.id}/${folderName}/${pdf.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
            const { error: uploadErr } = await supabase.storage
              .from("photos")
              .upload(storagePath, pdf, { upsert: true, contentType: "application/pdf" });
            if (uploadErr) console.error(`OTDR upload error ${folderName}/${i}:`, uploadErr);
            else otdrPaths.push(storagePath);
            otdrUploaded++;
            setSubmitProgress(`Ανέβασμα OTDR μετρήσεων (${otdrUploaded}/${totalOtdrCount})...`);
          }
        }
      }

      const { error: assignError } = await supabase
        .from("assignments")
        .update({ status: "completed", cab: cab.trim() })
        .eq("id", assignment.id);
      if (assignError) console.error("Assignment update error:", assignError);

      setSubmitProgress("Δημιουργία εγγράφων & upload στο Drive...");
      let docsResult: any = null;
      try {
        const { data, error: docsErr } = await supabase.functions.invoke(
          "generate-construction-docs",
          { body: { construction_id: construction.id, photo_paths: photoPaths } }
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
              construction_id: construction.id,
              sr_id: assignment.sr_id,
              area: assignment.area,
              customer_name: assignment.customer_name,
              address: assignment.address,
              cab: cab.trim(),
              spreadsheet_id: spreadsheetFile?.id || null,
              photo_paths: photoPaths,
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
        <p className="text-sm text-muted-foreground mt-1">
          Έσοδα: {totalRevenue.toFixed(2)}€ · Κόστος υλικών: {totalMaterialCost.toFixed(2)}€
        </p>
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
        Φόρμα Κατασκευής
      </h2>

      {/* Technical Details */}
      <Card className="p-4 space-y-3">
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
      </Card>

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
              {workItems.length} επιλεγμένες · {totalRevenue.toFixed(2)}€
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
                              <span className="text-xs font-mono text-primary font-semibold">{w.code}</span>
                              <span className="text-xs font-semibold text-foreground">{w.unit_price}€</span>
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
              {oteMaterials.length} ΟΤΕ · {deltanetMaterials.length} ΔΝ
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
              <Badge variant="outline" className="text-[9px] px-1 border-orange-500/30 text-orange-600 h-4">ΔΝ</Badge>
              {deltanetMaterials.length > 0 && <span className="text-primary font-bold">{deltanetMaterials.length}</span>}
            </TabsTrigger>
          </TabsList>

          {["OTE", "DELTANETWORK"].map((source) => (
            <TabsContent key={source} value={source} className="space-y-1 mt-2">
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
                                <span className="text-xs font-mono text-primary">{m.code}</span>
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

        {deltanetMaterials.length > 0 && (
          <div className="flex justify-end pt-1">
            <Badge variant="outline" className="text-xs font-semibold border-orange-500/30 text-orange-600">
              Κόστος υλικών ΔΝ: {totalMaterialCost.toFixed(2)}€
            </Badge>
          </div>
        )}
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
                    {cat.workPrefixes.length > 0 && <span className="text-[10px] text-muted-foreground">(προαιρ.)</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {catPhotos.length > 0 && (
                      <Badge variant="outline" className="text-[10px] h-5">{catPhotos.length}</Badge>
                    )}
                    <input
                      ref={(el) => { fileInputRefs.current[cat.key] = el; }}
                      type="file"
                      accept="image/*"
                      multiple
                      capture="environment"
                      onChange={(e) => handleCategoryPhotoSelect(cat.key, e)}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRefs.current[cat.key]?.click()}
                      className="h-7 text-[11px] gap-1 px-2"
                    >
                      <Camera className="h-3 w-3" />
                      Φωτο
                    </Button>
                  </div>
                </div>
                
                {catPreviews.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {catPreviews.map((preview, i) => (
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
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Summary */}
      {(workItems.length > 0 || materialItems.length > 0) && (
        <Card className="p-4 space-y-2 border-primary/20">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Σύνοψη</Label>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-primary">{totalRevenue.toFixed(2)}€</p>
              <p className="text-[10px] text-muted-foreground">Έσοδα</p>
            </div>
            <div>
              <p className="text-lg font-bold text-orange-600">{totalMaterialCost.toFixed(2)}€</p>
              <p className="text-[10px] text-muted-foreground">Κόστος Υλικών</p>
            </div>
            <div>
              <p className="text-lg font-bold text-green-600">{(totalRevenue - totalMaterialCost).toFixed(2)}€</p>
              <p className="text-[10px] text-muted-foreground">Κέρδος</p>
            </div>
          </div>

          {/* Selected items summary */}
          <div className="space-y-1 pt-2 border-t border-border">
            {workItems.map((w) => (
              <div key={w.work_pricing_id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate flex-1">
                  <span className="font-mono text-primary">{w.code}</span> ×{w.quantity}
                </span>
                <span className="font-semibold">{(w.unit_price * w.quantity).toFixed(2)}€</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Submit */}
      <Button onClick={handleSubmit} disabled={submitting} className="w-full py-6 text-sm font-bold gap-2">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {submitProgress || "Υποβολή..."}
          </>
        ) : (
          <>
            <HardHat className="h-4 w-4" />
            Υποβολή Κατασκευής
          </>
        )}
      </Button>
    </div>
  );
};

export default ConstructionForm;
