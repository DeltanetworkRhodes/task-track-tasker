import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PhotoAnalysisResult {
  isValid: boolean;
  message: string;
  skipped?: boolean;
}

interface AnalysisState {
  [key: string]: {
    analyzing: boolean;
    results: Map<number, PhotoAnalysisResult>;
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip the data:...;base64, prefix
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
        body: { imageBase64, photoType },
      });

      if (error) {
        console.error("Photo analysis error:", error);
        // Graceful degradation
        const result: PhotoAnalysisResult = {
          isValid: true,
          message: "Ο έλεγχος AI δεν ήταν δυνατός.",
          skipped: true,
        };
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
      const result: PhotoAnalysisResult = {
        isValid: true,
        message: "Ο έλεγχος AI δεν ήταν δυνατός.",
        skipped: true,
      };
      updateResult(category, index, result);
      return result;
    } finally {
      setAnalysisState((prev) => ({
        ...prev,
        [category]: {
          ...prev[category],
          analyzing: false,
        },
      }));
    }
  };

  const updateResult = (
    category: string,
    index: number,
    result: PhotoAnalysisResult
  ) => {
    setAnalysisState((prev) => {
      const newResults = new Map(prev[category]?.results || []);
      newResults.set(index, result);
      return {
        ...prev,
        [category]: {
          ...prev[category],
          analyzing: prev[category]?.analyzing || false,
          results: newResults,
        },
      };
    });
  };

  const clearResults = (category: string) => {
    setAnalysisState((prev) => {
      const newState = { ...prev };
      delete newState[category];
      return newState;
    });
  };

  const getResult = (category: string, index: number) =>
    analysisState[category]?.results?.get(index);

  const isAnalyzing = (category: string) =>
    analysisState[category]?.analyzing || false;

  return { analyzePhoto, getResult, isAnalyzing, clearResults };
}
