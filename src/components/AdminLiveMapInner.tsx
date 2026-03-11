import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
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

function FlyTo({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], zoom);
  }, [lat, lng, zoom, map]);
  return null;
}

const AdminLiveMapInner = () => {
  const { organizationId } = useOrganization();
  const [locations, setLocations] = useState<Record<string, TechLocation>>({});
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [, setTick] = useState(0);

  const { data: profiles } = useQuery({
    queryKey: ["technician-profiles-map"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "technician" as any);
      if (!roles?.length) return [];
      const ids = roles.map((r) => r.user_id);
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      return data || [];
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
    queryKey: ["technician-active-assignments-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("assignments")
        .select("technician_id, sr_id, status, area")
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

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const locationsList = Object.values(locations);
  const allTechIds = profiles?.map((p) => p.user_id) || [];
  const onlineCount = locationsList.filter((l) => isFresh(l.updated_at)).length;
  const offlineCount = allTechIds.filter(
    (id) => !locations[id] || isStale(locations[id].updated_at)
  ).length;

  const defaultCenter: [number, number] = [36.4341, 28.2176];
  const center: [number, number] =
    locationsList.length > 0
      ? [locationsList[0].latitude, locationsList[0].longitude]
      : defaultCenter;

  return (
    <div className="space-y-4">
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

      <Card className="overflow-hidden">
        <div className="h-[60vh] min-h-[400px]">
          <MapContainer
            center={center}
            zoom={12}
            className="h-full w-full z-0"
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} zoom={16} />}
            {locationsList.map((loc) => {
              const name = profileMap[loc.user_id] || "Τεχνικός";
              const fresh = isFresh(loc.updated_at);
              const assignment = techAssignmentMap[loc.user_id];
              return (
                <Marker
                  key={loc.user_id}
                  position={[loc.latitude, loc.longitude]}
                  icon={createMarkerIcon(name, fresh)}
                >
                  <Popup>
                    <div className="text-sm space-y-1 min-w-[180px]">
                      <div className="font-bold flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {name}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(loc.updated_at), {
                          addSuffix: true,
                          locale: el,
                        })}
                      </div>
                      {loc.accuracy && (
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <Crosshair className="h-3 w-3" />
                          Ακρίβεια: ~{Math.round(loc.accuracy)}μ
                        </div>
                      )}
                      {assignment && (
                        <div className="text-xs mt-1 pt-1 border-t border-gray-200">
                          <span className="font-medium">SR: {assignment.sr_id}</span>
                          <span className="text-gray-400 ml-1">({assignment.area})</span>
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </Card>

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
                      onClick={() => setFlyTarget({ lat: loc.latitude, lng: loc.longitude })}
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
