import { ExternalLink, Loader2, MapPin, Navigation } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

interface Props {
  assignments: any[];
}

const TechnicianMap = ({ assignments }: Props) => {
  const [loadingHemd, setLoadingHemd] = useState<string | null>(null);
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
    const parts = [a.address, a.municipality, a.area, "Ελλάδα"].filter(Boolean);
    return parts.join(", ");
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

  const openHemdDeepLink = (lat: number, lng: number, coverId?: string, address?: string) => {
    const hashData = {
      "FTTH/B": 1,
      "a3b_coverpointftthcoax_normal_dist_10th": 1,
      "Κάλυψη χαλκού": 0,
      "grid_square1000sql": 0,
      "Κινητή": 0,
      "zoom": 21,
      "center": { "lng": lng, "lat": lat }
    };
    const hash = encodeURIComponent(JSON.stringify(hashData));

    if (coverId) {
      navigator.clipboard.writeText(coverId).catch(() => {});
      toast.success(`Building ID: ${coverId} αντιγράφηκε`, {
        description: address || undefined,
        duration: 6000,
      });
    }

    window.open(
      `https://www.broadband-assist.gov.gr/public/index_here.html#${hash}`,
      "_blank"
    );
  };

  const openHemd = async (assignment: any) => {
    // If we already have coordinates, deep link directly
    if (assignment.latitude && assignment.longitude) {
      openHemdDeepLink(assignment.latitude, assignment.longitude, assignment.building_id_hemd, assignment.address);
      return;
    }

    // Otherwise, do a lookup to find coordinates
    setLoadingHemd(assignment.id);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-building-id", {
        body: {
          address: assignment.address,
          area: assignment.area,
          assignment_id: assignment.id,
          auto_save: false,
        },
      });

      if (error) throw error;

      if (data?.results?.length > 0) {
        const best = data.results[0];
        if (best.latitude && best.longitude) {
          openHemdDeepLink(best.latitude, best.longitude);
          return;
        }
      }

      // Fallback: just open the site
      toast.info("Δεν βρέθηκαν συντεταγμένες — ανοίγει το ΧΕΜΔ");
      if (assignment.building_id_hemd) {
        navigator.clipboard.writeText(assignment.building_id_hemd).catch(() => {});
        toast.info(`Building ID "${assignment.building_id_hemd}" αντιγράφηκε`);
      }
      window.open("https://www.broadband-assist.gov.gr/public/", "_blank");
    } catch (err: any) {
      console.error("HEMD lookup failed:", err);
      toast.error("Αποτυχία αναζήτησης ΧΕΜΔ");
      window.open("https://www.broadband-assist.gov.gr/public/", "_blank");
    } finally {
      setLoadingHemd(null);
    }
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
          {(a.building_id_hemd || a.address) && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={() => openHemd(a)}
              disabled={loadingHemd === a.id}
            >
              {loadingHemd === a.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              {a.latitude && a.longitude
                ? "🔗 ΧΕΜΔ — Άνοιγμα στο σημείο"
                : "🔗 ΧΕΜΔ — Εύρεση κτιρίου"}
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
};

export default TechnicianMap;
