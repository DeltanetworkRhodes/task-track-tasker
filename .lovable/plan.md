

## Πρόβλημα

Τα ελληνικά δεν εμφανίζονται σωστά στο PDF γιατί η **pdf-lib υποστηρίζει μόνο `.ttf` και `.otf` fonts** — όχι `.woff`. Τα URLs που χρησιμοποιούνται τώρα (`greek-400-normal.woff`, `greek-700-normal.woff`) δεν γίνονται parse σωστά.

## Λύση

Αλλαγή των font URLs σε **Google Fonts `.ttf`** αρχεία (Roboto Regular & Bold) που υποστηρίζουν πλήρως ελληνικούς χαρακτήρες.

### Αρχεία που αλλάζουν

1. **`supabase/functions/generate-inspection-pdf/index.ts`** (lines 213-214)
   - Αντικατάσταση `.woff` URLs με `.ttf` URLs:
     - Regular: `https://fonts.gstatic.com/s/roboto/v47/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbGmT.ttf`
     - Bold: `https://fonts.gstatic.com/s/roboto/v47/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbFqQ.ttf`

2. **`public/templates/pdf-mapping.json`** (lines 151-152)
   - Ίδια αλλαγή font URLs για consistency με τον client-side generator.

3. **`src/lib/generateInspectionPdf.ts`** (line 210-211 area)
   - Ίδια αλλαγή font URLs στο client-side PDF generation.

### Γιατί αυτό δουλεύει
- Τα Google Fonts `.ttf` αρχεία περιέχουν πλήρη Unicode glyph tables (συμπεριλαμβανομένων ελληνικών)
- Η pdf-lib + fontkit μπορούν να κάνουν parse και embed `.ttf` fonts σωστά
- Τα `.woff` fonts χρησιμοποιούν compressed format που η pdf-lib δεν μπορεί να διαβάσει

