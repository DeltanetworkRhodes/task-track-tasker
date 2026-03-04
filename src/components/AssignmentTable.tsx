import { useState, useEffect } from "react";
import { Assignment, statusLabels } from "@/data/mockData";
import { Camera, MessageSquare, ExternalLink, User, MapPin, Phone, Hash, FolderOpen, FileText, Image, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

const statusColors: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  inspection: 'bg-warning/15 text-warning',
  pre_committed: 'bg-primary/15 text-primary',
  construction: 'bg-accent/15 text-accent',
  completed: 'bg-success/15 text-success',
};

interface AssignmentTableProps {
  assignments: Assignment[];
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

const AssignmentTable = ({ assignments }: AssignmentTableProps) => {
  const [selected, setSelected] = useState<any>(null);
  const [driveData, setDriveData] = useState<DriveData | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);

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

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">SR ID</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Περιοχή</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Πελάτης</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">CAB</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Κατάσταση</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Ημ/νία</th>
              <th className="py-3 px-4 text-center font-medium text-muted-foreground text-xs uppercase tracking-wider">Φωτο</th>
              <th className="py-3 px-4 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Σχόλια</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr
                key={a.id}
                onClick={() => setSelected(a)}
                className="border-b border-border/30 hover:bg-secondary/50 transition-colors cursor-pointer"
              >
                <td className="py-3 px-4 font-mono font-semibold text-primary">{a.srId}</td>
                <td className="py-3 px-4">{a.area}</td>
                <td className="py-3 px-4 text-muted-foreground max-w-[180px] truncate">{(a as any).customerName || '—'}</td>
                <td className="py-3 px-4 font-mono text-xs">{(a as any).cab || '—'}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[a.status] || statusColors.pending}`}>
                    {statusLabels[a.status] || a.status}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{a.date}</td>
                <td className="py-3 px-4 text-center">
                  {a.photos > 0 && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Camera className="h-3.5 w-3.5" />
                      <span className="text-xs">{a.photos}</span>
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-xs text-muted-foreground max-w-[200px] truncate">
                  {a.comments && (
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3 flex-shrink-0" />
                      {a.comments}
                    </span>
                  )}
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
              <span className="font-mono">{selected?.srId}</span>
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
            <DetailRow icon={MessageSquare} label="Σχόλια" value={selected?.comments} />
          </div>

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
                {/* Main folder link */}
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

                {/* Root files (PDF δελτίο etc) */}
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

                {/* Subfolders */}
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
    </>
  );
};

export default AssignmentTable;
