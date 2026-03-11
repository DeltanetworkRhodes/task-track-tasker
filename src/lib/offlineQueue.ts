import { get, set, del, keys } from "idb-keyval";

const QUEUE_PREFIX = "offline_survey_";
const PENDING_KEY = "offline_pending_ids";

const CONSTRUCTION_QUEUE_PREFIX = "offline_construction_";
const CONSTRUCTION_PENDING_KEY = "offline_pending_construction_ids";

export interface OfflineSurveyPayload {
  id: string;
  timestamp: number;
  srId: string;
  area: string;
  comments: string;
  organizationId: string | null;
  userId: string;
  autoStatus: string;
  /** Files stored as ArrayBuffers with metadata */
  buildingPhotos: OfflineFile[];
  screenshots: OfflineFile[];
  inspectionPdf: OfflineFile | null;
  /** Assignment info for auto-advance */
  assignmentId?: string;
  assignmentStatus?: string;
}

export interface OfflineFile {
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer;
}

export interface OfflineConstructionPayload {
  id: string;
  timestamp: number;
  assignmentId: string;
  srId: string;
  organizationId: string | null;
  userId: string;
  // Form fields
  sesId: string;
  ak: string;
  cab: string;
  floors: string;
  routingType: string;
  pendingNote: string;
  routes: { label: string; koi: string; fyraKoi: string }[];
  workItems: {
    work_pricing_id: string;
    code: string;
    description: string;
    unit: string;
    unit_price: number;
    quantity: number;
  }[];
  materialItems: {
    material_id: string;
    code: string;
    name: string;
    unit: string;
    price: number;
    source: string;
    quantity: number;
  }[];
  totalRevenue: number;
  totalMaterialCost: number;
  // Photos stored as OfflineFile[]
  categorizedPhotos: Record<string, OfflineFile[]>;
  otdrFiles: Record<string, OfflineFile[]>;
  // Photo category mapping for storage paths
  photoCategoryMap: Record<string, string>; // key → storageName
  otdrCategoryMap: Record<string, string>; // key → storageName
}

/**
 * Convert a File to an OfflineFile (serializable for IndexedDB)
 */
export async function fileToOfflineFile(file: File): Promise<OfflineFile> {
  const data = await file.arrayBuffer();
  return { name: file.name, type: file.type, size: file.size, data };
}

/**
 * Convert an OfflineFile back to a File
 */
export function offlineFileToFile(of: OfflineFile): File {
  return new File([of.data], of.name, { type: of.type });
}

// ═══════════ SURVEY QUEUE ═══════════

export async function enqueueSurvey(payload: OfflineSurveyPayload): Promise<void> {
  const key = QUEUE_PREFIX + payload.id;
  await set(key, payload);
  const pendingIds: string[] = (await get(PENDING_KEY)) || [];
  if (!pendingIds.includes(payload.id)) {
    pendingIds.push(payload.id);
    await set(PENDING_KEY, pendingIds);
  }
}

export async function getPendingSurveys(): Promise<OfflineSurveyPayload[]> {
  const pendingIds: string[] = (await get(PENDING_KEY)) || [];
  const surveys: OfflineSurveyPayload[] = [];
  for (const id of pendingIds) {
    const payload = await get<OfflineSurveyPayload>(QUEUE_PREFIX + id);
    if (payload) surveys.push(payload);
  }
  return surveys;
}

export async function getPendingSurveyCount(): Promise<number> {
  const pendingIds: string[] = (await get(PENDING_KEY)) || [];
  return pendingIds.length;
}

/** @deprecated Use getPendingSurveyCount instead */
export const getPendingCount = getPendingSurveyCount;

export async function dequeueSurvey(id: string): Promise<void> {
  await del(QUEUE_PREFIX + id);
  const pendingIds: string[] = (await get(PENDING_KEY)) || [];
  await set(PENDING_KEY, pendingIds.filter((pid) => pid !== id));
}

// ═══════════ CONSTRUCTION QUEUE ═══════════

export async function enqueueConstruction(payload: OfflineConstructionPayload): Promise<void> {
  const key = CONSTRUCTION_QUEUE_PREFIX + payload.id;
  await set(key, payload);
  const pendingIds: string[] = (await get(CONSTRUCTION_PENDING_KEY)) || [];
  if (!pendingIds.includes(payload.id)) {
    pendingIds.push(payload.id);
    await set(CONSTRUCTION_PENDING_KEY, pendingIds);
  }
}

export async function getPendingConstructions(): Promise<OfflineConstructionPayload[]> {
  const pendingIds: string[] = (await get(CONSTRUCTION_PENDING_KEY)) || [];
  const constructions: OfflineConstructionPayload[] = [];
  for (const id of pendingIds) {
    const payload = await get<OfflineConstructionPayload>(CONSTRUCTION_QUEUE_PREFIX + id);
    if (payload) constructions.push(payload);
  }
  return constructions;
}

export async function getPendingConstructionCount(): Promise<number> {
  const pendingIds: string[] = (await get(CONSTRUCTION_PENDING_KEY)) || [];
  return pendingIds.length;
}

export async function dequeueConstruction(id: string): Promise<void> {
  await del(CONSTRUCTION_QUEUE_PREFIX + id);
  const pendingIds: string[] = (await get(CONSTRUCTION_PENDING_KEY)) || [];
  await set(CONSTRUCTION_PENDING_KEY, pendingIds.filter((pid) => pid !== id));
}

/**
 * Check if the browser is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}
