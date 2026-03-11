import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNavigate } from "react-router-dom";

const DISMISS_KEY = "push_dismissed_at";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

const NotificationPermissionCard = () => {
  const { isSupported, permission, subscribe } = usePushNotifications();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (!stored) {
      setDismissed(false);
      return;
    }
    const elapsed = Date.now() - parseInt(stored, 10);
    setDismissed(elapsed < SEVEN_DAYS);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleSubscribe = async () => {
    await subscribe();
    setDismissed(true);
  };

  // iOS / unsupported fallback
  if (!isSupported) {
    return (
      <Card className="border-border bg-muted/50 mb-4">
        <CardContent className="flex items-start gap-3 p-4">
          <Bell className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Ο browser σας δεν υποστηρίζει ειδοποιήσεις
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Εγκαταστήστε την εφαρμογή στην αρχική οθόνη για καλύτερη εμπειρία.
            </p>
            <Button
              variant="link"
              size="sm"
              className="px-0 h-auto mt-1 text-xs"
              onClick={() => navigate("/install")}
            >
              Οδηγίες →
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Permission denied
  if (permission === "denied") {
    return (
      <Card className="border-destructive/30 bg-destructive/5 mb-4">
        <CardContent className="flex items-start gap-3 p-4">
          <Bell className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Οι ειδοποιήσεις είναι αποκλεισμένες
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ενεργοποιήστε τες από τις ρυθμίσεις του browser.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Already granted or dismissed
  if (permission === "granted" || dismissed) return null;

  return (
    <Card className="border-primary/20 bg-primary/5 mb-4">
      <CardContent className="flex items-start gap-3 p-4">
        <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            🔔 Ειδοποιήσεις Νέων Αναθέσεων
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Μάθετε αμέσως όταν σας ανατεθεί SR
          </p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={handleSubscribe} className="h-8 text-xs">
              Ενεργοποίηση
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="h-8 text-xs text-muted-foreground"
            >
              Αργότερα
            </Button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
};

export default NotificationPermissionCard;
