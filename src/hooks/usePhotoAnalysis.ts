import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Survey-phase result ───
export interface PhotoAnalysisResult {
  isValid: boolean;
  message: string;
  skipped?: boolean;
}

// ─── Construction-phase result ───
export interface ConstructionPhotoAnalysisResult {
  isApproved: boolean;
  qualityScore: number;
  stageIdentified?: string;
  detectedElements?: string[];
  issuesFound: string[];
  feedbackForTechnician: string;
  skipped?: boolean;
  overriddenBy?: string;
}

interface AnalysisState {
  [key: string]: {
    analyzing: boolean;
    results: Map<number, PhotoAnalysisResult>;
  };
}

interface ConstructionAnalysisState {
  [key: string]: {
    analyzing: boolean;
    results: Map<number, ConstructionPhotoAnalysisResult>;
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Survey-phase hook (simple valid/invalid) ───
export function usePhotoAnalysis() {
  const [analysisState, setAnalysisState] = useState<AnalysisState>({});

  const analyzePhoto = async (
    file: File,
    photoType: string,
    category: string,
    index: number
  ): Promise<PhotoAnalysisResult> => {
    setAnalysisState((prev) => ({
      ...prev,
      [category]: {
        analyzing: true,
        results: prev[category]?.results || new Map(),
      },
    }));

    try {
      const imageBase64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("analyze-photo", {
        body: { imageBase64, photoType, phase: "survey" },
      });

      if (error) {
        console.error("Photo analysis error:", error);
        const result: PhotoAnalysisResult = { isValid: true, message: "Ο έλεγχος AI δεν ήταν δυνατός.", skipped: true };
        updateResult(category, index, result);
        return result;
      }

      const result = data as PhotoAnalysisResult;
      updateResult(category, index, result);
      if (!result.isValid) {
        toast.error(`⚠️ ${result.message}`, { duration: 6000 });
      }
      return result;
    } catch (err) {
      console.error("Photo analysis error:", err);
      const result: PhotoAnalysisResult = { isValid: true, message: "Ο έλεγχος AI δεν ήταν δυνατός.", skipped: true };
      updateResult(category, index, result);
      return result;
    } finally {
      setAnalysisState((prev) => ({
        ...prev,
        [category]: { ...prev[category], analyzing: false },
      }));
    }
  };

  const updateResult = (category: string, index: number, result: PhotoAnalysisResult) => {
    setAnalysisState((prev) => {
      const newResults = new Map(prev[category]?.results || []);
      newResults.set(index, result);
      return { ...prev, [category]: { ...prev[category], analyzing: prev[category]?.analyzing || false, results: newResults } };
    });
  };

  const clearResults = (category: string) => {
    setAnalysisState((prev) => { const s = { ...prev }; delete s[category]; return s; });
  };

  const getResult = (category: string, index: number) => analysisState[category]?.results?.get(index);
  const isAnalyzing = (category: string) => analysisState[category]?.analyzing || false;

  return { analyzePhoto, getResult, isAnalyzing, clearResults };
}

// ─── Construction-phase hook (deep QA) ───
export function useConstructionPhotoAnalysis() {
  const [state, setState] = useState<ConstructionAnalysisState>({});

  const analyzeConstructionPhoto = async (
    file: File,
    category: string,
    index: number
  ): Promise<ConstructionPhotoAnalysisResult> => {
    setState((prev) => ({
      ...prev,
      [category]: { analyzing: true, results: prev[category]?.results || new Map() },
    }));

    try {
      const imageBase64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("analyze-photo", {
        body: { imageBase64, phase: "construction", category },
      });

      if (error) {
        console.error("Construction photo analysis error:", error);
        const fallback: ConstructionPhotoAnalysisResult = {
          isApproved: true, qualityScore: 10, issuesFound: [],
          feedbackForTechnician: "Ο έλεγχος AI δεν ήταν δυνατός.", skipped: true,
        };
        updateResult(category, index, fallback);
        return fallback;
      }

      const result = data as ConstructionPhotoAnalysisResult;
      updateResult(category, index, result);

      if (!result.isApproved || (result.qualityScore < 6)) {
        toast.error(`🚫 ΑΠΟΡΡΙΨΗ: ${result.feedbackForTechnician}`, { duration: 8000 });
      } else if (!result.skipped) {
        toast.success(`✅ Εγκρίθηκε (${result.qualityScore}/10)`, { duration: 3000 });
      }

      return result;
    } catch (err) {
      console.error("Construction photo analysis error:", err);
      const fallback: ConstructionPhotoAnalysisResult = {
        isApproved: true, qualityScore: 10, issuesFound: [],
        feedbackForTechnician: "Σφάλμα ανάλυσης.", skipped: true,
      };
      updateResult(category, index, fallback);
      return fallback;
    } finally {
      setState((prev) => ({
        ...prev,
        [category]: { ...prev[category], analyzing: false },
      }));
    }
  };

  const updateResult = (category: string, index: number, result: ConstructionPhotoAnalysisResult) => {
    setState((prev) => {
      const newResults = new Map(prev[category]?.results || []);
      newResults.set(index, result);
      return { ...prev, [category]: { ...prev[category], analyzing: prev[category]?.analyzing || false, results: newResults } };
    });
  };

  const getConstructionResult = (category: string, index: number) =>
    state[category]?.results?.get(index);

  const isConstructionAnalyzing = (category: string) =>
    state[category]?.analyzing || false;

  const hasRejectedPhotos = () => {
    for (const cat of Object.values(state)) {
      for (const result of cat.results.values()) {
        if (result.overriddenBy) continue; // overridden = approved
        if (!result.isApproved || result.qualityScore < 7) return true;
      }
    }
    return false;
  };

  const overrideResult = (category: string, index: number, reason: string) => {
    setState((prev) => {
      const catState = prev[category];
      if (!catState) return prev;
      const existing = catState.results.get(index);
      if (!existing) return prev;
      const newResults = new Map(catState.results);
      newResults.set(index, {
        ...existing,
        isApproved: true,
        overriddenBy: `supervisor:${reason}`,
      });
      return { ...prev, [category]: { ...catState, results: newResults } };
    });
  };

  const getAllResults = () => state;

  return {
    analyzeConstructionPhoto,
    getConstructionResult,
    isConstructionAnalyzing,
    hasRejectedPhotos,
    overrideResult,
    getAllResults,
  };
}
