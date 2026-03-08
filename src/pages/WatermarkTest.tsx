import { useState } from "react";
import { applyWatermark, type WatermarkData } from "@/lib/watermark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, Upload, Loader2 } from "lucide-react";

const WatermarkTest = () => {
  const [original, setOriginal] = useState<string | null>(null);
  const [watermarked, setWatermarked] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    
    setProcessing(true);
    setOriginal(URL.createObjectURL(file));

    const wmData: WatermarkData = {
      srId: "2-33991234",
      address: "Λεωφ. Ελευθερίας 42, Ρόδος",
      latitude: 36.434507,
      longitude: 28.217456,
      datetime: new Date(),
    };

    const result = await applyWatermark(file, wmData);
    setWatermarked(URL.createObjectURL(result));
    setProcessing(false);
  };

  const handleDemo = async () => {
    // Create a demo canvas image to test with
    setProcessing(true);
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d")!;
    
    // Draw a realistic building-like scene
    const grad = ctx.createLinearGradient(0, 0, 0, 1080);
    grad.addColorStop(0, "#87CEEB");
    grad.addColorStop(0.6, "#B0C4DE");
    grad.addColorStop(0.6, "#8B7355");
    grad.addColorStop(1, "#6B5B45");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1920, 1080);
    
    // Building shape
    ctx.fillStyle = "#D2B48C";
    ctx.fillRect(400, 200, 500, 500);
    ctx.fillRect(1000, 300, 400, 400);
    
    // Windows
    ctx.fillStyle = "#4682B4";
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        ctx.fillRect(430 + col * 120, 230 + row * 120, 60, 80);
      }
    }
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        ctx.fillRect(1030 + col * 120, 330 + row * 120, 60, 80);
      }
    }
    
    // Door
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(600, 580, 80, 120);
    
    // Text label
    ctx.fillStyle = "#333";
    ctx.font = "bold 28px Arial";
    ctx.fillText("Demo: Κτίριο Πελάτη — FTTH Installation", 450, 180);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "demo-building.jpg", { type: "image/jpeg" });
      setOriginal(URL.createObjectURL(file));
      
      const wmData: WatermarkData = {
        srId: "2-33991234",
        address: "Λεωφ. Ελευθερίας 42, Ρόδος",
        latitude: 36.434507,
        longitude: 28.217456,
        datetime: new Date(),
      };
      const result = await applyWatermark(file, wmData);
      setWatermarked(URL.createObjectURL(result));
      setProcessing(false);
    }, "image/jpeg", 0.92);
  };

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground">🖼️ Watermark Preview Test</h1>
      <p className="text-muted-foreground text-sm">
        Δοκιμαστικό εργαλείο — δείτε πώς εμφανίζεται το watermark σε φωτογραφίες.
      </p>

      <div className="flex gap-3">
        <Button onClick={handleDemo} disabled={processing} className="gap-2">
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Demo Εικόνα
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "image/*";
            inp.onchange = () => {
              if (inp.files?.[0]) handleFile(inp.files[0]);
            };
            inp.click();
          }}
        >
          <Upload className="h-4 w-4" />
          Ανέβασε δική σου
        </Button>
      </div>

      {processing && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Επεξεργασία watermark...
        </div>
      )}

      {original && watermarked && !processing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-3 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Πριν (Original)
            </h3>
            <img src={original} alt="Original" className="w-full rounded-lg border border-border" />
          </Card>
          <Card className="p-3 space-y-2">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">
              Μετά (Watermarked) ✅
            </h3>
            <img src={watermarked} alt="Watermarked" className="w-full rounded-lg border border-border" />
          </Card>
        </div>
      )}

      {watermarked && !processing && (
        <Card className="p-4 bg-muted/30 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Τι εμφανίζεται στο watermark:</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            <li><strong>SR:</strong> 2-33991234</li>
            <li><strong>Διεύθυνση:</strong> Λεωφ. Ελευθερίας 42, Ρόδος</li>
            <li><strong>GPS:</strong> 36.434507, 28.217456</li>
            <li><strong>Ημερομηνία:</strong> {new Date().toLocaleString("el-GR")}</li>
          </ul>
        </Card>
      )}
    </div>
  );
};

export default WatermarkTest;
