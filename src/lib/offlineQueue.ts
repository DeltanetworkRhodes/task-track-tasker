import { get, set, del, keys } from "idb-keyval";

const QUEUE_PREFIX = "offline_survey_";
const PENDING_KEY = "offline_pending_ids";

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

/**
 * Save a survey payload to the offline queue
 */
export async function enqueueSurvey(payload: OfflineSurveyPayload): Promise<void> {
  const key = QUEUE_PREFIX + payload.id;
  await set(key, payload);

  // Track pending IDs
  const pendingIds: string[] = (await get(PENDING_KEY)) || [];
  if (!pendingIds.includes(payload.id)) {
    pendingIds.push(payload.id);
    await set(PENDING_KEY, pendingIds);
  }
}

/**
 * Get all pending offline surveys
 */
export async function getPendingSurveys(): Promise<OfflineSurveyPayload[]> {
  const pendingIds: string[] = (await get(PENDING_KEY)) || [];
  const surveys: OfflineSurveyPayload[] = [];
  for (const id of pendingIds) {
    const payload = await get<OfflineSurveyPayload>(QUEUE_PREFIX + id);
    if (payload) surveys.push(payload);
  }
  return surveys;
}

/**
 * Get count of pending surveys
 */
export async function getPendingCount(): Promise<number> {
  const pendingIds: string[] = (await get(PENDING_KEY)) || [];
  return pendingIds.length;
}

/**
 * Remove a survey from the offline queue after successful sync
 */
export async function dequeueSurvey(id: string): Promise<void> {
  await del(QUEUE_PREFIX + id);
  const pendingIds: string[] = (await get(PENDING_KEY)) || [];
  await set(PENDING_KEY, pendingIds.filter((pid) => pid !== id));
}

/**
 * Check if the browser is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}
