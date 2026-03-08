import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Building2, Navigation, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface BuildingResult {
  id: string;
  address: string;
  street: string | null;
  number: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  building_id: string | null;
  nearby_bcp: string | null;
  branch: string | null;
  cabinet: string | null;
  area: string | null;
}

interface SmartAddressLookupProps {
  value: string;
  onChange: (address: string) => void;
  onBuildingSelect: (building: BuildingResult | null) => void;
  organizationId?: string | null;
  className?: string;
}

const SmartAddressLookup = ({
  value,
  onChange,
  onBuildingSelect,
  organizationId,
  className = "",
}: SmartAddressLookupProps) => {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<BuildingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingResult | null>(null);
  const [isManual, setIsManual] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value
  useEffect(() => {
    if (value !== query && !showDropdown) {
      setQuery(value);
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const searchBuildings = async (term: string) => {
    if (term.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("search_buildings", {
        search_term: term,
        org_id: organizationId || null,
      });

      if (error) {
        console.error("Building search error:", error);
        setResults([]);
      } else {
        setResults((data as BuildingResult[]) || []);
      }
    } catch (err) {
      console.error("Building search error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    onChange(val);
    setSelectedBuilding(null);
    setIsManual(false);
    onBuildingSelect(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchBuildings(val);
      setShowDropdown(true);
    }, 300);
  };

  const handleSelect = (building: BuildingResult) => {
    setQuery(building.address);
    onChange(building.address);
    setSelectedBuilding(building);
    setIsManual(false);
    setShowDropdown(false);
    onBuildingSelect(building);
  };

  const handleManualEntry = () => {
    setIsManual(true);
    setShowDropdown(false);
    setSelectedBuilding(null);
    onBuildingSelect(null);
  };

  return (
    <div ref={containerRef} className={`space-y-2 relative ${className}`}>
      {/* Input */}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => query.length >= 2 && setShowDropdown(true)}
          placeholder="Αναζήτηση διεύθυνσης ή building ID..."
          className="pl-9 text-sm"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Dropdown results */}
      {showDropdown && query.length >= 2 && (
        <Card className="absolute z-50 w-[calc(100%-2rem)] max-h-60 overflow-y-auto shadow-lg border border-border">
          {results.length > 0 ? (
            <>
              {results.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSelect(b)}
                  className="w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors border-b border-border/50 last:border-0"
                >
                  <div className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{b.address}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {b.building_id && (
                          <span className="text-[10px] text-muted-foreground">ID: {b.building_id}</span>
                        )}
                        {b.cabinet && (
                          <span className="text-[10px] text-muted-foreground">CAB: {b.cabinet}</span>
                        )}
                        {b.nearby_bcp && (
                          <span className="text-[10px] text-primary/70">BCP: {b.nearby_bcp}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </>
          ) : !loading ? (
            <div className="p-3 text-center">
              <p className="text-xs text-muted-foreground mb-2">
                Δεν βρέθηκε κτήριο στο μητρώο ΧΕΜΔ
              </p>
              <button
                type="button"
                onClick={handleManualEntry}
                className="text-xs text-primary hover:underline"
              >
                Χρήση χειροκίνητης καταχώρησης →
              </button>
            </div>
          ) : null}
        </Card>
      )}

      {/* Selected building info */}
      {selectedBuilding && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-xs font-semibold text-foreground">Κτήριο ΧΕΜΔ</span>
            {selectedBuilding.building_id && (
              <Badge variant="outline" className="text-[9px] ml-auto">
                {selectedBuilding.building_id}
              </Badge>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {selectedBuilding.latitude && selectedBuilding.longitude && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Navigation className="h-3 w-3" />
                <span>{Number(selectedBuilding.latitude).toFixed(6)}, {Number(selectedBuilding.longitude).toFixed(6)}</span>
              </div>
            )}
            {selectedBuilding.cabinet && (
              <div className="text-muted-foreground">
                <span className="font-medium">CAB:</span> {selectedBuilding.cabinet}
              </div>
            )}
          </div>

          {/* Suggested infrastructure */}
          {(selectedBuilding.nearby_bcp || selectedBuilding.branch) && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <p className="text-[10px] font-semibold text-foreground mb-1">
                📡 Προτεινόμενη Υποδομή
              </p>
              <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                {selectedBuilding.nearby_bcp && (
                  <span>BCP: <strong className="text-foreground">{selectedBuilding.nearby_bcp}</strong></span>
                )}
                {selectedBuilding.branch && (
                  <span>Κλάδος: <strong className="text-foreground">{selectedBuilding.branch}</strong></span>
                )}
              </div>
            </div>
          )}

          {/* Mini map */}
          {selectedBuilding.latitude && selectedBuilding.longitude && (
            <div className="mt-2 rounded-lg overflow-hidden border border-border h-32">
              <iframe
                title="Building location"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${selectedBuilding.latitude},${selectedBuilding.longitude}&zoom=17&maptype=satellite`}
              />
            </div>
          )}
        </Card>
      )}

      {/* Manual entry badge */}
      {isManual && query.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-amber-500/30 bg-amber-500/5 text-amber-600">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Νέο Κτήριο (Εκτός ΧΕΜΔ)
          </Badge>
        </div>
      )}
    </div>
  );
};

export default SmartAddressLookup;
