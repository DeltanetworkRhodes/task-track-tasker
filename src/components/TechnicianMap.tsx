import { ExternalLink, MapPin, Navigation } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  assignments: any[];
}

const TechnicianMap = ({ assignments }: Props) => {
  const withAddress = assignments.filter((a) => a.address || (a.latitude && a.longitude));

  if (withAddress.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Δεν υπάρχουν αναθέσεις με διεύθυνση</p>
      </div>
    );
  }

  const getMapQuery = (a: any): string => {
    if (a.latitude && a.longitude) {
      return `${a.latitude},${a.longitude}`;
    }
    return a.address || "";
  };

  const openInMaps = (a: any) => {
    const query = getMapQuery(a);
    const encoded = encodeURIComponent(query);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, "_blank");
  };

  const navigateTo = (a: any) => {
    const query = getMapQuery(a);
    const encoded = encodeURIComponent(query);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, "_blank");
  };

  const openHemd = (assignment: any) => {
    if (assignment.latitude && assignment.longitude) {
      const hashData = {
        "FTTH/B": 1,
        "a3b_coverpointftthcoax_normal_dist_10th": 1,
        "Κάλυψη χαλκού": 0,
        "grid_square1000sql": 0,
        "Κινητή": 0,
        "zoom": 18,
        "center": {
          "lng": assignment.longitude,
          "lat": assignment.latitude
        }
      };
      const hash = encodeURIComponent(JSON.stringify(hashData));
      window.open(
        `https://www.broadband-assist.gov.gr/public/index_here.html#${hash}`,
        "_blank"
      );
      return;
    }

    if (assignment.building_id_hemd) {
      navigator.clipboard.writeText(assignment.building_id_hemd)
        .then(() => toast.info(
          `Building ID "${assignment.building_id_hemd}" αντιγράφηκε — κάντε paste στο broadband-assist`
        ))
        .catch(() => {});
    }
    window.open("https://www.broadband-assist.gov.gr/public/", "_blank");
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
              onClick={() => openInMaps(a)}
            >
              <MapPin className="h-3.5 w-3.5" />
              Χάρτης
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs flex-1"
              onClick={() => navigateTo(a)}
            >
              <Navigation className="h-3.5 w-3.5" />
              Πλοήγηση
            </Button>
          </div>
          {(a.building_id_hemd || (a.latitude && a.longitude)) && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={() => openHemd(a)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {a.latitude && a.longitude
                ? "🔗 ΧΕΜΔ — Άνοιγμα στο σημείο"
                : "🔗 ΧΕΜΔ — Αντιγραφή ID"}
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
};

export default TechnicianMap;
