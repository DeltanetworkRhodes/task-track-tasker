import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, CheckCircle2, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallApp = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
            <h2 className="text-xl font-bold">Η εφαρμογή είναι εγκατεστημένη!</h2>
            <p className="text-muted-foreground">Μπορείς να την ανοίξεις από την αρχική οθόνη.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <Smartphone className="mx-auto h-12 w-12 text-primary mb-2" />
          <CardTitle className="text-xl">Εγκατάσταση Εφαρμογής</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground text-center">
            Εγκατέστησε την εφαρμογή Delta Fiber στο κινητό σου για γρήγορη πρόσβαση.
          </p>

          {isIOS ? (
            <div className="space-y-3 bg-muted rounded-lg p-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Share className="h-5 w-5" /> Οδηγίες για iPhone
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Πάτα το κουμπί <strong>Share</strong> (κάτω μέσα στο Safari)</li>
                <li>Επίλεξε <strong>«Προσθήκη στην αρχική οθόνη»</strong></li>
                <li>Πάτα <strong>«Προσθήκη»</strong></li>
              </ol>
            </div>
          ) : deferredPrompt ? (
            <Button onClick={handleInstall} className="w-full" size="lg">
              <Download className="mr-2 h-5 w-5" />
              Εγκατάσταση
            </Button>
          ) : (
            <div className="space-y-3 bg-muted rounded-lg p-4">
              <h3 className="font-semibold">Οδηγίες για Android</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Άνοιξε το μενού του browser (⋮)</li>
                <li>Επίλεξε <strong>«Εγκατάσταση εφαρμογής»</strong> ή <strong>«Προσθήκη στην αρχική οθόνη»</strong></li>
                <li>Πάτα <strong>«Εγκατάσταση»</strong></li>
              </ol>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InstallApp;
