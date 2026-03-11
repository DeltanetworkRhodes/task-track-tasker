import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileSpreadsheet, Loader2, AlertTriangle } from "lucide-react";
import { generateAsBuilt, preValidateAsBuilt } from "@/lib/generateAsBuilt";
import { toast } from "sonner";

interface AsBuiltExporterProps {
  srId: string;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

const AsBuiltExporter = ({
  srId,
  disabled = false,
  variant = "outline",
  size = "sm",
  className = "",
}: AsBuiltExporterProps) => {
  const [generating, setGenerating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [pendingWarnings, setPendingWarnings] = useState<string[] | null>(null);

  const doGenerate = async () => {
    setGenerating(true);
    setPendingWarnings(null);
    try {
      const result = await generateAsBuilt(srId);
      const warnCount = result.warnings.length;
      if (warnCount > 0) {
        result.warnings.forEach(w => toast.warning(w));
        toast.warning(`AS-BUILD δημιουργήθηκε με ${warnCount} προειδοποιήσεις`);
      } else {
        toast.success(`AS-BUILD για ${srId} δημιουργήθηκε!`);
      }
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα δημιουργίας AS-BUILD");
      console.error("AS-BUILD error:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async () => {
    setValidating(true);
    try {
      const warnings = await preValidateAsBuilt(srId);
      if (warnings.length >= 2) {
        setPendingWarnings(warnings);
      } else {
        await doGenerate();
      }
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα validation AS-BUILD");
      console.error("AS-BUILD validation error:", err);
    } finally {
      setValidating(false);
    }
  };

  const isLoading = generating || validating;

  return (
    <div className="inline-flex flex-col gap-2">
      <Button
        variant={variant}
        size={size}
        disabled={disabled || isLoading}
        onClick={handleGenerate}
        className={className}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-1" />
        ) : (
          <FileSpreadsheet className="h-4 w-4 mr-1" />
        )}
        AS-BUILD
      </Button>

      {pendingWarnings && (
        <Card className="p-3 space-y-2 border-amber-500/40 bg-amber-500/5 max-w-xs">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-xs font-semibold text-amber-700">⚠️ Ελλιπή Δεδομένα</span>
          </div>
          <ul className="space-y-0.5">
            {pendingWarnings.map((w, i) => (
              <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
                <span className="text-amber-500 mt-0.5">•</span>
                {w}
              </li>
            ))}
          </ul>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-[11px] h-7"
              onClick={() => setPendingWarnings(null)}
            >
              Ακύρωση
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-[11px] h-7 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={generating}
              onClick={doGenerate}
            >
              {generating ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Παραγωγή Ούτως ή Άλλως
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AsBuiltExporter;
