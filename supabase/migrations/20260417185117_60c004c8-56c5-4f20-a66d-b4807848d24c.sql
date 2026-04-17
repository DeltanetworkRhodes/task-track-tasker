
ALTER TABLE constructions
  ADD COLUMN IF NOT EXISTS koi_type_cab_bep text DEFAULT '4'' μ cable',
  ADD COLUMN IF NOT EXISTS koi_type_cab_bcp text DEFAULT '4'' μ cable',
  ADD COLUMN IF NOT EXISTS asbuilt_section6 jsonb DEFAULT '{}';
