import { useEffect, useRef, useMemo, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, User, Navigation, CalendarDays, List } from "lucide-react";

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
    html: `<div style="
      position:relative;width:32px;height:40px;
    ">
      <svg width="32" height="40" viewBox="0 0 32 40">
        <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 24 16 24s16-12 16-24C32 7.2 24.8 0 16 0z" fill="${color}" stroke="white" stroke-width="2"/>
      </svg>
      <span style="
        position:absolute;top:6px;left:0;right:0;
        text-align:center;color:white;font-size:13px;font-weight:bold;
      ">${index}</span>
    </div>`,
  });
}

function createDotIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
    html: `<div style="
      width:18px;height:18px;border-radius:50%;
      background:${color};border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.3);
      opacity:0.8;
    "></div>`,
  });
}

interface CalendarMapViewProps {
  appointments: MapAppointment[];
  dateLabel: string;
  unscheduledAssignments?: UnscheduledOnMap[];
}

type MapMode = "appointments" | "all";

const CalendarMapView = ({ appointments, dateLabel, unscheduledAssignments = [] }: CalendarMapViewProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [mapMode, setMapMode] = useState<MapMode>("all");

  // Appointments with coords
  const sorted = useMemo(() => {
    return [...appointments]
      .filter((a) => a.latitude && a.longitude)
      .sort((a, b) => new Date(a.appointment_at).getTime() - new Date(b.appointment_at).getTime());
  }, [appointments]);

  // Unscheduled with coords
  const unscheduledWithCoords = useMemo(() => {
    return unscheduledAssignments.filter(a => a.latitude && a.longitude);
  }, [unscheduledAssignments]);

  // Group appointments by technician
  const techGroups = useMemo(() => {
    const map = new Map<string, MapAppointment[]>();
    sorted.forEach((a) => {
      const techId = a.assignment?.technician_id || "__unassigned__";
      if (!map.has(techId)) map.set(techId, []);
      map.get(techId)!.push(a);
    });
    return map;
  }, [sorted]);

  // Build stable tech color map
  const techColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const techIds = new Set<string>();
    sorted.forEach(a => { if (a.assignment?.technician_id) techIds.add(a.assignment.technician_id); });
    unscheduledWithCoords.forEach(a => { if (a.technician_id) techIds.add(a.technician_id); });
    Array.from(techIds).forEach((id, i) => {
      map.set(id, techColors[i % techColors.length]);
    });
    return map;
  }, [sorted, unscheduledWithCoords]);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView([37.98, 23.73], 10);
    L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      attribution: "&copy; Google Maps",
      maxZoom: 20,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers whenever data or mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers & polylines
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    map.eachLayer((layer) => {
      if (layer instanceof L.Polyline && !(layer instanceof L.TileLayer)) {
        layer.remove();
      }
    });

    const allCoords: L.LatLngExpression[] = [];

    // 1) Draw scheduled appointments (numbered markers with routes)
    if (sorted.length > 0) {
      let counter = 1;
      const techIds = Array.from(techGroups.keys());

      techIds.forEach((techId) => {
        const techAppts = techGroups.get(techId) || [];
        const color = techColorMap.get(techId) || techColors[0];
        const coords: L.LatLngExpression[] = [];

        techAppts.forEach((appt) => {
          if (!appt.latitude || !appt.longitude) return;

          const icon = createNumberedIcon(counter, color);
          const time = new Date(appt.appointment_at).toLocaleTimeString("el-GR", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const techName = appt.assignment?.technician_name || "—";

          const popup = `
            <div style="font-size:13px;min-width:180px;">
              <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">
                #${counter} ${appt.sr_id}
              </div>
              <div style="font-size:11px;color:#666;">🕐 ${time}</div>
              <div style="font-size:11px;color:#666;">👤 ${techName}</div>
              ${appt.customer_name ? `<div style="font-size:11px;color:#666;">📋 ${appt.customer_name}</div>` : ""}
              ${appt.area ? `<div style="font-size:11px;color:#666;">📍 ${appt.area}</div>` : ""}
              ${appt.assignment?.address ? `<div style="font-size:11px;color:#666;">🏠 ${appt.assignment.address}</div>` : ""}
              <div style="margin-top:4px;"><span style="background:${color};color:white;padding:1px 6px;border-radius:4px;font-size:10px;">Ραντεβού</span></div>
            </div>
          `;

          const marker = L.marker([appt.latitude, appt.longitude], { icon })
            .bindPopup(popup)
            .addTo(map);
          markersRef.current.push(marker);
          coords.push([appt.latitude, appt.longitude]);
          allCoords.push([appt.latitude, appt.longitude]);
          counter++;
        });

        // Draw route line per technician
        if (coords.length > 1) {
          L.polyline(coords, {
            color,
            weight: 3,
            opacity: 0.7,
            dashArray: "8, 6",
          }).addTo(map);
        }
      });
    }

    // 2) Draw unscheduled assignments as dots (if mode is "all")
    if (mapMode === "all" && unscheduledWithCoords.length > 0) {
      unscheduledWithCoords.forEach((a) => {
        if (!a.latitude || !a.longitude) return;
        const statusColor = statusMarkerColors[a.status] || "#9ca3af";
        const icon = createDotIcon(statusColor);

        const popup = `
          <div style="font-size:13px;min-width:180px;">
            <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">
              ${a.sr_id}
            </div>
            <div style="font-size:11px;color:#666;">👤 ${a.technician_name}</div>
            ${a.customer_name ? `<div style="font-size:11px;color:#666;">📋 ${a.customer_name}</div>` : ""}
            ${a.area ? `<div style="font-size:11px;color:#666;">📍 ${a.area}</div>` : ""}
            ${a.address ? `<div style="font-size:11px;color:#666;">🏠 ${a.address}</div>` : ""}
            <div style="margin-top:4px;"><span style="background:${statusColor};color:white;padding:1px 6px;border-radius:4px;font-size:10px;">Χωρίς ραντεβού</span></div>
          </div>
        `;

        const marker = L.marker([a.latitude, a.longitude], { icon })
          .bindPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
        allCoords.push([a.latitude, a.longitude]);
      });
    }

    // Fit bounds
    if (allCoords.length > 0) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40], maxZoom: 15 });
    }
  }, [sorted, techGroups, techColorMap, mapMode, unscheduledWithCoords]);

  const noGeoAppts = appointments.filter((a) => !a.latitude || !a.longitude);
  const noGeoUnscheduled = unscheduledAssignments.filter(a => !a.latitude || !a.longitude);

  const totalOnMap = sorted.length + (mapMode === "all" ? unscheduledWithCoords.length : 0);
  const totalNoGeo = noGeoAppts.length + (mapMode === "all" ? noGeoUnscheduled.length : 0);

  return (
    <div className="space-y-3">
      {/* Map mode toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg">
          <Button
            variant={mapMode === "all" ? "default" : "ghost"}
            size="sm"
            className="gap-1.5 text-[10px] h-7"
            onClick={() => setMapMode("all")}
          >
            <MapPin className="h-3 w-3" />
            Όλα τα SR ({sorted.length + unscheduledWithCoords.length})
          </Button>
          <Button
            variant={mapMode === "appointments" ? "default" : "ghost"}
            size="sm"
            className="gap-1.5 text-[10px] h-7"
            onClick={() => setMapMode("appointments")}
          >
            <CalendarDays className="h-3 w-3" />
            Μόνο ραντεβού ({sorted.length})
          </Button>
        </div>
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

      {/* Route legend */}
      {techGroups.size > 0 && (
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Navigation className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-foreground">Διαδρομές Τεχνικών</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {Array.from(techGroups.entries()).map(([techId, appts]) => {
              const techName = appts[0]?.assignment?.technician_name || "Χωρίς τεχνικό";
              const color = techColorMap.get(techId) || techColors[0];
              return (
                <div key={techId} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-medium text-foreground">{techName}</span>
                  <span className="text-muted-foreground">({appts.length} ραντεβού)</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Summary of items without coordinates */}
      {totalNoGeo > 0 && (
        <Card className="p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Χωρίς συντεταγμένες ({totalNoGeo})
          </p>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {noGeoAppts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] font-bold">{a.sr_id}</Badge>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(a.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {a.area && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {a.area}
                  </span>
                )}
                <Badge variant="outline" className="text-[8px]">Ραντεβού</Badge>
              </div>
            ))}
            {mapMode === "all" && noGeoUnscheduled.slice(0, 20).map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] font-bold">{a.sr_id}</Badge>
                {a.area && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {a.area}
                  </span>
                )}
                {a.technician_name && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {a.technician_name}
                  </span>
                )}
              </div>
            ))}
            {mapMode === "all" && noGeoUnscheduled.length > 20 && (
              <p className="text-[10px] text-muted-foreground">+{noGeoUnscheduled.length - 20} ακόμα χωρίς συντεταγμένες</p>
            )}
          </div>
        </Card>
      )}

      {totalOnMap === 0 && totalNoGeo === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Δεν υπάρχουν ραντεβού για {dateLabel}
        </div>
      )}
    </div>
  );
};

export default CalendarMapView;
