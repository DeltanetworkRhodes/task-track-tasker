import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function NovaDashboard() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background container mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/client-selector")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Πίνακες Ελέγχου
        </Button>
        <h1 className="text-2xl font-bold text-foreground">📺 Nova Dashboard</h1>
      </div>
      <Card className="p-10 text-center">
        <h2 className="text-xl font-semibold text-foreground">🚧 Σύντομα διαθέσιμο</h2>
        <p className="text-muted-foreground mt-3 max-w-md mx-auto">
          Multi-service: Χαλκός, Δορυφορικά πιάτα, FWA, FTTH Γ' Φάση.
        </p>
      </Card>
    </div>
  );
}
