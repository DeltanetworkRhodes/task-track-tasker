import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    __oauthRejected?: boolean;
  }
}
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // For OAuth sign-ins, check if user was pre-created (has organization_id)
      if (_event === 'SIGNED_IN' && session?.user) {
        const provider = session.user.app_metadata?.provider;
        if (provider && provider !== 'email') {
          // Check if user has a profile with organization_id
          const { data: profile } = await supabase
            .from("profiles")
            .select("organization_id")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (!profile?.organization_id) {
            // User was not pre-created by admin — sign them out
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            window.__oauthRejected = true;
            return;
          }
        }

        // Audit log: track login events
        supabase.from("audit_logs").insert({
          user_id: session.user.id,
          action: "login",
          details: { method: provider || "email" },
          user_agent: navigator.userAgent,
          page_url: window.location.pathname,
        }).then(() => {});
      }
      if (_event === 'SIGNED_OUT') {
        // logged before user is cleared
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
