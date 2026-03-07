import { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import AppLayout from "@/components/AppLayout";
import { useAssignments, useProfiles } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, MapPin, Phone, Calendar, GripVertical, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const COLUMNS = [
  { id: "pending", label: "Αναμονή", color: "hsl(var(--muted-foreground))", bg: "bg-muted/30" },
  { id: "assigned", label: "Ανατεθειμένα", color: "hsl(200, 85%, 45%)", bg: "bg-blue-500/10" },
  { id: "survey", label: "Αυτοψία", color: "hsl(45, 90%, 50%)", bg: "bg-yellow-500/10" },
  { id: "inspection", label: "Έλεγχος", color: "hsl(280, 60%, 55%)", bg: "bg-purple-500/10" },
  { id: "construction", label: "Κατασκευή", color: "hsl(200, 85%, 45%)", bg: "bg-cyan-500/10" },
  { id: "completed", label: "Ολοκληρωμένα", color: "hsl(135, 60%, 40%)", bg: "bg-green-500/10" },
  { id: "cancelled", label: "Ακυρωμένα", color: "hsl(0, 70%, 50%)", bg: "bg-red-500/10" },
];

type Assignment = {
  id: string;
  sr_id: string;
  area: string;
  status: string;
  customer_name: string | null;
  phone: string | null;
  technician_id: string | null;
  cab: string | null;
  created_at: string;
  updated_at: string;
};

function KanbanCard({ assignment, profiles, isDragging }: { assignment: Assignment; profiles: any[]; isDragging?: boolean }) {
  const tech = profiles?.find((p) => p.user_id === assignment.technician_id);
  const daysSinceUpdate = Math.floor((Date.now() - new Date(assignment.updated_at).getTime()) / 86400000);

  return (
    <Card
      className={`p-3 cursor-grab active:cursor-grabbing border border-border/50 hover:border-primary/30 transition-all ${
        isDragging ? "opacity-80 shadow-xl scale-105 rotate-2" : "hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono font-bold text-xs text-primary">{assignment.sr_id}</span>
        {daysSinceUpdate > 5 && (
          <Badge variant="destructive" className="text-[9px] px-1 py-0">
            {daysSinceUpdate}μ
          </Badge>
        )}
      </div>
      {assignment.customer_name && (
        <p className="text-xs text-foreground truncate mb-1">{assignment.customer_name}</p>
      )}
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="h-2.5 w-2.5" />
          {assignment.area}
        </span>
        {assignment.cab && (
          <span className="text-[10px] text-muted-foreground">CAB: {assignment.cab}</span>
        )}
      </div>
      {tech && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/30">
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[8px] font-bold text-primary">
            {tech.full_name?.charAt(0) || "T"}
          </div>
          <span className="text-[10px] text-muted-foreground truncate">{tech.full_name}</span>
        </div>
      )}
    </Card>
  );
}

function DroppableColumn({
  column,
  assignments,
  profiles,
}: {
  column: (typeof COLUMNS)[0];
  assignments: Assignment[];
  profiles: any[];
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[220px] w-[260px] shrink-0 rounded-2xl ${column.bg} border border-border/30 transition-all ${
        isOver ? "ring-2 ring-primary/40 scale-[1.01]" : ""
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} />
          <span className="text-xs font-semibold text-foreground">{column.label}</span>
        </div>
        <Badge variant="secondary" className="text-[10px] h-5 min-w-[20px] justify-center">
          {assignments.length}
        </Badge>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-240px)] min-h-[100px]">
        {assignments.length === 0 && (
          <div className="flex items-center justify-center h-20 text-[11px] text-muted-foreground/50">
            Κενό
          </div>
        )}
        {assignments.map((a) => (
          <div
            key={a.id}
            data-id={a.id}
            className="kanban-draggable"
          >
            <KanbanCard assignment={a} profiles={profiles} />
          </div>
        ))}
      </div>
    </div>
  );
}

const Kanban = () => {
  const { data: rawAssignments, isLoading } = useAssignments();
  const { data: profiles } = useProfiles();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string>("all");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const assignments: Assignment[] = useMemo(
    () =>
      (rawAssignments || []).map((a) => ({
        id: a.id,
        sr_id: a.sr_id,
        area: a.area,
        status: a.status,
        customer_name: a.customer_name,
        phone: a.phone,
        technician_id: a.technician_id,
        cab: a.cab,
        created_at: a.created_at,
        updated_at: a.updated_at,
      })),
    [rawAssignments]
  );

  const areas = useMemo(() => [...new Set(assignments.map((a) => a.area))].sort(), [assignments]);

  const filtered = useMemo(
    () => (areaFilter === "all" ? assignments : assignments.filter((a) => a.area === areaFilter)),
    [assignments, areaFilter]
  );

  const activeAssignment = activeId ? assignments.find((a) => a.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const findColumnForItem = (id: string) => {
    const assignment = assignments.find((a) => a.id === id);
    return assignment?.status || null;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const assignmentId = active.id as string;
    const newStatus = over.id as string;

    // Check if dropped on a column
    const isColumn = COLUMNS.some((c) => c.id === newStatus);
    if (!isColumn) return;

    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment || assignment.status === newStatus) return;

    // Optimistic update
    queryClient.setQueryData(["assignments"], (old: any) =>
      old?.map((a: any) => (a.id === assignmentId ? { ...a, status: newStatus, updated_at: new Date().toISOString() } : a))
    );

    const { error } = await supabase
      .from("assignments")
      .update({ status: newStatus })
      .eq("id", assignmentId);

    if (error) {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      toast({
        title: "Σφάλμα",
        description: "Δεν ήταν δυνατή η αλλαγή status",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Ενημέρωση",
        description: `${assignment.sr_id}: ${COLUMNS.find((c) => c.id === newStatus)?.label}`,
      });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Kanban Board</h1>
            <p className="text-xs text-muted-foreground">Drag & drop για αλλαγή status</p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Περιοχή" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Όλες οι περιοχές</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Kanban Board */}
        {isLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <div key={col.id} className="min-w-[220px] w-[260px] shrink-0 space-y-2">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
              {COLUMNS.map((col) => (
                <DroppableColumn
                  key={col.id}
                  column={col}
                  assignments={filtered.filter((a) => a.status === col.id)}
                  profiles={profiles || []}
                />
              ))}
            </div>
            <DragOverlay>
              {activeAssignment ? (
                <div className="w-[244px]">
                  <KanbanCard assignment={activeAssignment} profiles={profiles || []} isDragging />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </AppLayout>
  );
};

export default Kanban;
