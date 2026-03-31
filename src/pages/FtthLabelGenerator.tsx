import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Check, AlertTriangle, Printer, Tag } from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

// ─── Types ───
interface Fields {
  address: string;
  splitter: string;
  cabinet: string;
  tube: string;
  limits: string;
  fiberCapacity: string;
  bepNumber: string;
  buildingA1B1: string;
  buildingC1D1: string;
  destination: string;
  port1: string;
  port2: string;
  port3: string;
}

const DEFAULT: Fields = {
  address: "",
  splitter: "",
  cabinet: "",
  tube: "",
  limits: "",
  fiberCapacity: "4FO",
  bepNumber: "BEP01",
  buildingA1B1: "",
  buildingC1D1: "",
  destination: "",
  port1: "ΕΙΣΟΔΟΣ ΠΑΡΟΧΙΚΗΣ",
  port2: "SPLITTER",
  port3: "PATCH TO BMO",
};

// ─── Copy helper ───
function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    if (disabled) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Αντιγράφηκε!");
    setTimeout(() => setCopied(false), 1500);
  }, [text, disabled]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      disabled={disabled}
      className="h-7 w-7 p-0 shrink-0"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

// ─── Label preview ───
function LabelPreview({ label, text, disabled, multiline }: { label: string; text: string; disabled?: boolean; multiline?: boolean }) {
  return (
    <div className={`space-y-1 ${disabled ? "opacity-40" : ""}`}>
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="flex items-start gap-2">
        <div className={`flex-1 font-mono text-xs bg-muted/50 rounded-md px-3 py-2 border border-border text-foreground ${multiline ? "whitespace-pre-line" : ""} ${disabled ? "italic text-muted-foreground" : "font-semibold"}`}>
          {disabled ? "—" : text}
        </div>
        <CopyButton text={text} disabled={disabled} />
      </div>
    </div>
  );
}

// ─── Section card ───
function Section({ title, icon, children, badge }: { title: string; icon: string; children: React.ReactNode; badge?: string }) {
  return (
    <Card className="p-4 space-y-3 print:break-inside-avoid">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-lg">{icon}</span>
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">{title}</h2>
        {badge && <Badge variant="secondary" className="text-[9px]">{badge}</Badge>}
      </div>
      {children}
    </Card>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pl-1 border-l-2 border-primary/20 ml-1">
      <div className="text-[10px] font-bold text-primary uppercase tracking-wider pl-2">{title}</div>
      <div className="space-y-2 pl-2">{children}</div>
    </div>
  );
}

// ─── Placeholder section ───
function PlaceholderSection({ title, icon }: { title: string; icon: string }) {
  return (
    <Section title={title} icon={icon}>
      <div className="flex items-start gap-2 p-3 rounded-md bg-muted/30 border border-border">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Δεν υπάρχει ρητή οδηγία εσωτερικού / εξωτερικού label για {title} στο source PDF.
        </p>
      </div>
    </Section>
  );
}

// ─── Main page ───
export default function FtthLabelGenerator() {
  const [f, setF] = useState<Fields>(DEFAULT);

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [key]: e.target.value }));

  const hasAddress = f.address.trim().length > 0;
  const hasCabinet = f.cabinet.trim().length > 0;
  const hasLimits = f.limits.trim().length > 0;
  const hasFiber = f.fiberCapacity.trim().length > 0;
  const hasBcpOutside = hasCabinet && hasLimits;
  const hasBepOutside = hasCabinet && hasLimits;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12 print:max-w-none">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <Tag className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">FTTH Label Generator</h1>
            <Badge variant="outline" className="text-[10px]">COSMOTE Β' Φάση</Badge>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              ΜΟΝΟ όσα labels ορίζονται ρητά από το PDF
            </span>
          </div>
        </div>

        {/* Input fields */}
        <Card className="p-4 space-y-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Πεδία εισαγωγής</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Διεύθυνση *</Label>
              <Input value={f.address} onChange={set("address")} placeholder="π.χ. ΟΔΥΣΣΕΩΣ 25" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Splitter</Label>
              <Input value={f.splitter} onChange={set("splitter")} placeholder="π.χ. SGA01(1:8).04" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Καμπίνα *</Label>
              <Input value={f.cabinet} onChange={set("cabinet")} placeholder="π.χ. A17" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Σωληνίσκος</Label>
              <Input value={f.tube} onChange={set("tube")} placeholder="π.χ. A17" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Όρια *</Label>
              <Input value={f.limits} onChange={set("limits")} placeholder="π.χ. 205-208" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Χωρητικότητα ίνας *</Label>
              <Select value={f.fiberCapacity} onValueChange={(v) => setF((p) => ({ ...p, fiberCapacity: v }))}>
                <SelectTrigger className="h-8 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
              <SelectItem value="4FO">4FO (≤2 διαμ/όροφο)</SelectItem>
                  <SelectItem value="12FO">12FO (&gt;2 διαμ/όροφο)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">BEP Αρίθμηση</Label>
              <Input value={f.bepNumber} onChange={set("bepNumber")} placeholder="π.χ. BEP01" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Κτήριο A1-B1</Label>
              <Input value={f.buildingA1B1} onChange={set("buildingA1B1")} placeholder="π.χ. ΟΔΥΣΣΕΩΣ 25" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Κτήριο C1-D1</Label>
              <Input value={f.buildingC1D1} onChange={set("buildingC1D1")} placeholder="π.χ. ΑΘΗΝΑΣ 14" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Προορισμός (BEP καλώδια)</Label>
              <Input value={f.destination} onChange={set("destination")} placeholder="π.χ. BMO" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Αντιστοίχιση Πόρτας 1</Label>
              <Input value={f.port1} onChange={set("port1")} placeholder="ΕΙΣΟΔΟΣ ΠΑΡΟΧΙΚΗΣ" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Αντιστοίχιση Πόρτας 2</Label>
              <Input value={f.port2} onChange={set("port2")} placeholder="SPLITTER" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Αντιστοίχιση Πόρτας 3</Label>
              <Input value={f.port3} onChange={set("port3")} placeholder="PATCH TO BMO" className="h-8 text-xs font-mono" />
            </div>
          </div>
          <div className="flex justify-end print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="text-xs gap-1.5">
              <Printer className="h-3.5 w-3.5" />
              Εκτύπωση
            </Button>
          </div>
        </Card>

        {/* ═══ 1. ΚΑΜΠΙΝΑ ΝΕΟΥ ΤΥΠΟΥ ═══ */}
        <Section title="Καμπίνα νέου τύπου" icon="🏗️" badge="COSMOTE Β' Φάση">
          <SubSection title="Εσωτερικά">
            <LabelPreview
              label="A. Μέσα στην κασέτα"
              text={`ΔΙΕΥΘΥΝΣΗ: ${f.address}`}
              disabled={!hasAddress}
            />
            <LabelPreview
              label="B. Πάνω στις εξόδους Splitter"
              text={`${f.splitter} - ${f.address}`}
              disabled={!hasAddress || !f.splitter.trim()}
            />
          </SubSection>
          <SubSection title="Εξωτερικά">
            <LabelPreview
              label="C. Πάνω στην πόρτα του sub rack"
              text={f.address}
              disabled={!hasAddress}
            />
            <LabelPreview
              label="D. Πάνω στον σωληνίσκο"
              text={f.address}
              disabled={!hasAddress}
            />
          </SubSection>
        </Section>

        {/* ═══ 2. ΚΑΜΠΙΝΑ ΠΑΛΑΙΟΥ ΤΥΠΟΥ ═══ */}
        <Section title="Καμπίνα παλαιού τύπου" icon="🏗️" badge="COSMOTE Β' Φάση">
          <SubSection title="Εσωτερικά">
            <LabelPreview
              label="A. Μέσα στην κασέτα"
              text={f.address}
              disabled={!hasAddress}
            />
            <LabelPreview
              label="B. Πάνω στις εξόδους Splitter"
              text={`${f.splitter} - ${f.address}`}
              disabled={!hasAddress || !f.splitter.trim()}
            />
          </SubSection>
          <SubSection title="Εξωτερικά">
            <LabelPreview
              label="C. Πάνω στον σωληνίσκο"
              text={f.address}
              disabled={!hasAddress}
            />
          </SubSection>
        </Section>

        {/* ═══ 3. BCP ═══ */}
        <Section title="BCP" icon="📦" badge="COSMOTE Β' Φάση">
          <SubSection title="Εσωτερικά">
            <LabelPreview
              label="A. Label μαύρης ίνας"
              text={`ΚΑΜΠΙΝΑ: ${f.cabinet} | ${f.fiberCapacity} | ΟΡΙΑ: ${f.limits}`}
              disabled={!hasCabinet || !hasFiber || !hasLimits}
            />
            <LabelPreview
              label="B. Label άσπρης ίνας"
              text={`${f.bepNumber} | ${f.fiberCapacity}`}
              disabled={!f.bepNumber.trim() || !hasFiber}
            />
          </SubSection>
          <SubSection title="Εξωτερικά">
            <LabelPreview
              label="C. Στην πόρτα του BCP"
              text={[
                `ΚΑΜΠΙΝΑ: ${f.cabinet}`,
                `ΣΩΛΗΝΙΣΚΟΣ: ${f.tube || f.cabinet}`,
                `ΟΡΙΑ: ${f.limits}`,
                ...(f.buildingA1B1.trim() ? [`A1-B1: ${f.buildingA1B1}`] : []),
                ...(f.buildingC1D1.trim() ? [`C1-D1: ${f.buildingC1D1}`] : []),
              ].join("\n")}
              disabled={!hasBcpOutside}
              multiline
            />
          </SubSection>
        </Section>

        {/* ═══ 4. BEP ═══ */}
        <Section title="BEP" icon="🔌" badge="COSMOTE Β' Φάση">
          <SubSection title="Εσωτερικά">
            <LabelPreview
              label="A. Label καλωδίων"
              text={`ΠΡΟΣ: ${f.destination} | ${f.fiberCapacity}`}
              disabled={!f.destination.trim() || !hasFiber}
            />
          </SubSection>
          <SubSection title="Εξωτερικά">
            <LabelPreview
              label="B. Στην πόρτα του BEP"
              text={[
                `ΚΑΜΠΙΝΑ: ${f.cabinet}`,
                `ΣΩΛΗΝΙΣΚΟΣ: ${f.tube || f.cabinet}`,
                `ΟΡΙΑ: ${f.limits}`,
                `ΠΟΡΤΑ 1: ${f.port1}`,
                `ΠΟΡΤΑ 2: ${f.port2}`,
                `ΠΟΡΤΑ 3: ${f.port3}`,
              ].join("\n")}
              disabled={!hasBepOutside}
              multiline
            />
          </SubSection>
        </Section>

        {/* ═══ 5. BMO ═══ */}
        <PlaceholderSection title="BMO" icon="📡" />

        {/* ═══ 6. FB ═══ */}
        <PlaceholderSection title="FB" icon="🏠" />
      </div>
    </AppLayout>
  );
}