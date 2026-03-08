import { useState, useEffect, useCallback } from "react";
import { Assignment, statusLabels } from "@/data/mockData";
import { Camera, MessageSquare, ExternalLink, User, MapPin, Phone, Hash, FolderOpen, FileText, Image, Loader2, Clock, ArrowRight, Trash2, Eye } from "lucide-react";
import SRComments from "@/components/SRComments";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAssignmentHistory } from "@/hooks/useData";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  inspection: 'bg-warning/15 text-warning',
  pre_committed: 'bg-primary/15 text-primary',
  
  construction: 'bg-accent/15 text-accent',
  completed: 'bg-success/15 text-success',
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

// Hook to get technician profiles
const useTechnicians = () => {
  return useQuery({
    queryKey: ["technicians"],
    queryFn: async () => {
      // Get all user_ids with technician role
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "technician" as any);
      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      const techIds = roles.map((r) => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, area")
        .in("user_id", techIds);
      if (profilesError) throw profilesError;
      return profiles || [];
    },
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
  
  const { data: technicians } = useTechnicians();
  const { data: history } = useAssignmentHistory(selected?.id || null);
  const queryClient = useQueryClient();

  // Prefetch assignment details on hover (comments, history)
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

  const handleAssign = async (assignmentId: string, technicianId: string) => {
    setAssigning(assignmentId);
    const newValue = technicianId === "__none__" ? null : technicianId;

    // Optimistic update
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
      // Find assignment details for Drive cleanup
      const target = assignments.find((a: any) => a.id === deleteTarget.id) as any;
      
      // Delete dependent records first (cascade manually)
      // 1. Find constructions linked to this assignment
      const { data: constructions } = await supabase
        .from("constructions")
        .select("id")
        .eq("assignment_id", deleteTarget.id);
      
      const constructionIds = (constructions || []).map((c: any) => c.id);
      
      if (constructionIds.length > 0) {
        // Delete construction_works and construction_materials first
        await supabase.from("construction_works").delete().in("construction_id", constructionIds);
        await supabase.from("construction_materials").delete().in("construction_id", constructionIds);
        // Then delete constructions
        await supabase.from("constructions").delete().eq("assignment_id", deleteTarget.id);
      }
      
      // 2. Delete gis_data and assignment_history
      await supabase.from("gis_data").delete().eq("assignment_id", deleteTarget.id);
      await supabase.from("assignment_history").delete().eq("assignment_id", deleteTarget.id);
      
      // 3. Now delete the assignment itself
      const { error } = await supabase
        .from("assignments")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      
      // Delete Drive folder (non-blocking)
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
          else console.log(`Drive folder for ${deleteTarget.srId} deleted`);
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
    // Guard: block construction without GIS
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

    // Optimistic update
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

      // If pre_committed, auto-fetch Drive folder URLs
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

      // If cancelled, move the SR folder in Drive to ΑΚΥΡΩΜΕΝΕΣ ΚΑΤΑΣΚΕΥΕΣ
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
      // Rollback on error
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

  return (
    <>
      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-primary/20">
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
            className="rounded-xl border border-border bg-card p-3.5 active:bg-secondary/50 transition-colors"
            onMouseEnter={() => handleRowHover(a)}
            onClick={() => setSelected(a)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-primary text-sm">{a.srId}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${statusColors[a.status] || statusColors.pending}`}>
                {statusLabels[a.status] || a.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
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
              {(a as any).technicianId && techMap[(a as any).technicianId] && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">{techMap[(a as any).technicianId]}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
              <span className="text-[10px] text-muted-foreground font-bold">{a.date}</span>
              <div className="flex items-center gap-3">
                {a.photos > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground text-[10px]">
                    <Camera className="h-3 w-3" /> {a.photos}
                  </span>
                )}
                {(a as any).driveUrl && (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <a href={(a as any).driveUrl} target="_blank" rel="noopener noreferrer" title="Φάκελος">
                      <FolderOpen className="h-3.5 w-3.5 text-primary" />
                    </a>
                    {(a as any).driveEgrafaUrl && (
                      <a href={(a as any).driveEgrafaUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-medium text-primary/70 hover:text-primary">
                        ΕΓΓ
                      </a>
                    )}
                    {(a as any).drivePromeletiUrl && (
                      <a href={(a as any).drivePromeletiUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-medium text-primary/70 hover:text-primary">
                        ΠΡΜ
                      </a>
                    )}
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

      {/* Desktop Table View */}
      <div className="hidden md:block">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-border/50">
              {onSelectionChange && (
                <th className="py-2.5 px-1.5 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === assignments.length && assignments.length > 0}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                  />
                </th>
              )}
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[10%]">SR ID</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[10%]">Περιοχή</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[14%]">Πελάτης</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[7%]">CAB</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[14%]">Τεχνικός</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[12%]">Κατάσταση</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[9%]">Ημ/νία</th>
              <th className="py-2.5 px-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[16%]">Σχόλια</th>
              <th className="py-2.5 px-1.5 text-center font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[5%]">Drive</th>
              <th className="py-2.5 px-1.5 text-center font-medium text-muted-foreground text-[11px] uppercase tracking-wider w-[3%]"></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr
                key={a.id}
                className={`border-b border-border/30 hover:bg-secondary/50 transition-colors ${selectedIds.includes(a.id) ? 'bg-primary/5' : ''}`}
                onMouseEnter={() => handleRowHover(a)}
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
                <td
                  className="py-2.5 px-2 font-bold text-primary cursor-pointer text-xs truncate"
                  onClick={() => setSelected(a)}
                >
                  {a.srId}
                </td>
                <td className="py-2.5 px-2 text-xs truncate">{a.area}</td>
                <td className="py-2.5 px-2 text-muted-foreground text-xs truncate">{(a as any).customerName || '—'}</td>
                <td className="py-2.5 px-2 font-bold text-xs truncate">{(a as any).cab || '—'}</td>
                <td className="py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={(a as any).technicianId || "__none__"}
                    onValueChange={(val) => handleAssign(a.id, val)}
                    disabled={assigning === a.id}
                  >
                    <SelectTrigger className="w-full h-7 text-[11px] border-border/50">
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
                <td className="py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={a.status}
                    onValueChange={(val) => handleStatusChange(a.id, val)}
                  >
                    <SelectTrigger className="h-7 text-[11px] w-full border-0 bg-transparent hover:bg-muted/50 px-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[a.status] || statusColors.pending}`}>
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
                <td className="py-2.5 px-2 font-bold text-[11px] text-muted-foreground whitespace-nowrap">{a.date}</td>
                <td className="py-2.5 px-2 text-[11px] text-muted-foreground truncate">
                  {a.comments && (
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{a.comments}</span>
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-1.5 text-center">
                  {(a as any).driveUrl ? (
                    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <a href={(a as any).driveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex" title="Φάκελος">
                        <FolderOpen className="h-3.5 w-3.5 text-primary hover:text-primary/70 transition-colors" />
                      </a>
                    </div>
                  ) : (
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />
                  )}
                </td>
                <td className="py-2.5 px-1.5 text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(a); }}
                    className="text-muted-foreground/40 hover:text-destructive transition-colors p-0.5 rounded"
                    title="Διαγραφή"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-primary" />
              <span className="font-bold">{selected?.srId}</span>
              <span className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[selected?.status] || statusColors.pending}`}>
                {statusLabels[selected?.status as keyof typeof statusLabels] || selected?.status}
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Customer Info */}
          <div className="space-y-0 mt-2">
            <DetailRow icon={MapPin} label="Περιοχή" value={selected?.area} />
            <DetailRow icon={User} label="Πελάτης" value={selected?.customerName} />
            <DetailRow icon={MapPin} label="Διεύθυνση" value={selected?.address} />
            <DetailRow icon={Phone} label="Τηλέφωνο" value={selected?.phone} />
            <DetailRow icon={Hash} label="Καμπίνα (CAB)" value={selected?.cab} />
            <DetailRow icon={User} label="Τεχνικός" value={selected?.technicianId ? techMap[selected.technicianId] : null} />
            <DetailRow icon={MessageSquare} label="Σχόλια" value={selected?.comments} />
          </div>

          {/* Assign in modal */}
          {selected && (
            <div className="mt-3 pt-3 border-t border-border/30">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">Ανάθεση σε Τεχνικό</p>
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
          )}

          {/* Status Change */}
          {selected && (
            <div className="mt-3 pt-3 border-t border-border/30">
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
          )}

          {/* View Inspection PDF */}
          {selected && selected.pdfUrl && (
            <div className="mt-3 pt-3 border-t border-border/30">
              <button
                onClick={() => window.open(selected.pdfUrl, "_blank")}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                Προβολή Δελτίου Αυτοψίας
              </button>
            </div>
          )}

          {history && history.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/30">
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

          {/* Drive Folder Section */}
          <div className="mt-4 pt-4 border-t border-border/30">
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
          <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground/50">
            <span>Πηγή: {selected?.sourceTab || '—'}</span>
            <span>{selected?.date}</span>
          </div>
        </DialogContent>
      </Dialog>

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

    </>
  );
};

export default AssignmentTable;
