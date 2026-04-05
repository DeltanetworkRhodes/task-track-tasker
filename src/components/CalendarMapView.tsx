import { useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, User, Navigation } from "lucide-react";

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

interface CalendarMapViewProps {
  appointments: MapAppointment[];
  dateLabel: string;
}

const CalendarMapView = ({ appointments, dateLabel }: CalendarMapViewProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);

  // Sort appointments by time
  const sorted = useMemo(() => {
    return [...appointments]
      .filter((a) => a.latitude && a.longitude)
      .sort((a, b) => new Date(a.appointment_at).getTime() - new Date(b.appointment_at).getTime());
  }, [appointments]);

  // Group by technician for route coloring
  const techGroups = useMemo(() => {
    const map = new Map<string, MapAppointment[]>();
    sorted.forEach((a) => {
      const techId = a.assignment?.technician_id || "__unassigned__";
      if (!map.has(techId)) map.set(techId, []);
      map.get(techId)!.push(a);
    });
    return map;
  }, [sorted]);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView([36.4341, 28.2176], 12);
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

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Remove any existing polylines
    map.eachLayer((layer) => {
      if (layer instanceof L.Polyline && !(layer instanceof L.TileLayer)) {
        layer.remove();
      }
    });

    if (sorted.length === 0) return;

    let counter = 1;
    const techIds = Array.from(techGroups.keys());

    techIds.forEach((techId, techIndex) => {
      const techAppts = techGroups.get(techId) || [];
      const color = techColors[techIndex % techColors.length];
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
          </div>
        `;

        const marker = L.marker([appt.latitude, appt.longitude], { icon })
          .bindPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
        coords.push([appt.latitude, appt.longitude]);
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

    // Fit bounds
    const allCoords = sorted
      .filter((a) => a.latitude && a.longitude)
      .map((a) => [a.latitude!, a.longitude!] as L.LatLngExpression);

    if (allCoords.length > 0) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40], maxZoom: 15 });
    }
  }, [sorted, techGroups]);

  const noGeoAppts = appointments.filter((a) => !a.latitude || !a.longitude);

  return (
    <div className="space-y-3">
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
            {Array.from(techGroups.entries()).map(([techId, appts], i) => {
              const techName = appts[0]?.assignment?.technician_name || "Χωρίς τεχνικό";
              const color = techColors[i % techColors.length];
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

      {/* Appointments without coordinates */}
      {noGeoAppts.length > 0 && (
        <Card className="p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Χωρίς συντεταγμένες ({noGeoAppts.length})
          </p>
          <div className="space-y-1.5">
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
                {a.assignment && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {a.assignment.technician_name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {appointments.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Δεν υπάρχουν ραντεβού για {dateLabel}
        </div>
      )}
    </div>
  );
};

export default CalendarMapView;
