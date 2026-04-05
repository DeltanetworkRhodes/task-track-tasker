import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, User, Navigation, CalendarDays, Loader2, Flame, BarChart3, Filter, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
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

interface CalendarMapViewProps {
  appointments: MapAppointment[];
  dateLabel: string;
  unscheduledAssignments?: UnscheduledOnMap[];
}

interface GeocodedItem {
  type: "appointment" | "unscheduled";
  lat: number;
  lng: number;
  original: MapAppointment | UnscheduledOnMap;
  source: "coords" | "registry" | "hemd";
  assignmentId?: string;
}

interface ProximityGroup {
  items: GeocodedItem[];
  center: { lat: number; lng: number };
  radius: number;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const statusMarkerColors: Record<string, string> = {
  pending: "#f59e0b", inspection: "#f97316", pre_committed: "#3b82f6",
  construction: "#8b5cf6", completed: "#10b981", submitted: "#14b8a6",
  cancelled: "#ef4444", paid: "#16a34a",
};

const statusLabelsGr: Record<string, string> = {
  pending: "Εκκρεμεί", inspection: "Αυτοψία", pre_committed: "Προδέσμευση",
  construction: "Κατασκευή", completed: "Ολοκληρώθηκε", submitted: "Υποβλήθηκε",
  cancelled: "Ακυρώθηκε", paid: "Πληρώθηκε",
};

const techColors = [
  "#3b82f6", "#8b5cf6", "#ef4444", "#f59e0b", "#10b981",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

type MapMode = "markers" | "heatmap";

// ──────────────────────────────────────────────
// Icon helpers
// ──────────────────────────────────────────────
function createNumberedIcon(index: number, color: string) {
  return L.divIcon({
    className: "", iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -40],
    html: `<div style="position:relative;width:32px;height:40px;">
      <svg width="32" height="40" viewBox="0 0 32 40"><path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 24 16 24s16-12 16-24C32 7.2 24.8 0 16 0z" fill="${color}" stroke="white" stroke-width="2"/></svg>
      <span style="position:absolute;top:6px;left:0;right:0;text-align:center;color:white;font-size:13px;font-weight:bold;">${index}</span></div>`,
  });
}

function createDotIcon(color: string) {
  return L.divIcon({
    className: "", iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -12],
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);opacity:0.8;"></div>`,
  });
}

// ──────────────────────────────────────────────
// Haversine distance (meters)
// ──────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ──────────────────────────────────────────────
// Popup with navigate button
// ──────────────────────────────────────────────
function buildPopupHtml(opts: {
  title: string; time?: string; techName?: string; customerName?: string | null;
  area?: string | null; address?: string; sourceLabel?: string;
  badgeColor: string; badgeText: string; lat: number; lng: number;
}) {
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${opts.lat},${opts.lng}`;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${opts.lat},${opts.lng}`;
  return `
    <div style="font-size:13px;min-width:200px;">
      <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">${opts.title}</div>
      ${opts.time ? `<div style="font-size:11px;color:#666;">🕐 ${opts.time}</div>` : ""}
      ${opts.techName ? `<div style="font-size:11px;color:#666;">👤 ${opts.techName}</div>` : ""}
      ${opts.customerName ? `<div style="font-size:11px;color:#666;">📋 ${opts.customerName}</div>` : ""}
      ${opts.area ? `<div style="font-size:11px;color:#666;">📍 ${opts.area}</div>` : ""}
      ${opts.address ? `<div style="font-size:11px;color:#666;">🏠 ${opts.address}</div>` : ""}
      ${opts.sourceLabel ? `<div style="font-size:9px;color:#f59e0b;margin-top:2px;">${opts.sourceLabel}</div>` : ""}
      <div style="margin-top:6px;display:flex;gap:4px;">
        <a href="${navUrl}" target="_blank" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:4px 8px;background:#3b82f6;color:white;border-radius:6px;font-size:11px;text-decoration:none;font-weight:600;">🧭 Πλοήγηση</a>
        <a href="${mapUrl}" target="_blank" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:4px 8px;background:#6b7280;color:white;border-radius:6px;font-size:11px;text-decoration:none;font-weight:600;">📍 Χάρτης</a>
      </div>
      <div style="margin-top:4px;"><span style="background:${opts.badgeColor};color:white;padding:1px 6px;border-radius:4px;font-size:10px;">${opts.badgeText}</span></div>
    </div>
  `;
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────
const CalendarMapView = ({ appointments, dateLabel, unscheduledAssignments = [] }: CalendarMapViewProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const heatLayerRef = useRef<any>(null);
  const proximityCirclesRef = useRef<L.Circle[]>([]);

  const [viewMode, setViewMode] = useState<"all" | "appointments">("all");
  const [mapMode, setMapMode] = useState<MapMode>("markers");
  const [showStats, setShowStats] = useState(false);
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const [geocodedAppts, setGeocodedAppts] = useState<GeocodedItem[]>([]);
  const [geocodedUnscheduled, setGeocodedUnscheduled] = useState<GeocodedItem[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeStats, setGeocodeStats] = useState({ fromCoords: 0, fromRegistry: 0, fromHemd: 0, notFound: 0 });
  const [autoSaved, setAutoSaved] = useState(0);

  // ──── Auto-save coords to assignments ────
  const autoSaveCoords = useCallback(async (items: GeocodedItem[]) => {
    const toSave = items.filter(i => i.source !== "coords" && i.assignmentId);
    if (toSave.length === 0) return;

    let saved = 0;
    for (const item of toSave) {
      try {
        const { error } = await supabase
          .from("assignments")
          .update({ latitude: item.lat, longitude: item.lng })
          .eq("id", item.assignmentId!);
        if (!error) saved++;
      } catch { /* skip */ }
    }
    if (saved > 0) {
      setAutoSaved(saved);
      toast.success(`Αποθηκεύτηκαν ${saved} τοποθεσίες στις αναθέσεις`);
    }
  }, []);

  // ──── Resolve locations ────
  const resolveLocations = useCallback(async () => {
    setIsGeocoding(true);
    const apptResults: GeocodedItem[] = [];
    const unscheduledResults: GeocodedItem[] = [];
    let fromCoords = 0, fromRegistry = 0, fromHemd = 0, notFound = 0;

    type NeedResolution = {
      itemType: "appointment" | "unscheduled";
      original: MapAppointment | UnscheduledOnMap;
      address?: string;
      area?: string;
      building_id_hemd?: string | null;
      assignmentId?: string;
    };

    const needResolution: NeedResolution[] = [];
    const sortedAppts = [...appointments].sort(
      (a, b) => new Date(a.appointment_at).getTime() - new Date(b.appointment_at).getTime()
    );

    for (const appt of sortedAppts) {
      if (appt.latitude && appt.longitude) {
        apptResults.push({ type: "appointment", lat: Number(appt.latitude), lng: Number(appt.longitude), original: appt, source: "coords" });
        fromCoords++;
      } else {
        needResolution.push({
          itemType: "appointment", original: appt,
          address: appt.assignment?.address, area: appt.area || undefined,
          building_id_hemd: appt.assignment?.building_id_hemd,
          assignmentId: appt.id,
        });
      }
    }

    for (const a of unscheduledAssignments) {
      if (a.latitude && a.longitude) {
        unscheduledResults.push({ type: "unscheduled", lat: Number(a.latitude), lng: Number(a.longitude), original: a, source: "coords" });
        fromCoords++;
      } else {
        needResolution.push({
          itemType: "unscheduled", original: a,
          address: a.address, area: a.area || undefined,
          building_id_hemd: a.building_id_hemd,
          assignmentId: a.id,
        });
      }
    }

    if (needResolution.length > 0) {
      try {
        const buildingIds = needResolution.map(n => n.building_id_hemd).filter((id): id is string => !!id);
        const addresses = needResolution.filter(n => !n.building_id_hemd && n.address).map(n => n.address!).filter(Boolean);

        let registryResults: Array<{ building_id: string | null; address: string; latitude: number | null; longitude: number | null }> = [];

        if (buildingIds.length > 0) {
          const { data } = await supabase.from("buildings_registry")
            .select("building_id, address, latitude, longitude")
            .in("building_id", buildingIds)
            .not("latitude", "is", null).not("longitude", "is", null);
          if (data) registryResults.push(...data);
        }

        if (addresses.length > 0) {
          for (const addr of addresses.slice(0, 30)) {
            const streetMatch = addr.match(/^([A-ZΑ-Ωα-ωά-ώ\s]+)/i);
            if (streetMatch && streetMatch[1].trim().length > 3) {
              const { data } = await supabase.from("buildings_registry")
                .select("building_id, address, latitude, longitude")
                .ilike("address", `%${streetMatch[1].trim()}%`)
                .not("latitude", "is", null).not("longitude", "is", null).limit(5);
              if (data) registryResults.push(...data);
            }
          }
        }

        const byBuildingId = new Map<string, { lat: number; lng: number }>();
        const byAddress = new Map<string, { lat: number; lng: number }>();
        for (const r of registryResults) {
          if (r.latitude && r.longitude) {
            if (r.building_id) byBuildingId.set(r.building_id, { lat: Number(r.latitude), lng: Number(r.longitude) });
            byAddress.set(r.address.toUpperCase(), { lat: Number(r.latitude), lng: Number(r.longitude) });
          }
        }

        const stillNeedResolution: NeedResolution[] = [];
        for (const item of needResolution) {
          let found: { lat: number; lng: number } | null = null;
          if (item.building_id_hemd && byBuildingId.has(item.building_id_hemd)) found = byBuildingId.get(item.building_id_hemd)!;
          if (!found && item.address) {
            const upperAddr = item.address.toUpperCase();
            for (const [regAddr, coords] of byAddress) {
              if (regAddr.includes(upperAddr) || upperAddr.includes(regAddr)) { found = coords; break; }
            }
          }

          if (found) {
            const geoItem: GeocodedItem = { type: item.itemType, lat: found.lat, lng: found.lng, original: item.original, source: "registry", assignmentId: item.assignmentId };
            if (item.itemType === "appointment") apptResults.push(geoItem); else unscheduledResults.push(geoItem);
            fromRegistry++;
          } else {
            stillNeedResolution.push(item);
          }
        }

        const hemdBatch = stillNeedResolution.filter(n => n.address).slice(0, 10);
        for (const item of hemdBatch) {
          try {
            const { data, error } = await supabase.functions.invoke("lookup-building-id", {
              body: { address: item.address, area: item.area, auto_save: false },
            });
            if (!error && data?.results?.length > 0) {
              const best = data.results[0];
              if (best.latitude && best.longitude) {
                const geoItem: GeocodedItem = { type: item.itemType, lat: best.latitude, lng: best.longitude, original: item.original, source: "hemd", assignmentId: item.assignmentId };
                if (item.itemType === "appointment") apptResults.push(geoItem); else unscheduledResults.push(geoItem);
                fromHemd++; continue;
              }
            }
          } catch { /* skip */ }
          notFound++;
        }
        notFound += stillNeedResolution.length - hemdBatch.length;
      } catch (err) {
        console.error("Location resolution error:", err);
        notFound += needResolution.length;
      }
    }

    apptResults.sort((a, b) => {
      const aA = a.original as MapAppointment, bA = b.original as MapAppointment;
      return new Date(aA.appointment_at).getTime() - new Date(bA.appointment_at).getTime();
    });

    setGeocodedAppts(apptResults);
    setGeocodedUnscheduled(unscheduledResults);
    setGeocodeStats({ fromCoords, fromRegistry, fromHemd, notFound });
    setIsGeocoding(false);

    // Auto-save resolved coords
    autoSaveCoords([...apptResults, ...unscheduledResults]);
  }, [appointments, unscheduledAssignments, autoSaveCoords]);

  useEffect(() => { resolveLocations(); }, [resolveLocations]);

  // ──── Derived data ────
  const allItems = useMemo(() => {
    const items = [...geocodedAppts];
    if (viewMode === "all") items.push(...geocodedUnscheduled);
    return items;
  }, [geocodedAppts, geocodedUnscheduled, viewMode]);

  // Apply status filters
  const filteredItems = useMemo(() => {
    if (statusFilters.size === 0) return allItems;
    return allItems.filter(item => {
      const status = item.type === "appointment"
        ? (item.original as MapAppointment).assignment?.status
        : (item.original as UnscheduledOnMap).status;
      return status && statusFilters.has(status);
    });
  }, [allItems, statusFilters]);

  const techGroups = useMemo(() => {
    const map = new Map<string, GeocodedItem[]>();
    filteredItems.filter(i => i.type === "appointment").forEach((item) => {
      const appt = item.original as MapAppointment;
      const techId = appt.assignment?.technician_id || "__unassigned__";
      if (!map.has(techId)) map.set(techId, []);
      map.get(techId)!.push(item);
    });
    return map;
  }, [filteredItems]);

  const techColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const techIds = new Set<string>();
    geocodedAppts.forEach(i => { const a = i.original as MapAppointment; if (a.assignment?.technician_id) techIds.add(a.assignment.technician_id); });
    geocodedUnscheduled.forEach(i => { const a = i.original as UnscheduledOnMap; if (a.technician_id) techIds.add(a.technician_id); });
    Array.from(techIds).forEach((id, i) => map.set(id, techColors[i % techColors.length]));
    return map;
  }, [geocodedAppts, geocodedUnscheduled]);

  // ──── Proximity detection ────
  const proximityGroups = useMemo(() => {
    const PROXIMITY_METERS = 100;
    const groups: ProximityGroup[] = [];
    const used = new Set<number>();

    for (let i = 0; i < filteredItems.length; i++) {
      if (used.has(i)) continue;
      const cluster: GeocodedItem[] = [filteredItems[i]];
      for (let j = i + 1; j < filteredItems.length; j++) {
        if (used.has(j)) continue;
        const dist = haversine(filteredItems[i].lat, filteredItems[i].lng, filteredItems[j].lat, filteredItems[j].lng);
        if (dist <= PROXIMITY_METERS) { cluster.push(filteredItems[j]); used.add(j); }
      }
      if (cluster.length >= 2) {
        used.add(i);
        const avgLat = cluster.reduce((s, c) => s + c.lat, 0) / cluster.length;
        const avgLng = cluster.reduce((s, c) => s + c.lng, 0) / cluster.length;
        groups.push({ items: cluster, center: { lat: avgLat, lng: avgLng }, radius: PROXIMITY_METERS });
      }
    }
    return groups;
  }, [filteredItems]);

  // ──── Map stats ────
  const mapStats = useMemo(() => {
    const techCounts = new Map<string, number>();
    const statusCounts = new Map<string, number>();
    let totalDist = 0, distPairs = 0;

    filteredItems.forEach(item => {
      const techId = item.type === "appointment"
        ? (item.original as MapAppointment).assignment?.technician_id || "unassigned"
        : (item.original as UnscheduledOnMap).technician_id || "unassigned";
      techCounts.set(techId, (techCounts.get(techId) || 0) + 1);

      const status = item.type === "appointment"
        ? (item.original as MapAppointment).assignment?.status || "pending"
        : (item.original as UnscheduledOnMap).status;
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    });

    // Average distance between consecutive appointments per tech
    for (const [, items] of techGroups) {
      for (let i = 1; i < items.length; i++) {
        totalDist += haversine(items[i - 1].lat, items[i - 1].lng, items[i].lat, items[i].lng);
        distPairs++;
      }
    }

    const avgDist = distPairs > 0 ? Math.round(totalDist / distPairs) : 0;
    const estimatedDriveMinutes = distPairs > 0 ? Math.round((totalDist / 1000) / 40 * 60) : 0; // ~40km/h avg

    return { techCounts, statusCounts, avgDist, estimatedDriveMinutes, totalItems: filteredItems.length };
  }, [filteredItems, techGroups]);

  // ──── All unique statuses ────
  const allStatuses = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach(item => {
      const s = item.type === "appointment"
        ? (item.original as MapAppointment).assignment?.status
        : (item.original as UnscheduledOnMap).status;
      if (s) set.add(s);
    });
    return Array.from(set);
  }, [allItems]);

  // ──── Init map ────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current).setView([37.98, 23.73], 10);
    L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      attribution: "&copy; Google Maps", maxZoom: 20,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ──── Update markers / heatmap ────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old layers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    proximityCirclesRef.current.forEach(c => c.remove());
    proximityCirclesRef.current = [];
    if (heatLayerRef.current) { map.removeLayer(heatLayerRef.current); heatLayerRef.current = null; }
    map.eachLayer(layer => { if (layer instanceof L.Polyline && !(layer instanceof L.TileLayer)) layer.remove(); });

    const allCoords: L.LatLngExpression[] = [];

    if (mapMode === "heatmap") {
      // Heatmap mode
      const heatData = filteredItems.map(item => [item.lat, item.lng, 1] as [number, number, number]);
      if (heatData.length > 0) {
        heatLayerRef.current = (L as any).heatLayer(heatData, {
          radius: 25, blur: 15, maxZoom: 17, max: 1.0,
          gradient: { 0.4: "blue", 0.6: "cyan", 0.7: "lime", 0.8: "yellow", 1: "red" },
        }).addTo(map);
        heatData.forEach(d => allCoords.push([d[0], d[1]]));
      }
    } else {
      // Markers mode
      // 1) Scheduled appointments (numbered)
      let counter = 1;
      Array.from(techGroups.keys()).forEach(techId => {
        const techItems = techGroups.get(techId) || [];
        const color = techColorMap.get(techId) || techColors[0];
        const coords: L.LatLngExpression[] = [];

        techItems.forEach(item => {
          const appt = item.original as MapAppointment;
          const icon = createNumberedIcon(counter, color);
          const time = new Date(appt.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
          const sourceLabel = item.source === "registry" ? "📋 Μητρώο κτιρίων" : item.source === "hemd" ? "🔗 ΧΕΜΔ" : "";

          const popup = buildPopupHtml({
            title: `#${counter} ${appt.sr_id}`, time, techName: appt.assignment?.technician_name || "—",
            customerName: appt.customer_name, area: appt.area, address: appt.assignment?.address,
            sourceLabel, badgeColor: color, badgeText: "Ραντεβού", lat: item.lat, lng: item.lng,
          });

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

      // 2) Unscheduled (dots)
      const unscheduledFiltered = filteredItems.filter(i => i.type === "unscheduled");
      unscheduledFiltered.forEach(item => {
        const a = item.original as UnscheduledOnMap;
        const statusColor = statusMarkerColors[a.status] || "#9ca3af";
        const icon = createDotIcon(statusColor);
        const sourceLabel = item.source === "registry" ? "📋 Μητρώο κτιρίων" : item.source === "hemd" ? "🔗 ΧΕΜΔ" : "";

        const popup = buildPopupHtml({
          title: a.sr_id, techName: a.technician_name,
          customerName: a.customer_name, area: a.area, address: a.address,
          sourceLabel, badgeColor: statusColor, badgeText: "Χωρίς ραντεβού", lat: item.lat, lng: item.lng,
        });

        const marker = L.marker([item.lat, item.lng], { icon }).bindPopup(popup).addTo(map);
        markersRef.current.push(marker);
        allCoords.push([item.lat, item.lng]);
      });

      // 3) Proximity circles
      proximityGroups.forEach(group => {
        const circle = L.circle([group.center.lat, group.center.lng], {
          radius: group.radius, color: "#f59e0b", weight: 2, opacity: 0.6,
          fillColor: "#f59e0b", fillOpacity: 0.1, dashArray: "5, 5",
        }).addTo(map);
        const srIds = group.items.map(i =>
          i.type === "appointment" ? (i.original as MapAppointment).sr_id : (i.original as UnscheduledOnMap).sr_id
        ).join(", ");
        circle.bindPopup(`<div style="font-size:12px;"><strong>⚠️ ${group.items.length} SR κοντά!</strong><br/><span style="font-size:10px;">${srIds}</span><br/><span style="font-size:10px;color:#666;">Μπορούν να ομαδοποιηθούν</span></div>`);
        proximityCirclesRef.current.push(circle);
      });
    }

    if (allCoords.length > 0) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40], maxZoom: 15 });
    }
  }, [filteredItems, techGroups, techColorMap, mapMode, proximityGroups]);

  // ──── No-location items ────
  const noLocationAppts = appointments.filter(a => !a.latitude && !a.longitude && !geocodedAppts.some(g => g.original === a));
  const noLocationUnscheduled = unscheduledAssignments.filter(a => !a.latitude && !a.longitude && !geocodedUnscheduled.some(g => g.original === a));
  const totalNoLocation = noLocationAppts.length + (viewMode === "all" ? noLocationUnscheduled.length : 0);

  const toggleStatus = (status: string) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* ──── Toolbar ──── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* View mode */}
        <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg">
          <Button variant={viewMode === "all" ? "default" : "ghost"} size="sm" className="gap-1.5 text-[10px] h-7" onClick={() => setViewMode("all")}>
            <MapPin className="h-3 w-3" />
            Όλα ({geocodedAppts.length + geocodedUnscheduled.length})
          </Button>
          <Button variant={viewMode === "appointments" ? "default" : "ghost"} size="sm" className="gap-1.5 text-[10px] h-7" onClick={() => setViewMode("appointments")}>
            <CalendarDays className="h-3 w-3" />
            Ραντεβού ({geocodedAppts.length})
          </Button>
        </div>

        {/* Map mode */}
        <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg">
          <Button variant={mapMode === "markers" ? "default" : "ghost"} size="sm" className="text-[10px] h-7" onClick={() => setMapMode("markers")}>
            <MapPin className="h-3 w-3" />
          </Button>
          <Button variant={mapMode === "heatmap" ? "default" : "ghost"} size="sm" className="gap-1 text-[10px] h-7" onClick={() => setMapMode("heatmap")}>
            <Flame className="h-3 w-3" />
            Heat
          </Button>
        </div>

        {/* Filters toggle */}
        <Button variant={showFilters ? "default" : "ghost"} size="sm" className="gap-1 text-[10px] h-7" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="h-3 w-3" />
          {statusFilters.size > 0 && <Badge variant="secondary" className="text-[8px] h-4 px-1">{statusFilters.size}</Badge>}
        </Button>

        {/* Stats toggle */}
        <Button variant={showStats ? "default" : "ghost"} size="sm" className="gap-1 text-[10px] h-7" onClick={() => setShowStats(!showStats)}>
          <BarChart3 className="h-3 w-3" />
        </Button>

        {/* Loading / badges */}
        {isGeocoding && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Αναζήτηση...
          </div>
        )}
        {!isGeocoding && (geocodeStats.fromRegistry > 0 || geocodeStats.fromHemd > 0) && (
          <div className="flex items-center gap-1">
            {geocodeStats.fromRegistry > 0 && <Badge variant="outline" className="text-[9px]">📋 {geocodeStats.fromRegistry}</Badge>}
            {geocodeStats.fromHemd > 0 && <Badge variant="outline" className="text-[9px]">🔗 {geocodeStats.fromHemd}</Badge>}
            {autoSaved > 0 && <Badge variant="outline" className="text-[9px] border-emerald-400 text-emerald-600">💾 {autoSaved} saved</Badge>}
          </div>
        )}

        {/* Proximity alert */}
        {proximityGroups.length > 0 && (
          <Badge variant="outline" className="text-[9px] gap-1 border-amber-400 text-amber-600 ml-auto">
            <AlertTriangle className="h-3 w-3" />
            {proximityGroups.length} ομάδ{proximityGroups.length === 1 ? "α" : "ες"} κοντινών SR
          </Badge>
        )}

        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground ml-auto">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded-full border-2 border-white shadow" style={{ background: "#3b82f6" }}>
              <span className="block text-[8px] text-white text-center leading-[12px] font-bold">1</span>
            </span>
            Ραντεβού
          </span>
          {viewMode === "all" && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-white shadow opacity-80" style={{ background: "#f59e0b" }} />
              Χωρίς
            </span>
          )}
        </div>
      </div>

      {/* ──── Status filters ──── */}
      {showFilters && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-medium mr-1">Κατάσταση:</span>
          {allStatuses.map(status => {
            const isActive = statusFilters.has(status);
            const color = statusMarkerColors[status] || "#9ca3af";
            return (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                  isActive ? "border-transparent text-white" : "border-border text-muted-foreground bg-background hover:bg-muted"
                }`}
                style={isActive ? { background: color } : {}}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                {statusLabelsGr[status] || status}
              </button>
            );
          })}
          {statusFilters.size > 0 && (
            <button onClick={() => setStatusFilters(new Set())} className="text-[10px] text-muted-foreground underline ml-1">
              Καθαρισμός
            </button>
          )}
        </div>
      )}

      {/* ──── Stats panel ──── */}
      {showStats && (
        <Card className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{mapStats.totalItems}</div>
              <div className="text-[10px] text-muted-foreground">SR στον χάρτη</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{mapStats.techCounts.size}</div>
              <div className="text-[10px] text-muted-foreground">Τεχνικοί</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{mapStats.avgDist > 1000 ? `${(mapStats.avgDist / 1000).toFixed(1)}km` : `${mapStats.avgDist}m`}</div>
              <div className="text-[10px] text-muted-foreground">Μέση απόσταση</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">~{mapStats.estimatedDriveMinutes}′</div>
              <div className="text-[10px] text-muted-foreground">Εκτ. οδήγηση</div>
            </div>
          </div>
          {/* Per-tech breakdown */}
          <div className="mt-3 flex flex-wrap gap-2">
            {Array.from(mapStats.techCounts.entries()).map(([techId, count]) => {
              const color = techColorMap.get(techId) || "#9ca3af";
              const name = geocodedAppts.find(i => {
                const a = i.original as MapAppointment;
                return a.assignment?.technician_id === techId;
              })?.original;
              const techName = name ? (name as MapAppointment).assignment?.technician_name : geocodedUnscheduled.find(i => (i.original as UnscheduledOnMap).technician_id === techId)?.original;
              const displayName = techName
                ? (techName as any).assignment?.technician_name || (techName as any).technician_name || "—"
                : "—";
              return (
                <div key={techId} className="flex items-center gap-1 text-[10px]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="font-medium">{displayName}</span>
                  <span className="text-muted-foreground">({count})</span>
                </div>
              );
            })}
          </div>
          {/* Status breakdown */}
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from(mapStats.statusCounts.entries()).map(([status, count]) => (
              <div key={status} className="flex items-center gap-1 text-[10px]">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: statusMarkerColors[status] || "#9ca3af" }} />
                <span>{statusLabelsGr[status] || status}</span>
                <span className="text-muted-foreground">({count})</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ──── Map ──── */}
      <Card className="overflow-hidden">
        <div className="h-[55vh] min-h-[350px]">
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </Card>

      {/* ──── Route legend ──── */}
      {techGroups.size > 0 && mapMode === "markers" && (
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
                  <span className="text-muted-foreground">({items.length})</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ──── Proximity alerts ──── */}
      {proximityGroups.length > 0 && mapMode === "markers" && (
        <Card className="p-3 border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-bold text-foreground">Κοντινά SR — Μπορούν να ομαδοποιηθούν</span>
          </div>
          <div className="space-y-1.5">
            {proximityGroups.map((group, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-600">{group.items.length} SR</Badge>
                <span className="text-muted-foreground">
                  {group.items.map(item =>
                    item.type === "appointment" ? (item.original as MapAppointment).sr_id : (item.original as UnscheduledOnMap).sr_id
                  ).join(", ")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ──── No-location items ──── */}
      {totalNoLocation > 0 && (
        <Card className="p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Δεν βρέθηκε τοποθεσία ({totalNoLocation})
          </p>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {noLocationAppts.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] font-bold">{a.sr_id}</Badge>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(a.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}</span>
                {a.area && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.area}</span>}
                {a.assignment?.address && <span className="text-[10px] truncate max-w-[200px]">🏠 {a.assignment.address}</span>}
              </div>
            ))}
            {viewMode === "all" && noLocationUnscheduled.slice(0, 20).map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] font-bold">{a.sr_id}</Badge>
                {a.area && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.area}</span>}
                {a.address && <span className="text-[10px] truncate max-w-[200px]">🏠 {a.address}</span>}
                {a.technician_name && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {a.technician_name}</span>}
              </div>
            ))}
            {viewMode === "all" && noLocationUnscheduled.length > 20 && (
              <p className="text-[10px] text-muted-foreground">+{noLocationUnscheduled.length - 20} ακόμα</p>
            )}
          </div>
        </Card>
      )}

      {filteredItems.length === 0 && totalNoLocation === 0 && !isGeocoding && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Δεν υπάρχουν ραντεβού για {dateLabel}
        </div>
      )}
    </div>
  );
};

export default CalendarMapView;
