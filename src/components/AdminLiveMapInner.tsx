import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Radio, Clock, Crosshair, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";

interface TechLocation {
  id: string;
  user_id: string;
  organization_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updated_at: string;
  full_name?: string;
}

const TWO_MIN = 2 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;

function isFresh(updated_at: string) {
  return Date.now() - new Date(updated_at).getTime() < TWO_MIN;
}

function isStale(updated_at: string) {
  return Date.now() - new Date(updated_at).getTime() > FIVE_MIN;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function createMarkerIcon(name: string, fresh: boolean) {
  const initials = getInitials(name || "?");
  const bg = fresh ? "#3b82f6" : "#9ca3af";
  const opacity = fresh ? "1" : "0.6";
  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
    html: `<div style="
      width:36px;height:36px;border-radius:50%;
      background:${bg};border:3px solid white;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:bold;color:white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
      opacity:${opacity};
    ">${initials}</div>`,
  });
}

const AdminLiveMapInner = () => {
  const { organizationId } = useOrganization();
  const [locations, setLocations] = useState<Record<string, TechLocation>>({});
  const [, setTick] = useState(0);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});

  const { data: profiles } = useQuery({
    queryKey: ["technician-profiles-map", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      // Get profiles for this org first, then filter by technician role
      const { data: orgProfiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("organization_id", organizationId!);
      if (!orgProfiles?.length) return [];
      const ids = orgProfiles.map((p) => p.user_id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "technician" as any)
        .in("user_id", ids);
      if (!roles?.length) return [];
      const techIds = new Set(roles.map((r) => r.user_id));
      return orgProfiles.filter((p) => techIds.has(p.user_id));
    },
  });

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles?.forEach((p) => {
      m[p.user_id] = p.full_name;
    });
    return m;
  }, [profiles]);

  const { data: activeAssignments } = useQuery({
    queryKey: ["technician-active-assignments-map", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data } = await supabase
        .from("assignments")
        .select("technician_id, sr_id, status, area")
        .eq("organization_id", organizationId!)
        .in("status", ["pending", "inspection", "construction"])
        .not("technician_id", "is", null);
      return data || [];
    },
    refetchInterval: 30000,
  });

  const techAssignmentMap = useMemo(() => {
    const m: Record<string, { sr_id: string; status: string; area: string }> = {};
    activeAssignments?.forEach((a) => {
      if (a.technician_id && !m[a.technician_id]) {
        m[a.technician_id] = { sr_id: a.sr_id, status: a.status, area: a.area };
      }
    });
    return m;
  }, [activeAssignments]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView([36.4341, 28.2176], 12);
    L.tileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      attribution: '&copy; Google Maps',
      maxZoom: 20,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when locations/profiles change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const locationsList = Object.values(locations);

    // Remove old markers not in current locations
    Object.keys(markersRef.current).forEach((uid) => {
      if (!locations[uid]) {
        markersRef.current[uid].remove();
        delete markersRef.current[uid];
      }
    });

    // Add/update markers
    locationsList.forEach((loc) => {
      const name = profileMap[loc.user_id] || "Τεχνικός";
      const fresh = isFresh(loc.updated_at);
      const assignment = techAssignmentMap[loc.user_id];
      const icon = createMarkerIcon(name, fresh);

      const popupContent = `
        <div style="font-size:13px;min-width:180px;">
          <div style="font-weight:bold;">👤 ${name}</div>
          <div style="font-size:11px;color:#666;">🕐 ${formatDistanceToNow(new Date(loc.updated_at), { addSuffix: true, locale: el })}</div>
          ${loc.accuracy ? `<div style="font-size:11px;color:#666;">📍 Ακρίβεια: ~${Math.round(loc.accuracy)}μ</div>` : ""}
          ${assignment ? `<div style="font-size:11px;margin-top:4px;padding-top:4px;border-top:1px solid #eee;"><b>SR: ${assignment.sr_id}</b> <span style="color:#999;">(${assignment.area})</span></div>` : ""}
        </div>
      `;

      if (markersRef.current[loc.user_id]) {
        markersRef.current[loc.user_id]
          .setLatLng([loc.latitude, loc.longitude])
          .setIcon(icon)
          .getPopup()?.setContent(popupContent);
      } else {
        const marker = L.marker([loc.latitude, loc.longitude], { icon })
          .bindPopup(popupContent)
          .addTo(map);
        markersRef.current[loc.user_id] = marker;
      }
    });

    // Fit bounds if we have locations
    if (locationsList.length > 0 && !map.getBounds().isValid()) {
      const bounds = L.latLngBounds(locationsList.map((l) => [l.latitude, l.longitude]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [locations, profileMap, techAssignmentMap]);

  // Initial fetch
  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("technician_locations" as any)
      .select("*")
      .eq("organization_id", organizationId)
      .then(({ data }: any) => {
        const map: Record<string, TechLocation> = {};
        data?.forEach((l: TechLocation) => {
          map[l.user_id] = l;
        });
        setLocations(map);
      });
  }, [organizationId]);

  // Realtime subscription
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel("technician-locations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "technician_locations",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload: any) => {
          if (payload.new) {
            setLocations((prev) => ({
              ...prev,
              [payload.new.user_id]: payload.new,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  // Refresh "ago" labels every 30s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const flyTo = useCallback((lat: number, lng: number) => {
    mapRef.current?.flyTo([lat, lng], 16);
  }, []);

  const locationsList = Object.values(locations);
  const allTechIds = profiles?.map((p) => p.user_id) || [];
  const onlineCount = locationsList.filter((l) => isFresh(l.updated_at)).length;
  const offlineCount = allTechIds.filter(
    (id) => !locations[id] || isStale(locations[id].updated_at)
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary animate-pulse" />
          <h2 className="text-lg font-bold">Ζωντανή Παρακολούθηση</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 text-xs border-green-500/30 text-green-600">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            {onlineCount} online
          </Badge>
          {offlineCount > 0 && (
            <Badge variant="outline" className="gap-1.5 text-xs border-muted-foreground/30 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-muted-foreground" />
              {offlineCount} offline
            </Badge>
          )}
        </div>
      </div>

      {/* Map */}
      <Card className="overflow-hidden">
        <div className="h-[60vh] min-h-[400px]">
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </Card>

      {/* Technician List */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-bold">Τεχνικοί</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {allTechIds.map((techId) => {
              const loc = locations[techId];
              const name = profileMap[techId] || "Τεχνικός";
              const assignment = techAssignmentMap[techId];
              const online = loc && isFresh(loc.updated_at);
              const stale = !loc || isStale(loc.updated_at);

              return (
                <div
                  key={techId}
                  className={`flex items-center gap-3 px-4 py-3 text-sm ${
                    stale ? "opacity-50" : ""
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                      online ? "bg-blue-500" : "bg-muted-foreground"
                    }`}
                  >
                    {getInitials(name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    {assignment && (
                      <div className="text-xs text-muted-foreground truncate">
                        SR {assignment.sr_id}
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {loc ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(loc.updated_at), {
                          addSuffix: false,
                          locale: el,
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">Offline</span>
                    )}
                  </div>

                  {loc && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => flyTo(loc.latitude, loc.longitude)}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
            {allTechIds.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Δεν βρέθηκαν τεχνικοί
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLiveMapInner;
