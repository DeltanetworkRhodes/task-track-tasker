import { ExternalLink, MapPin, Navigation } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  assignments: any[];
}

const TechnicianMap = ({ assignments }: Props) => {
  const withAddress = assignments.filter((a) => a.address);

  if (withAddress.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Δεν υπάρχουν αναθέσεις με διεύθυνση</p>
      </div>
    );
  }

  const openInMaps = (address: string) => {
    const encoded = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, "_blank");
  };

  const navigateTo = (address: string) => {
    const encoded = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, "_blank");
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {withAddress.length} αναθέσεις με διεύθυνση
      </p>
      {withAddress.map((a) => (
        <Card key={a.id} className="p-4 space-y-3">
          <div>
            <p className="font-semibold text-sm text-foreground">SR {a.sr_id}</p>
            <p className="text-xs text-muted-foreground">{a.address}</p>
            {a.customer_name && (
              <p className="text-xs text-muted-foreground mt-1">{a.customer_name}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs flex-1"
              onClick={() => openInMaps(a.address)}
            >
              <MapPin className="h-3.5 w-3.5" />
              Χάρτης
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs flex-1"
              onClick={() => navigateTo(a.address)}
            >
              <Navigation className="h-3.5 w-3.5" />
              Πλοήγηση
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default TechnicianMap;
