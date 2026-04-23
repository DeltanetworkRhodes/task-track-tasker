import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Loader2, Check, X, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { hapticFeedback } from "@/lib/haptics";

interface VoiceInputButtonProps {
  context: "as_build" | "section6" | "materials" | "routes";
  onApply: (fields: Record<string, any>) => void;
  currentFields?: Record<string, any>;
  label?: string;
}

const FIELD_LABELS: Record<string, string> = {
  floors: "Όροφοι",
  building_type: "Τύπος Κτιρίου",
  bep_type: "Τύπος BEP",
  bmo_type: "Τύπος BMO",
  eisagogi_type: "Είδος Εισαγωγής",
  eisagogi_meters: "Μέτρα Εισαγωγής",
  bcp_eidos: "Είδος BCP",
  bcp_ms: "Σκάμμα Μ/Σ",
  bcp_bep_ypogeia: "BCP→BEP Υπόγεια",
  bcp_bep_enaeria: "BCP→BEP Εναέρια",
  horizontal_meters: "Οριζόντια Μέτρα",
  fb_same_level_as_bep: "FB Ίδιο Επίπεδο με BEP",
  cab_to_bep_damaged: "Κατειλημμένη Cab→BEP",
  ms_skamma: "Μ/Σ Σκάμμα",
  ball_marker_bep: "Ball Marker BEP",
  ball_marker_bcp: "Ball Marker BCP",
  bmo_bep_distance: "Απόσταση BMO-BEP",
};

export function VoiceInputButton({ context, onApply, currentFields, label }: VoiceInputButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [extractedFields, setExtractedFields] = useState<Record<string, any> | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>("");

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  const processTranscript = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        toast.warning("Δεν καταγράφηκε τίποτα");
        return;
      }

      setIsProcessing(true);
      try {
        const { data, error } = await supabase.functions.invoke("parse-voice-input", {
          body: { transcript: text, context, currentFields },
        });

        if (error) throw error;

        if (data?.fields && Object.keys(data.fields).length > 0) {
          setExtractedFields(data.fields);
          setShowPreview(true);
        } else {
          toast.warning("Δεν αναγνωρίστηκαν πεδία — δοκίμασε ξανά");
        }
      } catch (err: any) {
        const msg = err?.message || "Άγνωστο σφάλμα";
        toast.error("Σφάλμα επεξεργασίας: " + msg);
      } finally {
        setIsProcessing(false);
      }
    },
    [context, currentFields]
  );

  const startRecording = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Ο browser δεν υποστηρίζει φωνητική καταχώρηση");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "el-GR";
    recognition.continuous = true;
    recognition.interimResults = true;

    finalTranscriptRef.current = "";
    setTranscript("");

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscriptRef.current += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(finalTranscriptRef.current + interim);
    };

    recognition.onerror = (e: any) => {
      console.error("Speech error:", e);
      if (e?.error !== "aborted" && e?.error !== "no-speech") {
        toast.error("Σφάλμα αναγνώρισης φωνής");
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
      hapticFeedback.light();
    } catch (err) {
      console.error("Failed to start recognition:", err);
      toast.error("Δεν ήταν δυνατή η εκκίνηση του μικροφώνου");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      /* noop */
    }
    setIsRecording(false);
    hapticFeedback.medium();

    // Δώσε χρόνο στο recognizer να κλείσει και να flush-άρει το final
    setTimeout(() => {
      const text = finalTranscriptRef.current.trim() || transcript.trim();
      processTranscript(text);
    }, 250);
  }, [transcript, processTranscript]);

  const applyFields = () => {
    if (!extractedFields) return;
    onApply(extractedFields);
    toast.success(`✅ Συμπληρώθηκαν ${Object.keys(extractedFields).length} πεδία`);
    setShowPreview(false);
    setExtractedFields(null);
    setTranscript("");
    finalTranscriptRef.current = "";
    hapticFeedback.success();
  };

  const cancelPreview = () => {
    setShowPreview(false);
    setExtractedFields(null);
  };

  return (
    <>
      <Button
        type="button"
        variant={isRecording ? "destructive" : "outline"}
        size="sm"
        onClick={() => (isRecording ? stopRecording() : startRecording())}
        disabled={isProcessing}
        className="gap-2"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Επεξεργασία...
          </>
        ) : isRecording ? (
          <>
            <Square className="h-4 w-4" />
            Τερματισμός
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" />
            {label ?? "Φωνή"}
          </>
        )}
      </Button>

      {isRecording && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-destructive px-5 py-2.5 text-destructive-foreground shadow-2xl flex items-center gap-3 animate-pulse">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </span>
          <span className="text-sm font-semibold">🎤 Ακούω... πάτησε "Τερματισμός" όταν τελειώσεις</span>
        </div>
      )}

      <Dialog open={showPreview} onOpenChange={(o) => !o && cancelPreview()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>✅ Κατάλαβα τα εξής:</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-sm italic text-muted-foreground">
              "{transcript}"
            </div>

            <div className="space-y-2">
              {extractedFields &&
                Object.entries(extractedFields).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                  >
                    <span className="text-sm text-muted-foreground">
                      {FIELD_LABELS[key] || key}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {typeof value === "boolean" ? (value ? "Ναι" : "Όχι") : String(value)}
                    </span>
                  </div>
                ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={applyFields} className="flex-1 gap-2">
                <Check className="h-4 w-4" />
                Εφαρμογή
              </Button>
              <Button variant="outline" onClick={cancelPreview} className="flex-1 gap-2">
                <X className="h-4 w-4" />
                Ακύρωση
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
