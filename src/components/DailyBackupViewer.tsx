import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database, ChevronDown, ChevronUp, Package, ClipboardList } from "lucide-react";

interface BackupRow {
  id: string;
  backup_date: string;
  assignments_count: number;
  materials_count: number;
  changes_summary: any;
  created_at: string;
}

const DailyBackupViewer = () => {
  const { organization } = useOrganization();
  const [selectedBackup, setSelectedBackup] = useState<BackupRow | null>(null);
  const [detailType, setDetailType] = useState<"assignments" | "materials">("assignments");

  const { data: backups, isLoading } = useQuery({
    queryKey: ["daily-backups", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data } = await supabase
        .from("daily_backups")
        .select("id, backup_date, assignments_count, materials_count, changes_summary, created_at")
        .eq("organization_id", organization.id)
        .order("backup_date", { ascending: false })
        .limit(30);
      return (data || []) as BackupRow[];
    },
    enabled: !!organization?.id,
  });

  const getChangeBadge = (changes: any) => {
    if (!changes) return null;
    const assignChanges = (changes.assignments?.added || 0) + (changes.assignments?.removed || 0) + (changes.assignments?.status_changed || 0);
    const matChanges = changes.materials?.stock_changes || 0;
    const total = assignChanges + matChanges;
    if (total === 0) return <Badge variant="outline" className="text-muted-foreground">Χωρίς αλλαγές</Badge>;
    return <Badge variant="secondary" className="bg-amber-500/15 text-amber-400">{total} αλλαγές</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Ημερήσια Backup — Αναθέσεις & Αποθήκη
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ημερομηνία</TableHead>
                <TableHead>Αναθέσεις</TableHead>
                <TableHead>Υλικά</TableHead>
                <TableHead>Αλλαγές</TableHead>
                <TableHead>Λεπτομέρειες</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Φόρτωση...</TableCell>
                </TableRow>
              ) : !backups?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Δεν υπάρχουν backups ακόμη. Το πρώτο θα δημιουργηθεί αυτόματα αύριο στις 01:00.
                  </TableCell>
                </TableRow>
              ) : (
                backups.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      {new Date(b.backup_date).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                        {b.assignments_count}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        {b.materials_count}
                      </div>
                    </TableCell>
                    <TableCell>{getChangeBadge(b.changes_summary)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedBackup(b)}>
                        Προβολή
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Detail Dialog */}
        <Dialog open={!!selectedBackup} onOpenChange={() => setSelectedBackup(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>
                Backup {selectedBackup && new Date(selectedBackup.backup_date).toLocaleDateString("el-GR")}
              </DialogTitle>
            </DialogHeader>
            {selectedBackup && (
              <div className="space-y-4">
                {/* Tab buttons */}
                <div className="flex gap-2">
                  <Button
                    variant={detailType === "assignments" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDetailType("assignments")}
                  >
                    <ClipboardList className="h-4 w-4 mr-1" />
                    Αναθέσεις ({selectedBackup.changes_summary?.assignments?.added || 0} νέες,{" "}
                    {selectedBackup.changes_summary?.assignments?.status_changed || 0} αλλαγές status,{" "}
                    {selectedBackup.changes_summary?.assignments?.removed || 0} διαγραφές)
                  </Button>
                  <Button
                    variant={detailType === "materials" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDetailType("materials")}
                  >
                    <Package className="h-4 w-4 mr-1" />
                    Αποθήκη ({selectedBackup.changes_summary?.materials?.stock_changes || 0} αλλαγές)
                  </Button>
                </div>

                <ScrollArea className="h-[400px]">
                  {detailType === "assignments" && (
                    <div className="space-y-2">
                      {(selectedBackup.changes_summary?.assignments?.details || []).length === 0 ? (
                        <p className="text-muted-foreground text-sm py-4 text-center">Καμία αλλαγή σε αναθέσεις</p>
                      ) : (
                        (selectedBackup.changes_summary?.assignments?.details || []).map((d: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                            {d.type === "added" && (
                              <Badge className="bg-green-500/15 text-green-400">+ Νέα</Badge>
                            )}
                            {d.type === "removed" && (
                              <Badge className="bg-red-500/15 text-red-400">- Διαγραφή</Badge>
                            )}
                            {d.type === "status_changed" && (
                              <Badge className="bg-yellow-500/15 text-yellow-400">↔ Status</Badge>
                            )}
                            <span className="font-mono text-sm">{d.sr_id}</span>
                            {d.type === "status_changed" && (
                              <span className="text-xs text-muted-foreground">
                                {d.from} → {d.to}
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {detailType === "materials" && (
                    <div className="space-y-2">
                      {(selectedBackup.changes_summary?.materials?.details || []).length === 0 ? (
                        <p className="text-muted-foreground text-sm py-4 text-center">Καμία αλλαγή σε αποθήκη</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Κωδικός</TableHead>
                              <TableHead>Υλικό</TableHead>
                              <TableHead>Πριν</TableHead>
                              <TableHead>Μετά</TableHead>
                              <TableHead>Διαφορά</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(selectedBackup.changes_summary?.materials?.details || []).map((d: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-xs">{d.code}</TableCell>
                                <TableCell className="text-sm">{d.name}</TableCell>
                                <TableCell>{d.from}</TableCell>
                                <TableCell>{d.to}</TableCell>
                                <TableCell>
                                  <span className={d.diff < 0 ? "text-red-400" : "text-green-400"}>
                                    {d.diff > 0 ? "+" : ""}{d.diff}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <p className="text-xs text-muted-foreground text-right mt-2">
          Τα backups δημιουργούνται αυτόματα καθημερινά στις 01:00
        </p>
      </CardContent>
    </Card>
  );
};

export default DailyBackupViewer;
