import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Navigation, Loader2, MousePointerClick, X } from "lucide-react";

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export interface AddressResult {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

interface SmartAddressLookupProps {
  value: string;
  onChange: (address: string) => void;
  onLocationSelect: (result: AddressResult) => void;
  className?: string;
}

const GOOGLE_MAPS_EMBED_KEY = "AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8";

const SmartAddressLookup = ({
  value,
  onChange,
  onLocationSelect,
  className = "",
}: SmartAddressLookupProps) => {
  const [query, setQuery] = useState(value);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value
  useEffect(() => {
    if (value !== query && !showDropdown) {
      setQuery(value);
    }
  }, [value]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const searchPlaces = useCallback(async (term: string) => {
    if (term.length < 3) {
      setPredictions([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("places-autocomplete", {
        body: { action: "autocomplete", input: term },
      });
      if (error) throw error;
      setPredictions(data?.predictions || []);
    } catch (err) {
      console.error("Places autocomplete error:", err);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const getPlaceDetails = async (placeId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("places-autocomplete", {
        body: { action: "details", placeId },
      });
      if (error) throw error;
      const result = data?.result;
      if (result?.geometry?.location) {
        return {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          address: result.formatted_address || "",
        };
      }
    } catch (err) {
      console.error("Place details error:", err);
    }
    return null;
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    onChange(val);
    setSelectedLocation(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchPlaces(val);
      setShowDropdown(true);
    }, 350);
  };

  const handleSelectPrediction = async (prediction: PlacePrediction) => {
    setShowDropdown(false);
    setLoading(true);

    const details = await getPlaceDetails(prediction.place_id);
    if (details) {
      const addr = details.address || prediction.description;
      setQuery(addr);
      onChange(addr);
      setSelectedLocation({ lat: details.lat, lng: details.lng });
      onLocationSelect({ address: addr, latitude: details.lat, longitude: details.lng });
    } else {
      setQuery(prediction.description);
      onChange(prediction.description);
    }
    setLoading(false);
  };

  const handleManualPin = () => {
    setShowMapPicker(true);
  };

  // Listen for postMessage from the map iframe for click coordinates
  useEffect(() => {
    if (!showMapPicker) return;

    const handler = (e: MessageEvent) => {
      if (e.data?.type === "map-click") {
        const { lat, lng } = e.data;
        setSelectedLocation({ lat, lng });
        setShowMapPicker(false);
        onLocationSelect({ address: query, latitude: lat, longitude: lng });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [showMapPicker, query, onLocationSelect]);

  return (
    <div ref={containerRef} className={`space-y-2 relative ${className}`}>
      {/* Search input */}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => query.length >= 3 && predictions.length > 0 && setShowDropdown(true)}
          placeholder="Αναζήτηση διεύθυνσης στην Ελλάδα..."
          className="pl-9 pr-9 text-sm"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && query.length >= 3 && (
        <Card className="absolute z-50 left-0 right-0 max-h-60 overflow-y-auto shadow-lg border border-border bg-card">
          {predictions.length > 0 ? (
            predictions.map((p) => (
              <button
                key={p.place_id}
                type="button"
                onClick={() => handleSelectPrediction(p)}
                className="w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors border-b border-border/50 last:border-0"
              >
                <p className="text-sm font-medium text-foreground">
                  {p.structured_formatting.main_text}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {p.structured_formatting.secondary_text}
                </p>
              </button>
            ))
          ) : !loading ? (
            <div className="p-3 text-center">
              <p className="text-xs text-muted-foreground mb-2">Δεν βρέθηκαν αποτελέσματα</p>
              <button
                type="button"
                onClick={handleManualPin}
                className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
              >
                <MousePointerClick className="h-3 w-3" />
                Επιλογή στον χάρτη
              </button>
            </div>
          ) : null}
        </Card>
      )}

      {/* Manual pin button (always visible when no location selected) */}
      {!selectedLocation && query.length > 0 && !showDropdown && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleManualPin}
          className="w-full text-xs gap-1.5"
        >
          <MousePointerClick className="h-3.5 w-3.5" />
          Επιλογή τοποθεσίας στον χάρτη
        </Button>
      )}

      {/* Map picker for manual pin */}
      {showMapPicker && (
        <Card className="overflow-hidden border border-border">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <MousePointerClick className="h-3.5 w-3.5 text-primary" />
              Κάνε κλικ στον χάρτη για να ορίσεις τοποθεσία
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowMapPicker(false)}
              className="h-6 w-6 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="h-48">
            <iframe
              title="Pick location"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              srcDoc={`
                <!DOCTYPE html>
                <html>
                <head>
                  <style>html,body,#map{height:100%;margin:0;padding:0;}</style>
                </head>
                <body>
                  <div id="map"></div>
                  <script>
                    function initMap() {
                      const center = { lat: 36.4341, lng: 28.2176 };
                      const map = new google.maps.Map(document.getElementById("map"), {
                        zoom: 12,
                        center: center,
                        mapTypeId: "hybrid",
                        disableDefaultUI: true,
                        zoomControl: true,
                      });
                      let marker = null;
                      map.addListener("click", function(e) {
                        const lat = e.latLng.lat();
                        const lng = e.latLng.lng();
                        if (marker) marker.setMap(null);
                        marker = new google.maps.Marker({ position: { lat, lng }, map });
                        window.parent.postMessage({ type: "map-click", lat, lng }, "*");
                      });
                    }
                  </script>
                  <script src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_EMBED_KEY}&callback=initMap" async defer></script>
                </body>
                </html>
              `}
            />
          </div>
        </Card>
      )}

      {/* Selected location confirmation */}
      {selectedLocation && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-foreground">Τοποθεσία επιβεβαιώθηκε</span>
            </div>
            <Badge variant="outline" className="text-[9px]">
              {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}
            </Badge>
          </div>
          {/* Mini confirmation map */}
          <div className="mt-2 rounded-lg overflow-hidden border border-border h-28">
            <iframe
              title="Confirmed location"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              src={`https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_EMBED_KEY}&q=${selectedLocation.lat},${selectedLocation.lng}&zoom=17&maptype=satellite`}
            />
          </div>
        </Card>
      )}
    </div>
  );
};

export default SmartAddressLookup;
