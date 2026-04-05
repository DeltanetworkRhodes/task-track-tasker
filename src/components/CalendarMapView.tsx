import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, User, Navigation, CalendarDays, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MapAppointment {
  id: string;
  sr_id: string;
  appointment_at: string;
  customer_name: string | null;
  area: string | null;
  latitude?: number | null;
  longitude?: number | null;
  assignment?: {
    status: string;
    technician_name: string;
    technician_id: string | null;
    address?: string;
    building_id_hemd?: string;
  };
}

interface UnscheduledOnMap {
  id: string;
  sr_id: string;
  area: string;
  status: string;
  technician_name: string;
  technician_id: string | null;
  customer_name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  building_id_hemd?: string | null;
}

const statusMarkerColors: Record<string, string> = {
  pending: "#f59e0b",
  inspection: "#f97316",
  pre_committed: "#3b82f6",
  construction: "#8b5cf6",
  completed: "#10b981",
  submitted: "#14b8a6",
  cancelled: "#ef4444",
  paid: "#16a34a",
};

const techColors = [
  "#3b82f6", "#8b5cf6", "#ef4444", "#f59e0b", "#10b981",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

function createNumberedIcon(index: number, color: string) {
  return L.divIcon({
    className: "",
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
    html: `<div style="position:relative;width:32px;height:40px;">
      <svg width="32" height="40" viewBox="0 0 32 40">
        <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 24 16 24s16-12 16-24C32 7.2 24.8 0 16 0z" fill="${color}" stroke="white" stroke-width="2"/>
      </svg>
      <span style="position:absolute;top:6px;left:0;right:0;text-align:center;color:white;font-size:13px;font-weight:bold;">${index}</span>
    </div>`,
  });
}

function createDotIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);opacity:0.8;"></div>`,
  });
}

interface CalendarMapViewProps {
  appointments: MapAppointment[];
  dateLabel: string;
  unscheduledAssignments?: UnscheduledOnMap[];
}

type MapMode = "appointments" | "all";

interface GeocodedItem {
  type: "appointment" | "unscheduled";
  lat: number;
  lng: number;
  original: MapAppointment | UnscheduledOnMap;
  source: "coords" | "registry" | "hemd";
}

const CalendarMapView = ({ appointments, dateLabel, unscheduledAssignments = [] }: CalendarMapViewProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [mapMode, setMapMode] = useState<MapMode>("all");
  const [geocodedAppts, setGeocodedAppts] = useState<GeocodedItem[]>([]);
  const [geocodedUnscheduled, setGeocodedUnscheduled] = useState<GeocodedItem[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeStats, setGeocodeStats] = useState({ fromCoords: 0, fromRegistry: 0, fromHemd: 0, notFound: 0 });

  // Resolve coordinates for all items using buildings_registry + HEMD
  const resolveLocations = useCallback(async () => {
    setIsGeocoding(true);

    const apptResults: GeocodedItem[] = [];
    const unscheduledResults: GeocodedItem[] = [];
    let fromCoords = 0, fromRegistry = 0, fromHemd = 0, notFound = 0;

    // Collect all items needing resolution
    type NeedResolution = {
      itemType: "appointment" | "unscheduled";
      original: MapAppointment | UnscheduledOnMap;
      address?: string;
      area?: string;
      building_id_hemd?: string | null;
    };

    const needResolution: NeedResolution[] = [];

    // Sort appointments by time
    const sortedAppts = [...appointments].sort(
      (a, b) => new Date(a.appointment_at).getTime() - new Date(b.appointment_at).getTime()
    );

    // Step 1: Separate items with coords from those needing lookup
    for (const appt of sortedAppts) {
      if (appt.latitude && appt.longitude) {
        apptResults.push({ type: "appointment", lat: Number(appt.latitude), lng: Number(appt.longitude), original: appt, source: "coords" });
        fromCoords++;
      } else {
        needResolution.push({
          itemType: "appointment",
          original: appt,
          address: appt.assignment?.address,
          area: appt.area || undefined,
          building_id_hemd: appt.assignment?.building_id_hemd,
        });
      }
    }

    for (const a of unscheduledAssignments) {
      if (a.latitude && a.longitude) {
        unscheduledResults.push({ type: "unscheduled", lat: Number(a.latitude), lng: Number(a.longitude), original: a, source: "coords" });
        fromCoords++;
      } else {
        needResolution.push({
          itemType: "unscheduled",
          original: a,
          address: a.address,
          area: a.area || undefined,
          building_id_hemd: a.building_id_hemd,
        });
      }
    }

    // Step 2: Batch lookup from buildings_registry
    if (needResolution.length > 0) {
      try {
        // Collect all building IDs and addresses to search
        const buildingIds = needResolution
          .map(n => n.building_id_hemd)
          .filter((id): id is string => !!id);

        const addresses = needResolution
          .filter(n => !n.building_id_hemd && n.address)
          .map(n => n.address!)
          .filter(Boolean);

        // Query by building_id first
        let registryResults: Array<{ building_id: string | null; address: string; latitude: number | null; longitude: number | null }> = [];

        if (buildingIds.length > 0) {
          const { data } = await supabase
            .from("buildings_registry")
            .select("building_id, address, latitude, longitude")
            .in("building_id", buildingIds)
            .not("latitude", "is", null)
            .not("longitude", "is", null);
          if (data) registryResults.push(...data);
        }

        // Also search by address patterns
        if (addresses.length > 0) {
          for (const addr of addresses.slice(0, 30)) {
            // Extract street name for matching
            const streetMatch = addr.match(/^([A-ZΑ-Ωα-ωά-ώ\s]+)/i);
            if (streetMatch && streetMatch[1].trim().length > 3) {
              const { data } = await supabase
                .from("buildings_registry")
                .select("building_id, address, latitude, longitude")
                .ilike("address", `%${streetMatch[1].trim()}%`)
                .not("latitude", "is", null)
                .not("longitude", "is", null)
                .limit(5);
              if (data) registryResults.push(...data);
            }
          }
        }

        // Build lookup maps
        const byBuildingId = new Map<string, { lat: number; lng: number }>();
        const byAddress = new Map<string, { lat: number; lng: number }>();

        for (const r of registryResults) {
          if (r.latitude && r.longitude) {
            if (r.building_id) byBuildingId.set(r.building_id, { lat: Number(r.latitude), lng: Number(r.longitude) });
            byAddress.set(r.address.toUpperCase(), { lat: Number(r.latitude), lng: Number(r.longitude) });
          }
        }

        // Match items against registry
        const stillNeedResolution: NeedResolution[] = [];

        for (const item of needResolution) {
          let found: { lat: number; lng: number } | null = null;

          // Try building_id match
          if (item.building_id_hemd && byBuildingId.has(item.building_id_hemd)) {
            found = byBuildingId.get(item.building_id_hemd)!;
          }

          // Try address match
          if (!found && item.address) {
            const upperAddr = item.address.toUpperCase();
            for (const [regAddr, coords] of byAddress) {
              if (regAddr.includes(upperAddr) || upperAddr.includes(regAddr)) {
                found = coords;
                break;
              }
            }
          }

          if (found) {
            const geoItem: GeocodedItem = {
              type: item.itemType,
              lat: found.lat,
              lng: found.lng,
              original: item.original,
              source: "registry",
            };
            if (item.itemType === "appointment") apptResults.push(geoItem);
            else unscheduledResults.push(geoItem);
            fromRegistry++;
          } else {
            stillNeedResolution.push(item);
          }
        }

        // Step 3: Use HEMD lookup for remaining (batch, max 10 to avoid overload)
        const hemdBatch = stillNeedResolution.filter(n => n.address).slice(0, 10);
        for (const item of hemdBatch) {
          try {
            const { data, error } = await supabase.functions.invoke("lookup-building-id", {
              body: {
                address: item.address,
                area: item.area,
                auto_save: false,
              },
            });

            if (!error && data?.results?.length > 0) {
              const best = data.results[0];
              if (best.latitude && best.longitude) {
                const geoItem: GeocodedItem = {
                  type: item.itemType,
                  lat: best.latitude,
                  lng: best.longitude,
                  original: item.original,
                  source: "hemd",
                };
                if (item.itemType === "appointment") apptResults.push(geoItem);
                else unscheduledResults.push(geoItem);
                fromHemd++;
                continue;
              }
            }
          } catch (e) {
            console.warn("HEMD lookup failed for", item.address, e);
          }
          notFound++;
        }

        // Count remaining not-found items
        notFound += stillNeedResolution.length - hemdBatch.length;

      } catch (err) {
        console.error("Location resolution error:", err);
        notFound += needResolution.length;
      }
    }

    // Re-sort appointments by time
    apptResults.sort((a, b) => {
      const aAppt = a.original as MapAppointment;
      const bAppt = b.original as MapAppointment;
      return new Date(aAppt.appointment_at).getTime() - new Date(bAppt.appointment_at).getTime();
    });

    setGeocodedAppts(apptResults);
    setGeocodedUnscheduled(unscheduledResults);
    setGeocodeStats({ fromCoords, fromRegistry, fromHemd, notFound });
    setIsGeocoding(false);
  }, [appointments, unscheduledAssignments]);

  useEffect(() => { resolveLocations(); }, [resolveLocations]);

  // Group appointments by technician
  const techGroups = useMemo(() => {
    const map = new Map<string, GeocodedItem[]>();
    geocodedAppts.forEach((item) => {
      const appt = item.original as MapAppointment;
      const techId = appt.assignment?.technician_id || "__unassigned__";
      if (!map.has(techId)) map.set(techId, []);
      map.get(techId)!.push(item);
    });
    return map;
  }, [geocodedAppts]);

  const techColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const techIds = new Set<string>();
    geocodedAppts.forEach((item) => {
      const appt = item.original as MapAppointment;
      if (appt.assignment?.technician_id) techIds.add(appt.assignment.technician_id);
    });
    geocodedUnscheduled.forEach((item) => {
      const a = item.original as UnscheduledOnMap;
      if (a.technician_id) techIds.add(a.technician_id);
    });
    Array.from(techIds).forEach((id, i) => {
      map.set(id, techColors[i % techColors.length]);
    });
    return map;
  }, [geocodedAppts, geocodedUnscheduled]);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current).setView([37.98, 23.73], 10);
    L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      attribution: "&copy; Google Maps",
      maxZoom: 20,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    map.eachLayer((layer) => {
      if (layer instanceof L.Polyline && !(layer instanceof L.TileLayer)) layer.remove();
    });

    const allCoords: L.LatLngExpression[] = [];

    // 1) Draw scheduled appointments
    if (geocodedAppts.length > 0) {
      let counter = 1;
      Array.from(techGroups.keys()).forEach((techId) => {
        const techItems = techGroups.get(techId) || [];
        const color = techColorMap.get(techId) || techColors[0];
        const coords: L.LatLngExpression[] = [];

        techItems.forEach((item) => {
          const appt = item.original as MapAppointment;
          const icon = createNumberedIcon(counter, color);
          const time = new Date(appt.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
          const techName = appt.assignment?.technician_name || "—";
          const sourceLabel = item.source === "registry" ? "📋 Μητρώο κτιρίων" : item.source === "hemd" ? "🔗 ΧΕΜΔ" : "";

          const popup = `
            <div style="font-size:13px;min-width:180px;">
              <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">#${counter} ${appt.sr_id}</div>
              <div style="font-size:11px;color:#666;">🕐 ${time}</div>
              <div style="font-size:11px;color:#666;">👤 ${techName}</div>
              ${appt.customer_name ? `<div style="font-size:11px;color:#666;">📋 ${appt.customer_name}</div>` : ""}
              ${appt.area ? `<div style="font-size:11px;color:#666;">📍 ${appt.area}</div>` : ""}
              ${appt.assignment?.address ? `<div style="font-size:11px;color:#666;">🏠 ${appt.assignment.address}</div>` : ""}
              ${sourceLabel ? `<div style="font-size:9px;color:#f59e0b;margin-top:2px;">${sourceLabel}</div>` : ""}
              <div style="margin-top:4px;"><span style="background:${color};color:white;padding:1px 6px;border-radius:4px;font-size:10px;">Ραντεβού</span></div>
            </div>
          `;

          const marker = L.marker([item.lat, item.lng], { icon }).bindPopup(popup).addTo(map);
          markersRef.current.push(marker);
          coords.push([item.lat, item.lng]);
          allCoords.push([item.lat, item.lng]);
          counter++;
        });

        if (coords.length > 1) {
          L.polyline(coords, { color, weight: 3, opacity: 0.7, dashArray: "8, 6" }).addTo(map);
        }
      });
    }

    // 2) Draw unscheduled
    if (mapMode === "all" && geocodedUnscheduled.length > 0) {
      geocodedUnscheduled.forEach((item) => {
        const a = item.original as UnscheduledOnMap;
        const statusColor = statusMarkerColors[a.status] || "#9ca3af";
        const icon = createDotIcon(statusColor);
        const sourceLabel = item.source === "registry" ? "📋 Μητρώο κτιρίων" : item.source === "hemd" ? "🔗 ΧΕΜΔ" : "";

        const popup = `
          <div style="font-size:13px;min-width:180px;">
            <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">${a.sr_id}</div>
            <div style="font-size:11px;color:#666;">👤 ${a.technician_name}</div>
            ${a.customer_name ? `<div style="font-size:11px;color:#666;">📋 ${a.customer_name}</div>` : ""}
            ${a.area ? `<div style="font-size:11px;color:#666;">📍 ${a.area}</div>` : ""}
            ${a.address ? `<div style="font-size:11px;color:#666;">🏠 ${a.address}</div>` : ""}
            ${sourceLabel ? `<div style="font-size:9px;color:#f59e0b;margin-top:2px;">${sourceLabel}</div>` : ""}
            <div style="margin-top:4px;"><span style="background:${statusColor};color:white;padding:1px 6px;border-radius:4px;font-size:10px;">Χωρίς ραντεβού</span></div>
          </div>
        `;

        const marker = L.marker([item.lat, item.lng], { icon }).bindPopup(popup).addTo(map);
        markersRef.current.push(marker);
        allCoords.push([item.lat, item.lng]);
      });
    }

    if (allCoords.length > 0) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40], maxZoom: 15 });
    }
  }, [geocodedAppts, techGroups, techColorMap, mapMode, geocodedUnscheduled]);

  // No-location items
  const noLocationAppts = appointments.filter(
    (a) => !a.latitude && !a.longitude && !geocodedAppts.some((g) => g.original === a)
  );
  const noLocationUnscheduled = unscheduledAssignments.filter(
    (a) => !a.latitude && !a.longitude && !geocodedUnscheduled.some((g) => g.original === a)
  );

  const totalOnMap = geocodedAppts.length + (mapMode === "all" ? geocodedUnscheduled.length : 0);
  const totalNoLocation = noLocationAppts.length + (mapMode === "all" ? noLocationUnscheduled.length : 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg">
          <Button variant={mapMode === "all" ? "default" : "ghost"} size="sm" className="gap-1.5 text-[10px] h-7" onClick={() => setMapMode("all")}>
            <MapPin className="h-3 w-3" />
            Όλα τα SR ({geocodedAppts.length + geocodedUnscheduled.length})
          </Button>
          <Button variant={mapMode === "appointments" ? "default" : "ghost"} size="sm" className="gap-1.5 text-[10px] h-7" onClick={() => setMapMode("appointments")}>
            <CalendarDays className="h-3 w-3" />
            Μόνο ραντεβού ({geocodedAppts.length})
          </Button>
        </div>

        {isGeocoding && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Αναζήτηση τοποθεσιών...
          </div>
        )}

        {!isGeocoding && (geocodeStats.fromRegistry > 0 || geocodeStats.fromHemd > 0) && (
          <div className="flex items-center gap-2">
            {geocodeStats.fromRegistry > 0 && (
              <Badge variant="outline" className="text-[9px] gap-1">📋 {geocodeStats.fromRegistry} από μητρώο</Badge>
            )}
            {geocodeStats.fromHemd > 0 && (
              <Badge variant="outline" className="text-[9px] gap-1">🔗 {geocodeStats.fromHemd} από ΧΕΜΔ</Badge>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground ml-auto">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded-full border-2 border-white shadow" style={{ background: "#3b82f6" }}>
              <span className="block text-[8px] text-white text-center leading-[12px] font-bold">1</span>
            </span>
            Ραντεβού
          </span>
          {mapMode === "all" && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-white shadow opacity-80" style={{ background: "#f59e0b" }} />
              Χωρίς ραντεβού
            </span>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="h-[55vh] min-h-[350px]">
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </Card>

      {techGroups.size > 0 && (
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Navigation className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-foreground">Διαδρομές Τεχνικών</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {Array.from(techGroups.entries()).map(([techId, items]) => {
              const appt = items[0]?.original as MapAppointment;
              const techName = appt?.assignment?.technician_name || "Χωρίς τεχνικό";
              const color = techColorMap.get(techId) || techColors[0];
              return (
                <div key={techId} className="flex items-center gap-1.5 text-xs">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="font-medium text-foreground">{techName}</span>
                  <span className="text-muted-foreground">({items.length} ραντεβού)</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {totalNoLocation > 0 && (
        <Card className="p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Δεν βρέθηκε τοποθεσία ({totalNoLocation})
          </p>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {noLocationAppts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] font-bold">{a.sr_id}</Badge>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(a.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {a.area && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.area}</span>}
                {a.assignment?.address && <span className="text-[10px] truncate max-w-[200px]">🏠 {a.assignment.address}</span>}
              </div>
            ))}
            {mapMode === "all" && noLocationUnscheduled.slice(0, 20).map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] font-bold">{a.sr_id}</Badge>
                {a.area && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.area}</span>}
                {a.address && <span className="text-[10px] truncate max-w-[200px]">🏠 {a.address}</span>}
                {a.technician_name && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {a.technician_name}</span>}
              </div>
            ))}
            {mapMode === "all" && noLocationUnscheduled.length > 20 && (
              <p className="text-[10px] text-muted-foreground">+{noLocationUnscheduled.length - 20} ακόμα</p>
            )}
          </div>
        </Card>
      )}

      {totalOnMap === 0 && totalNoLocation === 0 && !isGeocoding && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Δεν υπάρχουν ραντεβού για {dateLabel}
        </div>
      )}
    </div>
  );
};

export default CalendarMapView;
