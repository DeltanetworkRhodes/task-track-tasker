import { createContext, useContext, useState, ReactNode } from "react";

export interface DemoAssignment {
  id: string;
  sr_id: string;
  area: string;
  status: string;
  technician_id: string;
  customer_name: string | null;
  address: string | null;
  phone: string | null;
  cab: string | null;
  comments: string | null;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
  photos_count: number | null;
  source_tab: string | null;
  drive_folder_url: string | null;
  drive_egrafa_url: string | null;
  drive_promeleti_url: string | null;
  pdf_url: string | null;
  google_sheet_row_id: number | null;
}

const DEMO_USER_ID = "demo-user-000";

const initialDemoAssignments: DemoAssignment[] = [
  {
    id: "demo-sr-01",
    sr_id: "SR-DEMO-01",
    area: "Ρόδος Κέντρο",
    status: "pre_committed",
    technician_id: DEMO_USER_ID,
    customer_name: "Δημήτρης Παπαδόπουλος",
    address: "Λεωφ. Ελευθερίας 42",
    phone: "6971234567",
    cab: "CAB-045",
    comments: "Αναμονή αρχείου GIS από ΟΤΕ",
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    organization_id: "demo-org",
    photos_count: 4,
    source_tab: null,
    drive_folder_url: null,
    drive_egrafa_url: null,
    drive_promeleti_url: null,
    pdf_url: null,
    google_sheet_row_id: null,
  },
  {
    id: "demo-sr-02",
    sr_id: "SR-DEMO-02",
    area: "Ιαλυσός",
    status: "construction",
    technician_id: DEMO_USER_ID,
    customer_name: "Μαρία Κωνσταντίνου",
    address: "Οδός Ηρώων 15",
    phone: "6989876543",
    cab: "CAB-112",
    comments: "GIS αναλύθηκε - Έτοιμο για κατασκευή",
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    organization_id: "demo-org",
    photos_count: 8,
    source_tab: null,
    drive_folder_url: null,
    drive_egrafa_url: null,
    drive_promeleti_url: null,
    pdf_url: null,
    google_sheet_row_id: null,
  },
  {
    id: "demo-sr-03",
    sr_id: "SR-DEMO-03",
    area: "Φαληράκι",
    status: "completed",
    technician_id: DEMO_USER_ID,
    customer_name: "Αλέξανδρος Ιωάννου",
    address: "Πλατεία Αγίας Παρασκευής 8",
    phone: "6945678901",
    cab: "CAB-089",
    comments: "Ολοκληρώθηκε - Τιμολόγηση αυτόματη",
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    organization_id: "demo-org",
    photos_count: 12,
    source_tab: null,
    drive_folder_url: null,
    drive_egrafa_url: null,
    drive_promeleti_url: null,
    pdf_url: null,
    google_sheet_row_id: null,
  },
];

export const DEMO_GIS_DATA: Record<string, any> = {
  "demo-sr-02": {
    id: "demo-gis-02",
    assignment_id: "demo-sr-02",
    sr_id: "SR-DEMO-02",
    floors: 6,
    building_id: "BLD-IAL-015",
    area_type: "Αστική",
    bep_type: "BEP-8",
    bmo_type: "BMO-16",
    conduit: "Φ25",
    floor_details: [
      { floor: 0, apartments: 2, fb_count: 1 },
      { floor: 1, apartments: 2, fb_count: 1 },
      { floor: 2, apartments: 2, fb_count: 1 },
      { floor: 3, apartments: 1, fb_count: 1 },
      { floor: 4, apartments: 1, fb_count: 1 },
    ],
    optical_paths: [
      { from: "CAB-112", to: "BEP-8", fiber_count: 12, distance: 320 },
    ],
    gis_works: [
      { code: "W-001", description: "Εγκατάσταση BEP", quantity: 1 },
      { code: "W-002", description: "Floor Box", quantity: 5 },
      { code: "W-003", description: "Πόρτα-πόρτα", quantity: 8 },
    ],
    distance_from_cabinet: 320,
    nanotronix: false,
    smart_readiness: true,
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    organization_id: "demo-org",
  },
  "demo-sr-03": {
    id: "demo-gis-03",
    assignment_id: "demo-sr-03",
    sr_id: "SR-DEMO-03",
    floors: 4,
    building_id: "BLD-FAL-008",
    area_type: "Αστική",
    bep_type: "BEP-4",
    bmo_type: "BMO-8",
    conduit: "Φ20",
    floor_details: [
      { floor: 0, apartments: 1, fb_count: 1 },
      { floor: 1, apartments: 2, fb_count: 1 },
      { floor: 2, apartments: 2, fb_count: 1 },
      { floor: 3, apartments: 1, fb_count: 1 },
    ],
    optical_paths: [
      { from: "CAB-089", to: "BEP-4", fiber_count: 12, distance: 180 },
    ],
    gis_works: [
      { code: "W-001", description: "Εγκατάσταση BEP", quantity: 1 },
      { code: "W-002", description: "Floor Box", quantity: 4 },
      { code: "W-003", description: "Πόρτα-πόρτα", quantity: 6 },
    ],
    distance_from_cabinet: 180,
    nanotronix: false,
    smart_readiness: false,
    created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    organization_id: "demo-org",
  },
};

export const DEMO_CONSTRUCTIONS: Record<string, any> = {
  "demo-sr-03": {
    id: "demo-construction-03",
    sr_id: "SR-DEMO-03",
    assignment_id: "demo-sr-03",
    status: "completed",
    floors: 4,
    cab: "CAB-089",
    ak: "AK-FAL-08",
    ses_id: "SES-DEMO-03",
    revenue: 2180,
    material_cost: 385,
    profit: 1795,
    routing_type: "Εσωτερική",
    routes: [],
    organization_id: "demo-org",
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
};

interface DemoContextType {
  isDemo: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
  demoAssignments: DemoAssignment[];
  updateDemoAssignment: (id: string, updates: Partial<DemoAssignment>) => void;
  demoGisData: Record<string, any>;
  addDemoGis: (assignmentId: string, gisData: any) => void;
  demoConstructions: Record<string, any>;
  demoProfile: { full_name: string; area: string; email: string; user_id: string };
}

const DemoContext = createContext<DemoContextType>({
  isDemo: false,
  enterDemo: () => {},
  exitDemo: () => {},
  demoAssignments: [],
  updateDemoAssignment: () => {},
  demoGisData: {},
  addDemoGis: () => {},
  demoConstructions: {},
  demoProfile: { full_name: "", area: "", email: "", user_id: "" },
});

export const useDemo = () => useContext(DemoContext);

export const DemoProvider = ({ children }: { children: ReactNode }) => {
  const [isDemo, setIsDemo] = useState(false);
  const [demoAssignments, setDemoAssignments] = useState<DemoAssignment[]>(initialDemoAssignments);
  const [demoGisData, setDemoGisData] = useState<Record<string, any>>(DEMO_GIS_DATA);
  const [demoConstructions] = useState<Record<string, any>>(DEMO_CONSTRUCTIONS);

  const demoProfile = {
    full_name: "Demo Τεχνικός",
    area: "Ρόδος",
    email: "demo@deltanetwork.gr",
    user_id: DEMO_USER_ID,
  };

  const enterDemo = () => {
    setIsDemo(true);
    setDemoAssignments([...initialDemoAssignments]);
    setDemoGisData({ ...DEMO_GIS_DATA });
  };

  const exitDemo = () => {
    setIsDemo(false);
  };

  const updateDemoAssignment = (id: string, updates: Partial<DemoAssignment>) => {
    setDemoAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
    );
  };

  const addDemoGis = (assignmentId: string, gisData: any) => {
    setDemoGisData((prev) => ({ ...prev, [assignmentId]: gisData }));
  };

  return (
    <DemoContext.Provider
      value={{
        isDemo,
        enterDemo,
        exitDemo,
        demoAssignments,
        updateDemoAssignment,
        demoGisData,
        addDemoGis,
        demoConstructions,
        demoProfile,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
};
