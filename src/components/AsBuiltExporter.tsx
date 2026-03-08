import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { generateAsBuilt } from "@/lib/generateAsBuilt";
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

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateAsBuilt(srId);
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => toast.warning(w));
      }
      toast.success(`AS-BUILD για ${srId} δημιουργήθηκε!`);
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα δημιουργίας AS-BUILD");
      console.error("AS-BUILD error:", err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled || generating}
      onClick={handleGenerate}
      className={className}
    >
      {generating ? (
        <Loader2 className="h-4 w-4 animate-spin mr-1" />
      ) : (
        <FileSpreadsheet className="h-4 w-4 mr-1" />
      )}
      AS-BUILD
    </Button>
  );
};

export default AsBuiltExporter;
