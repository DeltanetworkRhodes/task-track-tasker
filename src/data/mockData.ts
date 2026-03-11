// Mock data for the FTTH Operations Dashboard

export interface Assignment {
  id: string;
  srId: string;
  area: string;
  status: 'pending' | 'inspection' | 'pre_committed' | 'construction' | 'completed';
  technician: string;
  date: string;
  comments: string;
  photos: number;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  stock: number;
  unit: string;
  source: 'OTE' | 'DELTANETWORK';
  price: number;
}

export interface Construction {
  id: string;
  srId: string;
  sesId: string;
  ak: string;
  cab: string;
  floors: number;
  status: 'in_progress' | 'completed' | 'invoiced';
  revenue: number;
  materialCost: number;
  profit: number;
  date: string;
}

export const mockAssignments: Assignment[] = [
  { id: '1', srId: 'SR-2024-0891', area: 'Ρόδος Κέντρο', status: 'completed', technician: 'Γ. Παπαδόπουλος', date: '2024-12-15', comments: 'Ολοκληρώθηκε κανονικά', photos: 8 },
  { id: '2', srId: 'SR-2024-0892', area: 'Ιαλυσός', status: 'construction', technician: 'Ν. Κωνσταντίνου', date: '2024-12-18', comments: 'Αναμονή για CAD', photos: 5 },
  { id: '3', srId: 'SR-2024-0893', area: 'Φαληράκι', status: 'construction', technician: 'Α. Δημητρίου', date: '2024-12-20', comments: 'Αναμονή απάντησης ΟΤΕ', photos: 3 },
  { id: '4', srId: 'SR-2024-0894', area: 'Κως Πόλη', status: 'inspection', technician: 'Γ. Παπαδόπουλος', date: '2024-12-22', comments: '', photos: 0 },
  { id: '5', srId: 'SR-2024-0895', area: 'Λίνδος', status: 'pending', technician: 'Ν. Κωνσταντίνου', date: '2024-12-23', comments: 'Νέα ανάθεση', photos: 0 },
  { id: '6', srId: 'SR-2024-0896', area: 'Κρεμαστή', status: 'completed', technician: 'Α. Δημητρίου', date: '2024-12-10', comments: 'PDF εστάλη', photos: 12 },
  { id: '7', srId: 'SR-2024-0897', area: 'Καρδάμαινα', status: 'construction', technician: 'Γ. Παπαδόπουλος', date: '2024-12-19', comments: 'Εργασίες σε εξέλιξη', photos: 6 },
];

export const mockMaterials: Material[] = [
  { id: '1', code: 'FO-CBL-12', name: 'Καλώδιο Οπτικής Ίνας 12F', stock: 2400, unit: 'μ.', source: 'OTE', price: 0 },
  { id: '2', code: 'FO-CBL-24', name: 'Καλώδιο Οπτικής Ίνας 24F', stock: 1800, unit: 'μ.', source: 'OTE', price: 0 },
  { id: '3', code: 'SPR-20', name: 'Σπιράλ Φ20', stock: 340, unit: 'μ.', source: 'DELTANETWORK', price: 1.20 },
  { id: '4', code: 'SPR-25', name: 'Σπιράλ Φ25', stock: 180, unit: 'μ.', source: 'DELTANETWORK', price: 1.80 },
  { id: '5', code: 'RKR-20', name: 'Ρακόρ Φ20', stock: 520, unit: 'τεμ.', source: 'DELTANETWORK', price: 0.45 },
  { id: '6', code: 'ODF-8', name: 'ODF 8 θέσεων', stock: 25, unit: 'τεμ.', source: 'OTE', price: 0 },
  { id: '7', code: 'SPLC-SC', name: 'Splitter SC/APC 1:8', stock: 45, unit: 'τεμ.', source: 'OTE', price: 0 },
  { id: '8', code: 'CLMP-SS', name: 'Στηρίγματα Ανοξείδωτα', stock: 89, unit: 'τεμ.', source: 'DELTANETWORK', price: 2.30 },
];

export const mockConstructions: Construction[] = [
  { id: '1', srId: 'SR-2024-0891', sesId: 'SES-4421', ak: 'AK-RHO-12', cab: 'CAB-045', floors: 4, status: 'completed', revenue: 1850, materialCost: 320, profit: 1530, date: '2024-12-15' },
  { id: '2', srId: 'SR-2024-0892', sesId: 'SES-4422', ak: 'AK-IAL-03', cab: 'CAB-112', floors: 3, status: 'in_progress', revenue: 0, materialCost: 180, profit: -180, date: '2024-12-18' },
  { id: '3', srId: 'SR-2024-0896', sesId: 'SES-4418', ak: 'AK-KRM-07', cab: 'CAB-089', floors: 5, status: 'invoiced', revenue: 2340, materialCost: 410, profit: 1930, date: '2024-12-10' },
  { id: '4', srId: 'SR-2024-0897', sesId: 'SES-4423', ak: 'AK-KRD-01', cab: 'CAB-156', floors: 2, status: 'in_progress', revenue: 0, materialCost: 95, profit: -95, date: '2024-12-19' },
];

export const statusLabels: Record<string, string> = {
  pending: 'Αναμονή',
  inspection: 'Αυτοψία',
  pre_committed: 'Προδέσμευση Υλικών',
  construction: 'Κατασκευή',
  completed: 'AS-BUILD',
  submitted: 'Παραδόθηκε',
  paid: 'Πληρώθηκε',
  rejected: 'Απορρίφθηκε',
  cancelled: 'Ακυρωμένο',
};

export const constructionStatusLabels: Record<string, string> = {
  in_progress: 'Σε Εξέλιξη',
  completed: 'Ολοκληρώθηκε',
  invoiced: 'Τιμολογήθηκε',
};
