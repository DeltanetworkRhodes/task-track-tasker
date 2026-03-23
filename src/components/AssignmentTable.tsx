import { useState, useEffect, useCallback, useRef } from "react";
import { Assignment, statusLabels } from "@/data/mockData";
import { Camera, MessageSquare, ExternalLink, User, MapPin, Phone, Hash, FolderOpen, FileText, Image, Loader2, Clock, ArrowRight, Trash2, Eye, Users, Settings2, Building, Briefcase, Tag, Navigation, GripVertical, Save, Pencil, Mail, MoreHorizontal, ClipboardCheck } from "lucide-react";
import SRComments from "@/components/SRComments";
import CallStatusBadge from "@/components/CallStatusBadge";
import CallStatusPopover from "@/components/CallStatusPopover";
import CrewAssignmentPanel from "@/components/CrewAssignmentPanel";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWorkCategories } from "@/hooks/useCrewData";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAssignmentHistory } from "@/hooks/useData";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  inspection: 'bg-warning/15 text-warning',
  pre_committed: 'bg-primary/15 text-primary',
  construction: 'bg-accent/15 text-accent',
  completed: 'bg-blue-500/15 text-blue-400',
  submitted: 'bg-cyan-500/15 text-cyan-400',
  paid: 'bg-success/15 text-success',
  rejected: 'bg-destructive/15 text-destructive',
  cancelled: 'bg-destructive/15 text-destructive',
};

interface AssignmentTableProps {
  assignments: Assignment[];
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

const DetailRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</p>
        <p className="text-sm mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
};

const EditableField = ({ editing, icon: Icon, label, value, fallback, onChange }: {
  editing: boolean; icon: any; label: string; value: string | undefined; fallback: string | null | undefined; onChange: (v: string) => void;
}) => {
  const displayValue = editing ? (value ?? fallback ?? "") : (fallback || null);
  if (!editing && !displayValue) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</p>
        {editing ? (
          <input
            type="text"
            value={value ?? fallback ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full mt-0.5 rounded border border-border bg-card px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        ) : (
          <p className="text-sm mt-0.5 break-words">{displayValue}</p>
        )}
      </div>
    </div>
  );
};

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  thumbnailLink?: string;
}

interface DriveData {
  found: boolean;
  folder?: { id: string; name: string; webViewLink?: string };
  files?: DriveFile[];
  subfolders?: Record<string, { id: string; webViewLink?: string; files: DriveFile[] }>;
}

const FileItem = ({ file }: { file: DriveFile }) => {
  const isPdf = file.mimeType === "application/pdf";
  const isImage = file.mimeType?.startsWith("image/");
  const Icon = isPdf ? FileText : isImage ? Image : FileText;

  return (
    <a
      href={file.webViewLink || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary/50 transition-colors group"
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="truncate flex-1">{file.name}</span>
      <ExternalLink className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  );
};

// Column definitions
const ALL_COLUMNS = [
  { key: "srId", label: "SR ID", default: true },
  { key: "area", label: "Περιοχή", default: true },
  { key: "customerName", label: "Πελάτης", default: true },
  { key: "address", label: "Διεύθυνση", default: true },
  { key: "cab", label: "CAB", default: true },
  { key: "workType", label: "Είδος Εργασίας", default: true },
  { key: "requestCategory", label: "Τύπος Αιτήματος", default: true },
  { key: "municipality", label: "Δήμος", default: true },
  { key: "buildingId", label: "BID", default: true },
  { key: "technician", label: "Υπεύθυνος", default: true },
  { key: "status", label: "Κατάσταση", default: true },
  { key: "callStatus", label: "Κλήση", default: true },
  { key: "date", label: "Ημ/νία", default: true },
  { key: "comments", label: "Σχόλια", default: true },
];

const STORAGE_KEY = "assignment-visible-columns";
const ORDER_STORAGE_KEY = "assignment-column-order";

interface ColumnConfig {
  visible: string[];
  order: string[];
}

const getDefaultConfig = (): ColumnConfig => {
  try {
    const savedVisible = localStorage.getItem(STORAGE_KEY);
    const savedOrder = localStorage.getItem(ORDER_STORAGE_KEY);
    return {
      visible: savedVisible ? JSON.parse(savedVisible) : ALL_COLUMNS.filter(c => c.default).map(c => c.key),
      order: savedOrder ? JSON.parse(savedOrder) : ALL_COLUMNS.map(c => c.key),
    };
  } catch {}
  return {
    visible: ALL_COLUMNS.filter(c => c.default).map(c => c.key),
    order: ALL_COLUMNS.map(c => c.key),
  };
};

// Hook to get technician profiles (filtered by organization)
const useTechnicians = () => {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: ["technicians", organizationId],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "technician" as any);
      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      const techIds = roles.map((r) => r.user_id);
      let query = supabase
        .from("profiles")
        .select("user_id, full_name, area")
        .in("user_id", techIds);
      
      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
      
      const { data: profiles, error: profilesError } = await query;
      if (profilesError) throw profilesError;
      return profiles || [];
    },
    enabled: !!organizationId,
  });
};

const AssignmentTable = ({ assignments, selectedIds = [], onSelectionChange }: AssignmentTableProps) => {
  const [selected, setSelected] = useState<any>(null);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [driveData, setDriveData] = useState<DriveData | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => getDefaultConfig().visible);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => getDefaultConfig().order);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  
  const { data: technicians } = useTechnicians();
  const { data: userRole } = useUserRole();
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const { data: history } = useAssignmentHistory(selected?.id || null);
  const queryClient = useQueryClient();
  const { organizationId } = useOrganization();
  const { data: workCategories } = useWorkCategories();

  const buildEditData = (a: any) => ({
    work_type: a?.workType || "",
    request_category: a?.requestCategory || "",
    area: a?.area || "",
    municipality: a?.municipality || "",
    cab: a?.cab || "",
    building_id_hemd: a?.buildingId || "",
    address: a?.address || "",
    floor: a?.floor || "",
    customer_name: a?.customerName || "",
    phone: a?.phone || "",
    customer_mobile: a?.customerMobile || "",
    customer_landline: a?.customerLandline || "",
    customer_email: a?.customerEmail || "",
    manager_name: a?.managerName || "",
    manager_mobile: a?.managerMobile || "",
    manager_email: a?.managerEmail || "",
    comments: a?.comments || "",
  });

  const handleSaveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("assignments")
        .update({
          work_type: editData.work_type || null,
          request_category: editData.request_category || null,
          area: editData.area || selected.area,
          municipality: editData.municipality || null,
          cab: editData.cab || null,
          building_id_hemd: editData.building_id_hemd || null,
          address: editData.address || null,
          floor: editData.floor || null,
          customer_name: editData.customer_name || null,
          phone: editData.phone || null,
          customer_mobile: editData.customer_mobile || null,
          customer_landline: editData.customer_landline || null,
          customer_email: editData.customer_email || null,
          manager_name: editData.manager_name || null,
          manager_mobile: editData.manager_mobile || null,
          manager_email: editData.manager_email || null,
          comments: editData.comments || null,
        })
        .eq("id", selected.id);
      if (error) throw error;
      toast.success("Τα στοιχεία αποθηκεύτηκαν");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      // Update selected with new values
      setSelected({
        ...selected,
        workType: editData.work_type,
        requestCategory: editData.request_category,
        area: editData.area || selected.area,
        municipality: editData.municipality,
        cab: editData.cab,
        buildingId: editData.building_id_hemd,
        address: editData.address,
        floor: editData.floor,
        customerName: editData.customer_name,
        phone: editData.phone,
        customerMobile: editData.customer_mobile,
        customerLandline: editData.customer_landline,
        customerEmail: editData.customer_email,
        managerName: editData.manager_name,
        managerMobile: editData.manager_mobile,
        managerEmail: editData.manager_email,
        comments: editData.comments,
      });
    } catch (err: any) {
      toast.error("Σφάλμα: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Ordered columns for rendering
  const orderedColumns = columnOrder
    .map(key => ALL_COLUMNS.find(c => c.key === key))
    .filter((c): c is typeof ALL_COLUMNS[number] => !!c);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const handleColumnDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.effectAllowed = "move";
    dragItem.current = columnOrder.indexOf(key);
  };

  const handleColumnDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverKey(key);
    dragOverItem.current = columnOrder.indexOf(key);
  };

  const handleColumnDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const newOrder = [...columnOrder];
    const draggedKey = newOrder[dragItem.current];
    newOrder.splice(dragItem.current, 1);
    newOrder.splice(dragOverItem.current, 0, draggedKey);
    setColumnOrder(newOrder);
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(newOrder));
    dragItem.current = null;
    dragOverItem.current = null;
    setDragOverKey(null);
  };

  const handleColumnDragLeave = () => {
    setDragOverKey(null);
  };

  // Prefetch assignment details on hover
  const handleRowHover = useCallback((assignment: any) => {
    queryClient.prefetchQuery({
      queryKey: ["sr_comments", assignment.id],
      queryFn: async () => {
        const { data } = await supabase
          .from("sr_comments" as any)
          .select("*")
          .eq("assignment_id", assignment.id)
          .order("created_at", { ascending: true });
        return data || [];
      },
      staleTime: 30_000,
    });
    queryClient.prefetchQuery({
      queryKey: ["assignment-history", assignment.id],
      queryFn: async () => {
        const { data } = await supabase
          .from("assignment_history")
          .select("*")
          .eq("assignment_id", assignment.id)
          .order("created_at", { ascending: true });
        return data || [];
      },
      staleTime: 30_000,
    });
  }, [queryClient]);

  // Build a map of technician_id -> name
  const techMap = (technicians || []).reduce((acc: Record<string, string>, t) => {
    acc[t.user_id] = t.full_name || "—";
    return acc;
  }, {});

  // Auto-assign all work categories to a technician
  const autoAssignCrews = async (assignmentId: string, techId: string | null) => {
    if (!organizationId || !workCategories?.length) return;
    if (!techId) return;
    for (const cat of workCategories) {
      await supabase
        .from("sr_crew_assignments" as any)
        .upsert({
          assignment_id: assignmentId,
          organization_id: organizationId,
          category_id: cat.id,
          technician_id: techId,
          status: "pending",
        }, { onConflict: "assignment_id,category_id" });
    }
    queryClient.invalidateQueries({ queryKey: ["sr_crew_assignments", assignmentId] });
  };

  const handleAssign = async (assignmentId: string, technicianId: string) => {
    setAssigning(assignmentId);
    const newValue = technicianId === "__none__" ? null : technicianId;

    queryClient.setQueryData(["assignments"], (old: any) =>
      old?.map((a: any) => a.id === assignmentId ? { ...a, technician_id: newValue } : a)
    );

    try {
      const { error } = await supabase
        .from("assignments")
        .update({ technician_id: newValue })
        .eq("id", assignmentId);
      if (error) throw error;
      toast.success(newValue ? `Ανατέθηκε σε ${techMap[newValue] || "τεχνικό"}` : "Αφαιρέθηκε η ανάθεση");

      if (newValue) {
        autoAssignCrews(assignmentId, newValue).catch(console.error);
      }

      if (newValue) {
        const assignment = assignments.find((a: any) => a.id === assignmentId) as any;
        supabase.functions.invoke("send-push-notification", {
          body: {
            userId: newValue,
            title: "🔧 Νέα Ανάθεση",
            body: `SR ${assignment?.sr_id || assignment?.srId || ""} — ${assignment?.address || assignment?.area || ""}`,
            data: { srId: assignment?.sr_id || assignment?.srId, url: "/technician" },
          },
        }).catch(console.error);
      }
    } catch (err: any) {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      toast.error(err.message);
    } finally {
      setAssigning(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const target = assignments.find((a: any) => a.id === deleteTarget.id) as any;
      
      const { data: constructions } = await supabase
        .from("constructions")
        .select("id")
        .eq("assignment_id", deleteTarget.id);
      
      const constructionIds = (constructions || []).map((c: any) => c.id);
      
      if (constructionIds.length > 0) {
        await supabase.from("construction_works").delete().in("construction_id", constructionIds);
        await supabase.from("construction_materials").delete().in("construction_id", constructionIds);
        await supabase.from("constructions").delete().eq("assignment_id", deleteTarget.id);
      }
      
      await supabase.from("gis_data").delete().eq("assignment_id", deleteTarget.id);
      await supabase.from("assignment_history").delete().eq("assignment_id", deleteTarget.id);
      
      const { error } = await supabase
        .from("assignments")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      
      if (target) {
        supabase.functions.invoke("delete-drive-folder", {
          body: {
            sr_id: target.sr_id || deleteTarget.srId,
            area: target.area,
            customer_name: target.customer_name,
            organization_id: target.organization_id,
          },
        }).then(({ error: driveErr }) => {
          if (driveErr) console.error("Drive folder delete error:", driveErr);
        });
      }
      
      toast.success(`Το SR ${deleteTarget.srId} διαγράφηκε`);
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (assignmentId: string, newStatus: string) => {
    if (newStatus === "construction") {
      const { data: gisCheck } = await supabase
        .from("gis_data")
        .select("id")
        .eq("assignment_id", assignmentId)
        .maybeSingle();
      if (!gisCheck) {
        toast.error("Δεν μπορεί να γίνει μετάβαση σε Κατασκευή χωρίς GIS αρχείο.");
        return;
      }
    }

    queryClient.setQueryData(["assignments"], (old: any) =>
      old?.map((a: any) => a.id === assignmentId ? { ...a, status: newStatus, updated_at: new Date().toISOString() } : a)
    );
    if (selected?.id === assignmentId) {
      setSelected({ ...selected, status: newStatus });
    }
    toast.success(`Κατάσταση → ${statusLabels[newStatus] || newStatus}`);

    try {
      const { error } = await supabase
        .from("assignments")
        .update({ status: newStatus })
        .eq("id", assignmentId);
      if (error) throw error;

      const assignment = assignments.find((a: any) => a.id === assignmentId) as any;

      if (newStatus === "pre_committed" && assignment) {
        const srId = assignment.sr_id || assignment.srId;
        try {
          const { data: driveResult, error: driveErr } = await supabase.functions.invoke("google-drive-files", {
            body: { action: "sr_folder", sr_id: srId },
          });
          if (!driveErr && driveResult?.found) {
            const folderUrl = driveResult.folder?.webViewLink || null;
            const egrafaUrl = driveResult.subfolders?.["ΕΓΓΡΑΦΑ"]?.webViewLink || null;
            const promeletiUrl = driveResult.subfolders?.["ΠΡΟΜΕΛΕΤΗ"]?.webViewLink || null;

            await supabase
              .from("assignments")
              .update({
                drive_folder_url: folderUrl,
                drive_egrafa_url: egrafaUrl,
                drive_promeleti_url: promeletiUrl,
              })
              .eq("id", assignmentId);

            queryClient.setQueryData(["assignments"], (old: any) =>
              old?.map((a: any) => a.id === assignmentId ? {
                ...a,
                drive_folder_url: folderUrl,
                drive_egrafa_url: egrafaUrl,
                drive_promeleti_url: promeletiUrl,
              } : a)
            );
            if (selected?.id === assignmentId) {
              setSelected((prev: any) => prev ? {
                ...prev,
                driveUrl: folderUrl,
                driveEgrafaUrl: egrafaUrl,
                drivePromeletiUrl: promeletiUrl,
              } : prev);
            }
            toast.success("Αρχεία Drive βρέθηκαν και συνδέθηκαν αυτόματα");
          } else {
            toast.info("Δεν βρέθηκε φάκελος Drive για " + srId);
          }
        } catch (driveFetchErr) {
          console.error("Drive auto-fetch error:", driveFetchErr);
        }
      }

      if (newStatus === "cancelled" && assignment) {
        try {
          await supabase.functions.invoke("move-cancelled-folder", {
            body: {
              sr_id: assignment.sr_id || assignment.srId,
              area: assignment.area,
              assignment_id: assignmentId,
            },
          });
          toast.success("Ο φάκελος μεταφέρθηκε στις ΑΚΥΡΩΜΕΝΕΣ ΚΑΤΑΣΚΕΥΕΣ");
        } catch (moveErr) {
          console.error("Move folder error:", moveErr);
        }
      }
    } catch (err: any) {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      toast.error(err.message);
    }
  };

  useEffect(() => {
    if (!selected?.srId) {
      setDriveData(null);
      return;
    }

    const fetchDrive = async () => {
      setDriveLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("google-drive-files", {
          body: { action: "sr_folder", sr_id: selected.srId },
        });
        if (error) throw error;
        setDriveData(data);
      } catch {
        setDriveData(null);
      } finally {
        setDriveLoading(false);
      }
    };

    fetchDrive();
  }, [selected?.srId]);

  const toggleSelect = (id: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    );
  };

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (selectedIds.length === assignments.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(assignments.map((a) => a.id));
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedIds.length === 0) return;
    setBulkUpdating(true);
    try {
      for (const id of selectedIds) {
        await supabase.from("assignments").update({ status: newStatus }).eq("id", id);
      }
      toast.success(`${selectedIds.length} αναθέσεις → ${statusLabels[newStatus] || newStatus}`);
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      onSelectionChange?.([]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleBulkTechnicianAssign = async (techId: string) => {
    if (selectedIds.length === 0) return;
    setBulkUpdating(true);
    try {
      const techName = techId === "__none__" ? null : (technicians || []).find(t => t.user_id === techId)?.full_name;
      const techValue = techId === "__none__" ? null : techId;
      for (const id of selectedIds) {
        await supabase.from("assignments").update({ 
          technician_id: techValue
        }).eq("id", id);
        if (techValue) {
          await autoAssignCrews(id, techValue);
        }
      }
      toast.success(techId === "__none__" 
        ? `${selectedIds.length} SR → χωρίς υπεύθυνο`
        : `${selectedIds.length} SR → ${techName}`
      );
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      onSelectionChange?.([]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkUpdating(true);
    try {
      for (const id of selectedIds) {
        const { data: constructions } = await supabase
          .from("constructions").select("id").eq("assignment_id", id);
        const cIds = (constructions || []).map((c: any) => c.id);
        if (cIds.length > 0) {
          await supabase.from("construction_works").delete().in("construction_id", cIds);
          await supabase.from("construction_materials").delete().in("construction_id", cIds);
          await supabase.from("constructions").delete().eq("assignment_id", id);
        }
        await supabase.from("gis_data").delete().eq("assignment_id", id);
        await supabase.from("assignment_history").delete().eq("assignment_id", id);
        await supabase.from("sr_comments").delete().eq("assignment_id", id);
        await supabase.from("sr_crew_assignments").delete().eq("assignment_id", id);
        await supabase.from("pre_work_checklists").delete().eq("assignment_id", id);
        await supabase.from("inspection_reports").delete().eq("assignment_id", id);
        await supabase.from("assignments").delete().eq("id", id);
      }
      toast.success(`${selectedIds.length} αναθέσεις διαγράφηκαν`);
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      onSelectionChange?.([]);
      setBulkDeleteConfirm(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBulkUpdating(false);
    }
  };

  // Helper to get cell value
  const getCellValue = (a: any, key: string) => {
    switch (key) {
      case "srId": return a.srId;
      case "area": return a.area;
      case "address": return a.address || "—";
      case "customerName": return a.customerName || "—";
      case "cab": return a.cab || "—";
      case "workType": return a.workType || "—";
      case "requestCategory": return a.requestCategory || "—";
      case "municipality": return a.municipality || "—";
      case "buildingId": return a.buildingId || "—";
      case "date": return a.date;
      case "comments": return a.comments;
      default: return "";
    }
  };

  return (
    <>
      {/* Column Visibility Toggle */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-border/30">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
              <Settings2 className="h-3.5 w-3.5" />
              Στήλες
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <p className="text-xs font-semibold mb-1 text-muted-foreground">Εμφάνιση & σειρά στηλών</p>
            <p className="text-[10px] text-muted-foreground/60 mb-3">Σύρε για αλλαγή σειράς</p>
            <div className="space-y-0.5">
              {orderedColumns.map((col, idx) => (
                <div
                  key={col.key}
                  draggable
                  onDragStart={(e) => handleColumnDragStart(e, col.key)}
                  onDragOver={(e) => handleColumnDragOver(e, col.key)}
                  onDragEnd={handleColumnDragEnd}
                  onDragLeave={handleColumnDragLeave}
                  className={`flex items-center gap-2 cursor-grab active:cursor-grabbing rounded-md px-1.5 py-1.5 hover:bg-muted/50 transition-colors ${dragOverKey === col.key ? 'bg-primary/10 border border-primary/30' : ''}`}
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  <Checkbox
                    checked={visibleColumns.includes(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs select-none">{col.label}</span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-primary/20 flex-wrap">
          <span className="text-xs font-semibold text-primary">
            {selectedIds.length} επιλεγμένα
          </span>
          <Select onValueChange={handleBulkStatusChange} disabled={bulkUpdating}>
            <SelectTrigger className="w-[180px] h-7 text-xs">
              <SelectValue placeholder="Αλλαγή status..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={handleBulkTechnicianAssign} disabled={bulkUpdating}>
            <SelectTrigger className="w-[200px] h-7 text-xs">
              <SelectValue placeholder="Ανάθεση υπεύθυνου..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                <span className="text-muted-foreground">Χωρίς ανάθεση</span>
              </SelectItem>
              {(technicians || []).map((t) => (
                <SelectItem key={t.user_id} value={t.user_id}>
                  <Users className="h-3 w-3 inline mr-1" />
                  {t.full_name}{t.area ? ` (${t.area})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkUpdating}
              className="text-xs text-destructive hover:text-destructive/80 font-medium"
            >
              <Trash2 className="h-3 w-3 inline mr-1" />
              Μαζική Διαγραφή
            </button>
          )}
          <button
            onClick={() => onSelectionChange?.([])}
            className="text-[10px] text-muted-foreground hover:text-foreground ml-auto"
          >
            Αποεπιλογή
          </button>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="block md:hidden space-y-2 p-2">
        {assignments.map((a) => (
          <div
            key={a.id}
            className="rounded-xl border border-border bg-card p-3 active:bg-secondary/50 transition-colors"
            onMouseEnter={() => handleRowHover(a)}
            onClick={() => setSelected(a)}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-primary text-sm">{a.srId}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[a.status] || statusColors.pending}`}>
                {statusLabels[a.status] || a.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-y-1 gap-x-2 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{a.area}</span>
              </div>
              {(a as any).customerName && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">{(a as any).customerName}</span>
                </div>
              )}
              {(a as any).cab && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Hash className="h-3 w-3 shrink-0" />
                  <span className="font-bold">{(a as any).cab}</span>
                </div>
              )}
              {(a as any).workType && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Briefcase className="h-3 w-3 shrink-0" />
                  <span className="truncate">{(a as any).workType}</span>
                </div>
              )}
              {(a as any).technicianId && techMap[(a as any).technicianId] && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">{techMap[(a as any).technicianId]}</span>
                </div>
              )}
            </div>
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              {isAdmin ? (
                <CallStatusPopover assignment={a}>
                  <button type="button"><CallStatusBadge status={(a as any).callStatus} callCount={(a as any).callCount} /></button>
                </CallStatusPopover>
              ) : (
                <CallStatusBadge status={(a as any).callStatus} callCount={(a as any).callCount} />
              )}
            </div>
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border/30">
              <span className="text-[10px] text-muted-foreground font-bold">{a.date}</span>
              <div className="flex items-center gap-2.5">
                {(a as any).driveUrl && (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <a href={(a as any).driveUrl} target="_blank" rel="noopener noreferrer" title="Φάκελος">
                      <FolderOpen className="h-3.5 w-3.5 text-primary" />
                    </a>
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(a); }}
                  className="text-muted-foreground/40 active:text-destructive p-1.5 -m-1.5 rounded-lg"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop/Tablet Table View */}
      <div className="hidden md:block w-full overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs min-w-[900px]">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <tr className="border-b border-border/50">
              {onSelectionChange && (
                <th className="py-2.5 px-1.5 w-8 shrink-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === assignments.length && assignments.length > 0}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                  />
                </th>
              )}
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[11%]">SR ID</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[24%]">Πελάτης / Διεύθυνση</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[9%]">Περιοχή</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[7%]">CAB</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[15%]">Υπεύθυνος</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[12%]">Κατάσταση</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[9%]">Κλήση</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[7%]">Ημ/νία</th>
              <th className="py-2.5 px-2 text-center font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[6%]"></th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 && (
              <tr>
                <td colSpan={onSelectionChange ? 10 : 9} className="py-16 text-center text-muted-foreground">
                  <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Δεν υπάρχουν αναθέσεις</p>
                </td>
              </tr>
            )}
            {assignments.map((a, index) => (
              <tr
                key={a.id}
                className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-muted/40 ${
                  index % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                } ${selectedIds.includes(a.id) ? 'bg-primary/5' : ''} ${
                  selected?.id === a.id ? '!bg-primary/5 border-l-2 border-l-primary' : ''
                }`}
                onMouseEnter={() => handleRowHover(a)}
                onClick={() => setSelected(a)}
              >
                {onSelectionChange && (
                  <td className="py-2.5 px-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                    />
                  </td>
                )}
                {/* SR ID */}
                <td className="py-2.5 px-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelected(a); }}
                    className="text-xs font-bold text-primary hover:underline text-left truncate block w-full"
                  >
                    {a.srId}
                  </button>
                </td>
                {/* Πελάτης / Διεύθυνση */}
                <td className="py-2.5 px-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {(a as any).customerName || '—'}
                    </p>
                    {(a as any).address && (
                      <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                        {(a as any).address}
                      </p>
                    )}
                    {(a as any).phone && (
                      <a
                        href={`tel:${(a as any).phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] text-primary flex items-center gap-1 mt-0.5 hover:underline"
                      >
                        <Phone className="h-2.5 w-2.5 shrink-0" />
                        {(a as any).phone}
                      </a>
                    )}
                  </div>
                </td>
                {/* Περιοχή */}
                <td className="py-2.5 px-2 text-xs text-foreground truncate">{a.area}</td>
                {/* CAB */}
                <td className="py-2.5 px-2 text-xs text-foreground truncate">{(a as any).cab || '—'}</td>
                {/* Τεχνικός */}
                <td className="py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={(a as any).technicianId || "__none__"}
                    onValueChange={(val) => handleAssign(a.id, val)}
                    disabled={assigning === a.id}
                  >
                    <SelectTrigger className="w-full h-7 text-[11px] border-border/50 min-w-[110px]">
                      <SelectValue placeholder="Χωρίς" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground">Χωρίς ανάθεση</span>
                      </SelectItem>
                      {(technicians || []).map((t) => (
                        <SelectItem key={t.user_id} value={t.user_id}>
                          {t.full_name}{t.area ? ` (${t.area})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                {/* Κατάσταση */}
                <td className="py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={a.status}
                    onValueChange={(val) => handleStatusChange(a.id, val)}
                  >
                    <SelectTrigger className="h-7 text-[11px] w-full border-0 bg-transparent hover:bg-muted/50 px-1 min-w-[90px]">
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusColors[a.status] || statusColors.pending}`}>
                        {statusLabels[a.status] || a.status}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                {/* Κλήση */}
                <td className="py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                  {isAdmin ? (
                    <CallStatusPopover assignment={a}>
                      <button type="button"><CallStatusBadge status={(a as any).callStatus} callCount={(a as any).callCount} /></button>
                    </CallStatusPopover>
                  ) : (
                    <CallStatusBadge status={(a as any).callStatus} callCount={(a as any).callCount} />
                  )}
                </td>
                {/* Ημ/νία */}
                <td className="py-2.5 px-2 font-bold text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                  {a.date}
                </td>
                {/* Ενέργειες */}
                <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(a as any).driveUrl && (
                        <DropdownMenuItem onClick={() => window.open((a as any).driveUrl, "_blank")}>
                          <FolderOpen className="h-4 w-4 mr-2" />
                          Drive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setSelected(a)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Λεπτομέρειες
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(a)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Διαγραφή
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Sheet (Side Panel) — Editable */}
      <Sheet open={!!selected} onOpenChange={() => { setSelected(null); setEditing(false); setEditData({}); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
            <SheetTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg">{selected?.srId}</span>
              <span className={`ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[selected?.status] || statusColors.pending}`}>
                {statusLabels[selected?.status as keyof typeof statusLabels] || selected?.status}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {!editing ? (
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => { setEditing(true); setEditData(buildEditData(selected)); }}>
                    <Pencil className="h-3 w-3" /> Επεξεργασία
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditing(false); setEditData({}); }}>
                      Ακύρωση
                    </Button>
                    <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => handleSaveEdit()} disabled={saving}>
                      <Save className="h-3 w-3" /> {saving ? "Αποθήκευση..." : "Αποθήκευση"}
                    </Button>
                  </>
                )}
              </div>
            </SheetTitle>
          </SheetHeader>

          <div className="px-6 py-4 space-y-6">
            {/* Work Info */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> Στοιχεία Εργασίας
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                <EditableField editing={editing} icon={Briefcase} label="Είδος Εργασίας" value={editData.work_type} fallback={(selected as any)?.workType} onChange={(v) => setEditData(d => ({ ...d, work_type: v }))} />
                <EditableField editing={editing} icon={Tag} label="Τύπος Αιτήματος" value={editData.request_category} fallback={(selected as any)?.requestCategory} onChange={(v) => setEditData(d => ({ ...d, request_category: v }))} />
                <EditableField editing={editing} icon={MapPin} label="Περιοχή" value={editData.area} fallback={selected?.area} onChange={(v) => setEditData(d => ({ ...d, area: v }))} />
                <EditableField editing={editing} icon={Building} label="Δήμος" value={editData.municipality} fallback={(selected as any)?.municipality} onChange={(v) => setEditData(d => ({ ...d, municipality: v }))} />
                <EditableField editing={editing} icon={Hash} label="CAB" value={editData.cab} fallback={selected?.cab} onChange={(v) => setEditData(d => ({ ...d, cab: v }))} />
                <EditableField editing={editing} icon={Hash} label="Building ID" value={editData.building_id_hemd} fallback={(selected as any)?.buildingId} onChange={(v) => setEditData(d => ({ ...d, building_id_hemd: v }))} />
                <EditableField editing={editing} icon={MapPin} label="Διεύθυνση" value={editData.address} fallback={selected?.address} onChange={(v) => setEditData(d => ({ ...d, address: v }))} />
                <EditableField editing={editing} icon={Hash} label="Όροφος" value={editData.floor} fallback={(selected as any)?.floor} onChange={(v) => setEditData(d => ({ ...d, floor: v }))} />
              </div>
              {(selected as any)?.latitude && (selected as any)?.longitude && (
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Navigation className="h-3.5 w-3.5" />
                  <span>Συντεταγμένες: {(selected as any).latitude}, {(selected as any).longitude}</span>
                  <a
                    href={`https://www.google.com/maps?q=${(selected as any).latitude},${(selected as any).longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline ml-1"
                  >
                    Χάρτης ↗
                  </a>
                </div>
              )}
            </div>

            {/* Customer Info */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Στοιχεία Πελάτη
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                <EditableField editing={editing} icon={User} label="Ονοματεπώνυμο" value={editData.customer_name} fallback={selected?.customerName} onChange={(v) => setEditData(d => ({ ...d, customer_name: v }))} />
                <EditableField editing={editing} icon={Phone} label="Τηλέφωνο" value={editData.phone} fallback={selected?.phone} onChange={(v) => setEditData(d => ({ ...d, phone: v }))} />
                <EditableField editing={editing} icon={Phone} label="Κινητό" value={editData.customer_mobile} fallback={(selected as any)?.customerMobile} onChange={(v) => setEditData(d => ({ ...d, customer_mobile: v }))} />
                <EditableField editing={editing} icon={Phone} label="Σταθερό" value={editData.customer_landline} fallback={(selected as any)?.customerLandline} onChange={(v) => setEditData(d => ({ ...d, customer_landline: v }))} />
                <EditableField editing={editing} icon={Mail} label="Email" value={editData.customer_email} fallback={(selected as any)?.customerEmail} onChange={(v) => setEditData(d => ({ ...d, customer_email: v }))} />
              </div>
            </div>

            {/* Manager Info */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Στοιχεία Διαχειριστή
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                <EditableField editing={editing} icon={User} label="Ονοματεπώνυμο" value={editData.manager_name} fallback={(selected as any)?.managerName} onChange={(v) => setEditData(d => ({ ...d, manager_name: v }))} />
                <EditableField editing={editing} icon={Phone} label="Κινητό" value={editData.manager_mobile} fallback={(selected as any)?.managerMobile} onChange={(v) => setEditData(d => ({ ...d, manager_mobile: v }))} />
                <EditableField editing={editing} icon={Mail} label="Email" value={editData.manager_email} fallback={(selected as any)?.managerEmail} onChange={(v) => setEditData(d => ({ ...d, manager_email: v }))} />
              </div>
            </div>




            {/* Assign Technician */}
            {selected && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">Ανάθεση Υπεύθυνου</p>
                  <Select
                    value={(selected as any).technicianId || "__none__"}
                    onValueChange={(val) => {
                      handleAssign(selected.id, val);
                      setSelected({ ...selected, technicianId: val === "__none__" ? null : val });
                    }}
                    disabled={assigning === selected.id}
                  >
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue placeholder="Χωρίς ανάθεση" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground">Χωρίς ανάθεση</span>
                      </SelectItem>
                      {(technicians || []).map((t) => (
                        <SelectItem key={t.user_id} value={t.user_id}>
                          {t.full_name}{t.area ? ` (${t.area})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">Αλλαγή Κατάστασης</p>
                  <Select
                    value={selected.status}
                    onValueChange={(val) => handleStatusChange(selected.id, val)}
                  >
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Inspection PDF */}
            {selected && selected.pdfUrl && (
              <button
                onClick={() => window.open(selected.pdfUrl, "_blank")}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                Προβολή Δελτίου Αυτοψίας
              </button>
            )}

            {/* History */}
            {history && history.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold">Ιστορικό Αλλαγών</h3>
                </div>
                <div className="space-y-0 relative">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/50" />
                  {history.map((h: any, i: number) => (
                    <div key={h.id || i} className="flex items-start gap-3 py-1.5 relative">
                      <div className="h-[15px] w-[15px] rounded-full border-2 border-accent bg-background z-10 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[h.old_status] || 'bg-muted text-muted-foreground'}`}>
                            {statusLabels[h.old_status as keyof typeof statusLabels] || h.old_status || '—'}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[h.new_status] || 'bg-muted text-muted-foreground'}`}>
                            {statusLabels[h.new_status as keyof typeof statusLabels] || h.new_status}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-bold">
                          {new Date(h.created_at).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SR Comments */}
            {selected && <SRComments assignmentId={selected.id} />}

            {/* Crew Assignment Panel */}
            {selected && isAdmin && (
              <div className="pt-4 border-t border-border/30">
                <CrewAssignmentPanel assignment={selected} />
              </div>
            )}

            {/* Drive */}
            <div className="pt-4 border-t border-border/30">
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Φάκελος Έργου (Drive)</h3>
              </div>

              {driveLoading && (
                <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Αναζήτηση φακέλου...
                </div>
              )}

              {!driveLoading && driveData?.found && (
                <div className="space-y-3">
                  {driveData.folder?.webViewLink && (
                    <a
                      href={driveData.folder.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary hover:bg-primary/10 transition-colors"
                    >
                      <FolderOpen className="h-4 w-4" />
                      <span className="font-medium">Άνοιγμα Φακέλου {driveData.folder.name}</span>
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </a>
                  )}

                  {driveData.files && driveData.files.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">Αρχεία</p>
                      <div className="space-y-0.5">
                        {driveData.files.map((f) => (
                          <FileItem key={f.id} file={f} />
                        ))}
                      </div>
                    </div>
                  )}

                  {driveData.subfolders && Object.entries(driveData.subfolders).map(([name, sub]) => (
                    <div key={name}>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                          📁 {name}
                        </p>
                        <span className="text-[10px] text-muted-foreground/50">
                          ({sub.files.length} αρχεία)
                        </span>
                        {sub.webViewLink && (
                          <a href={sub.webViewLink} target="_blank" rel="noopener noreferrer" className="ml-auto">
                            <ExternalLink className="h-3 w-3 text-muted-foreground/50 hover:text-primary transition-colors" />
                          </a>
                        )}
                      </div>
                      <div className="space-y-0.5 pl-2 border-l border-border/30">
                        {sub.files.slice(0, 5).map((f) => (
                          <FileItem key={f.id} file={f} />
                        ))}
                        {sub.files.length > 5 && (
                          <a
                            href={sub.webViewLink || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-[10px] text-primary hover:underline pl-2 py-1"
                          >
                            +{sub.files.length - 5} ακόμα αρχεία →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!driveLoading && driveData && !driveData.found && (
                <p className="text-xs text-muted-foreground/70 py-2">
                  Δεν βρέθηκε φάκελος για SR {selected?.srId} στο Drive
                </p>
              )}

              {!driveLoading && !driveData && (
                <p className="text-xs text-muted-foreground/70 py-2">
                  Δεν ήταν δυνατή η σύνδεση με το Drive
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground/50">
              <span>Πηγή: {selected?.sourceTab || '—'}</span>
              <span>{selected?.date}</span>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή Ανάθεσης</AlertDialogTitle>
            <AlertDialogDescription>
              Είστε σίγουροι ότι θέλετε να διαγράψετε το SR <strong className="text-foreground">{deleteTarget?.srId}</strong>; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Ακύρωση</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Διαγραφή..." : "Διαγραφή"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Μαζική Διαγραφή</AlertDialogTitle>
            <AlertDialogDescription>
              Θέλετε να διαγράψετε <strong className="text-foreground">{selectedIds.length}</strong> αναθέσεις; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkUpdating}>Ακύρωση</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkUpdating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkUpdating ? "Διαγραφή..." : "Διαγραφή Όλων"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AssignmentTable;
