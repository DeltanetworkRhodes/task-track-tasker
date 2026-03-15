import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Shield, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: "Σύνδεση", color: "bg-green-500/15 text-green-400" },
  logout: { label: "Αποσύνδεση", color: "bg-gray-500/15 text-gray-400" },
  page_view: { label: "Προβολή", color: "bg-blue-500/15 text-blue-400" },
  assignment_create: { label: "Νέα Ανάθεση", color: "bg-cyan-500/15 text-cyan-400" },
  assignment_update: { label: "Ενημέρωση Ανάθεσης", color: "bg-yellow-500/15 text-yellow-400" },
  assignment_delete: { label: "Διαγραφή Ανάθεσης", color: "bg-red-500/15 text-red-400" },
  survey_submit: { label: "Υποβολή Αυτοψίας", color: "bg-purple-500/15 text-purple-400" },
  construction_submit: { label: "Υποβολή Κατασκευής", color: "bg-orange-500/15 text-orange-400" },
  user_role_change: { label: "Αλλαγή Ρόλου", color: "bg-red-500/15 text-red-400" },
  payment_update: { label: "Ενημέρωση Πληρωμής", color: "bg-emerald-500/15 text-emerald-400" },
  data_export: { label: "Εξαγωγή Δεδομένων", color: "bg-amber-500/15 text-amber-400" },
  file_upload: { label: "Upload Αρχείου", color: "bg-indigo-500/15 text-indigo-400" },
  settings_change: { label: "Αλλαγή Ρυθμίσεων", color: "bg-pink-500/15 text-pink-400" },
};

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  details: any;
  ip_address: string | null;
  user_agent: string | null;
  page_url: string | null;
  created_at: string;
}

const AuditLogViewer = () => {
  const { organization } = useOrganization();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  const fetchLogs = async () => {
    if (!organization?.id) return;
    setLoading(true);

    let query = supabase
      .from("audit_logs")
      .select("*")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (actionFilter !== "all") {
      query = query.eq("action", actionFilter);
    }

    const { data } = await query;
    setLogs((data as AuditLog[]) || []);
    setLoading(false);

    // Fetch user names
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map((l: AuditLog) => l.user_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      if (profs) {
        const map: Record<string, string> = {};
        profs.forEach((p) => (map[p.user_id] = p.full_name));
        setProfiles(map);
      }
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [organization?.id, actionFilter]);

  const filtered = logs.filter((l) => {
    if (!search) return true;
    const name = profiles[l.user_id] || "";
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      (l.page_url || "").toLowerCase().includes(search.toLowerCase())
    );
  });

  const getBrowser = (ua: string | null) => {
    if (!ua) return "—";
    if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
    if (ua.includes("Edg")) return "Edge";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    return "Other";
  };

  const getDevice = (ua: string | null) => {
    if (!ua) return "—";
    if (/iPhone|iPad|iPod/.test(ua)) return "📱 iOS";
    if (/Android/.test(ua)) return "📱 Android";
    if (/Windows/.test(ua)) return "💻 Windows";
    if (/Mac/.test(ua)) return "💻 Mac";
    if (/Linux/.test(ua)) return "💻 Linux";
    return "—";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Audit Log — Ιστορικό Ενεργειών
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Αναζήτηση χρήστη ή σελίδας..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Τύπος ενέργειας" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλες οι ενέργειες</SelectItem>
              <SelectItem value="login">Σύνδεση</SelectItem>
              <SelectItem value="page_view">Προβολή σελίδας</SelectItem>
              <SelectItem value="assignment_create">Δημιουργία ανάθεσης</SelectItem>
              <SelectItem value="assignment_update">Ενημέρωση ανάθεσης</SelectItem>
              <SelectItem value="assignment_delete">Διαγραφή ανάθεσης</SelectItem>
              <SelectItem value="survey_submit">Υποβολή αυτοψίας</SelectItem>
              <SelectItem value="construction_submit">Υποβολή κατασκευής</SelectItem>
              <SelectItem value="user_role_change">Αλλαγή ρόλου</SelectItem>
              <SelectItem value="payment_update">Πληρωμή</SelectItem>
              <SelectItem value="data_export">Εξαγωγή</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ημερομηνία</TableHead>
                <TableHead>Χρήστης</TableHead>
                <TableHead>Ενέργεια</TableHead>
                <TableHead>Σελίδα</TableHead>
                <TableHead>Συσκευή</TableHead>
                <TableHead>Browser</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {loading ? "Φόρτωση..." : "Δεν βρέθηκαν εγγραφές"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((log) => {
                  const actionInfo = ACTION_LABELS[log.action] || {
                    label: log.action,
                    color: "bg-muted text-muted-foreground",
                  };
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("el-GR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {profiles[log.user_id] || log.user_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={actionInfo.color}>
                          {actionInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.page_url || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{getDevice(log.user_agent)}</TableCell>
                      <TableCell className="text-xs">{getBrowser(log.user_agent)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground text-right">
          Εμφάνιση {filtered.length} από {logs.length} εγγραφές (max 200)
        </p>
      </CardContent>
    </Card>
  );
};

export default AuditLogViewer;
