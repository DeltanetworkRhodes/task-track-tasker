ALTER TABLE public.sr_work_categories 
ADD COLUMN work_prefixes text[] DEFAULT '{}',
ADD COLUMN material_codes text[] DEFAULT '{}';