

# Πλήρης Auto-Billing ΟΤΕ — Σχέδιο Υλοποίησης

## Τι υπάρχει ήδη (να μην ξαναγραφτεί)

Το σύστημα αυτό **είναι ήδη χτισμένο** client-side:

- `src/lib/oteAutoBilling.ts` — μηχανή `computeAutoBilling()` + `mergeAutoBilling()` με tier-families.
- `ConstructionForm.tsx` — τρέχει live useEffect που διαβάζει `section6`, `floorMeters`, `routes`, `buildingType`, `floors`, `sr_id` και προσθέτει/αφαιρεί άρθρα στο section ΕΡΓΑΣΙΕΣ.
- DB triggers `sync_construction_cost_to_profit` και `charge_technician_on_phase_complete` — ήδη ενημερώνουν profit & technician earnings.
- Tier-replacement & manual-protection — ήδη λειτουργούν.

**Άρα δεν χρειάζεται:** νέα DB function, trigger στο `constructions`, νέος πίνακας `sr_task_articles`, ή νέα schema. Όλα γίνονται ήδη πάνω στο `construction_works`.

## Mapping AS-BUILD → OTE άρθρα (επιβεβαιωμένο)

| Πεδίο φόρμας | Πηγή | Άρθρα που τροφοδοτεί |
|---|---|---|
| `buildingType` (mono/mez/small → "small") | state | 1956.1/.2, 1970.4/.5 |
| `floors` + `floorMeters[]` | state | 1985.2 × N, 1986.3 (3 πρώτοι), 1986.4 (4ος+) |
| `section6.eisagogi_type` + `ms_skamma` | AS-BUILD §6 | 1965.1–4 (Νέα σωλήνωση) |
| `section6.eisagogi_type=ΕΣΚΑΛΙΤ` + `eskalit_*` | AS-BUILD §6 | 1963.1/.2 |
| `section6.bcp_eidos` + `bcp_ms+bcp_bep_ypogeia+bcp_bep_enaeria` | AS-BUILD §6 | 1991.1.x (Δημ.) / 1991.2.x (Ιδιωτ.) + 1997 |
| `routes[0].koi` (FTTH ΥΠΟΓ ΔΔ Cabin→BEP) | Διαδρομές | 1993.1.x (υπόγεια) + 1980.1 ή 1980.2 |
| `routes[1].koi` (ΕΝΑΕΡΙΟ Cab→BEP) | Διαδρομές | 1993.2/.3 |
| `section6.fb_same_level_as_bep` + `horizontal_meters` | AS-BUILD §6 | 1984.i/.ii |
| `sr_id` ξεκινά με "2-" | assignment | 1955.2 (Γ' Φάση) |

**Κενά που εντοπίστηκαν** (3 πεδία λείπουν από το UI):

1. `fb_same_level_as_bep` — υπάρχει στο type, αλλά **δεν υπάρχει toggle στο UI του §6**.
2. `horizontal_meters` — ίδιο, δεν υπάρχει input.
3. `cab_to_bep_damaged` — flag για 1980.2 vs 1980.1, δεν υπάρχει toggle.

Επίσης: η εναέρια διαδρομή Cab→BEP (1993.2/.3) τραβιέται από `routes[1].koi` αλλά **δεν περνιέται στο `AutoBillingInput`** στο effect.

## Τι θα γίνει

### Βήμα 1 — Κλείσιμο των 3 κενών UI πεδίων

Στο **§6 Οριζοντογραφία AS-BUILD** του `ConstructionForm.tsx`, κάτω από τα BCP/εσκαλίτ inputs, προσθήκη μικρού block:

```text
┌─ FB & Οριζόντια όδευση ─────────────────────┐
│ ☐ FB στο ίδιο επίπεδο με BEP                │
│ Οριζόντια μέτρα: [____] m                   │
│ ☐ Κατειλημμένη υποδομή Cab→BEP (1980.2)     │
└─────────────────────────────────────────────┘
```

Τα τρία πεδία αποθηκεύονται μέσα στο ίδιο `asbuilt_section6` JSONB — καμία αλλαγή schema.

### Βήμα 2 — Συμπλήρωση input στο auto-billing engine

Στο `useEffect` του auto-billing (γραμμές ~1795-1832 του `ConstructionForm.tsx`), διόρθωση δύο σημείων:

- `fb_same_level_as_bep`, `horizontal_meters`, `cab_to_bep_damaged` τραβιούνται από `section6` (όχι `(section6 as any)`).
- Σιγουριά ότι το `route_aerial_cab_to_bep_meters` τροφοδοτεί σωστά το 1993.2/.3.

### Βήμα 3 — Admin Auto-Billing Card (στο `Construction.tsx` detail view)

Νέο component `OteAutoBillingCard` που εμφανίζεται **μόνο σε admin** μέσα στο dialog λεπτομερειών μιας κατασκευής:

```text
┌─ ✨ Αυτόματη Τιμολόγηση ΟΤΕ ───────────────────┐
│  Υπολογισμός βάσει AS-BUILD       ⟳ Refresh   │
│                                                 │
│  💰 747,06 €              7 άρθρα               │
│                                                 │
│  ┌──────┬──────┬──────┬──────┐                  │
│  │Αυτοψ.│ BEP  │Σωλήν.│Κάθετ.│  breakdown      │
│  │55,80 │34,88 │298,40│205,08│  per category    │
│  └──────┴──────┴──────┴──────┘                  │
│                                                 │
│  [📋 Δες αναλυτικά]  [📄 Εκτύπωση ΟΤΕ]          │
└─────────────────────────────────────────────────┘
```

- Διαβάζει από `construction_works` JOIN `ote_articles` (μόνο codes που ταιριάζουν με tier-families = auto-generated).
- Group by category prefix (1956 / 1970 / 1965 / 1985 …).
- Sum ποσοτήτων × `unit_price` = total.
- Κουμπί "Δες αναλυτικά" → `Dialog` με πίνακα όλων των άρθρων.

### Βήμα 4 — Lightweight ειδοποίηση στον τεχνικό

Το υπάρχον `lastAutoBillingSummary` ήδη υπολογίζεται. Ενεργοποίηση discrete toast/banner **πάνω από το section ΕΡΓΑΣΙΕΣ** (μόνο όταν `!isCrewMode && summary.added > 0`):

```text
✨ Αυτόματη καταχώρηση: 7 εργασίες προστέθηκαν με βάση το AS-BUILD
```

Καμία αναφορά σε ευρώ προς τον τεχνικό (per memory: technician financial privacy).

### Βήμα 5 — Realtime ενημέρωση Admin Construction list

Στο `useConstructions` (`src/hooks/useData.ts`), προσθήκη Supabase Realtime subscription στους πίνακες `constructions` και `construction_works`, ώστε όταν ο τεχνικός σώσει, ο πίνακας του admin να ανανεώνεται αυτόματα χωρίς refresh.

```typescript
useEffect(() => {
  const channel = supabase.channel('constructions-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'constructions' },
        () => queryClient.invalidateQueries({ queryKey: ['constructions'] }))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, []);
```

## Αρχεία που επηρεάζονται

| Αρχείο | Αλλαγή |
|---|---|
| `src/components/ConstructionForm.tsx` | + 3 inputs στο §6, διόρθωση input mapping στο auto-billing effect, ειδοποίηση τεχνικού |
| `src/components/construction/OteAutoBillingCard.tsx` | **ΝΕΟ** — admin summary card |
| `src/pages/Construction.tsx` | Mount του `OteAutoBillingCard` στο detail dialog |
| `src/hooks/useData.ts` | + Realtime subscription στο `useConstructions` |

## Τι ΔΕΝ θα γίνει (και γιατί)

- **Καμία DB function** `auto_calculate_ote_billing()` — η λογική ζει ήδη client-side και δουλεύει live καθώς γράφει ο τεχνικός. Μια DB function θα έτρεχε μόνο on save, χάνοντας το live preview.
- **Κανένας νέος πίνακας** `sr_task_articles` — χρησιμοποιούμε τον υπάρχοντα `construction_works`. Διαφορετικά διπλασιάζουμε source of truth.
- **Κανένα `source` enum** (auto_suggest/manual/override) στο DB — η διάκριση γίνεται ήδη client-side μέσω του `autoAddedCodesRef` + `isTierManagedCode()`.

