
-- Allow technicians to update their own assignments (for status changes)
CREATE POLICY "Technicians can update own assignments" ON public.assignments
  FOR UPDATE TO authenticated USING (auth.uid() = technician_id);

-- Fix notifications INSERT - restrict to own user_id only
DROP POLICY "System can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
