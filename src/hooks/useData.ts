import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useAssignments = () => {
  return useQuery({
    queryKey: ["assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*, profiles:technician_id(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useConstructions = () => {
  return useQuery({
    queryKey: ["constructions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("constructions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useMaterials = () => {
  return useQuery({
    queryKey: ["materials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .order("code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
};
