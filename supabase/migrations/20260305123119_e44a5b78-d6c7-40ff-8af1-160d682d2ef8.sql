
-- Make photos and surveys buckets private
UPDATE storage.buckets SET public = false WHERE id IN ('photos', 'surveys');
