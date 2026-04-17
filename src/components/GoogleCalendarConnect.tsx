import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Calendar, Loader2, Link2Off, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const GoogleCalendarConnect = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connection, setConnection] = useState<{ google_email: string | null; connected_at: string } | null>(null);

  const loadConnection = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("user_google_calendar_tokens")
      .select("google_email, connected_at")
      .eq("user_id", user.id)
      .maybeSingle();
    setConnection(data || null);
    setLoading(false);
  };

  useEffect(() => {
    loadConnection();
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "google-calendar-connected") {
        toast.success(`Συνδέθηκε ${event.data.email || "Google Calendar"}`);
        loadConnection();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-connect", {
        body: { redirectOrigin: window.location.href },
      });
      if (error) throw error;
      if (!data?.authUrl) throw new Error("Δεν επιστράφηκε auth URL");
      window.open(data.authUrl, "google-calendar-oauth", "width=600,height=700");
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα σύνδεσης");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Σίγουρα θέλεις να αποσυνδέσεις το Google Calendar;")) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke("google-calendar-disconnect");
      if (error) throw error;
      toast.success("Αποσυνδέθηκε");
      setConnection(null);
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα αποσύνδεσης");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Σύνδεση Google Calendar
        </CardTitle>
        <CardDescription>
          Συγχρονίζει αυτόματα τα ραντεβού πελατών στο προσωπικό σου Google Calendar — θα τα βλέπεις στο κινητό σου.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : connection ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-sm">Συνδεδεμένο:</span>
              <Badge variant="secondary">{connection.google_email || "Google account"}</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="gap-2"
            >
              {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2Off className="h-4 w-4" />}
              Αποσύνδεση
            </Button>
          </div>
        ) : (
          <Button onClick={handleConnect} disabled={connecting} className="gap-2">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
            Σύνδεση Google Calendar
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default GoogleCalendarConnect;
