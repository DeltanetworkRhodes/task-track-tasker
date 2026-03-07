import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfiles } from "@/hooks/useData";
import { Send, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SRCommentsProps {
  assignmentId: string;
}

const SRComments = ({ assignmentId }: SRCommentsProps) => {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: comments, isLoading } = useQuery({
    queryKey: ["sr_comments", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sr_comments" as any)
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!assignmentId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!assignmentId) return;
    const channel = supabase
      .channel(`sr-comments-${assignmentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sr_comments",
          filter: `assignment_id=eq.${assignmentId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["sr_comments", assignmentId] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [assignmentId, queryClient]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  const handleSend = async () => {
    if (!message.trim() || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from("sr_comments" as any).insert({
        assignment_id: assignmentId,
        user_id: user.id,
        message: message.trim(),
      });
      if (error) throw error;
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["sr_comments", assignmentId] });
    } catch (err) {
      console.error("Failed to send comment:", err);
    } finally {
      setSending(false);
    }
  };

  const getProfileName = (userId: string) => {
    const profile = profiles?.find((p) => p.user_id === userId);
    return profile?.full_name || "Χρήστης";
  };

  const isOwnMessage = (userId: string) => userId === user?.id;

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("el-GR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="mt-4 pt-4 border-t border-border/30">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Σχόλια</h3>
        {comments && comments.length > 0 && (
          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {comments.length}
          </span>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="space-y-2 max-h-[200px] overflow-y-auto pr-1 mb-3"
      >
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && (!comments || comments.length === 0) && (
          <p className="text-xs text-muted-foreground/50 text-center py-3">
            Κανένα σχόλιο ακόμα
          </p>
        )}
        {comments?.map((c: any) => {
          const own = isOwnMessage(c.user_id);
          return (
            <div
              key={c.id}
              className={`flex flex-col ${own ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  own
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                }`}
              >
                {!own && (
                  <p className="text-[10px] font-semibold mb-0.5 opacity-70">
                    {getProfileName(c.user_id)}
                  </p>
                )}
                <p className="text-xs whitespace-pre-wrap break-words">{c.message}</p>
              </div>
              <span className="text-[9px] text-muted-foreground/50 mt-0.5 px-1">
                {formatTime(c.created_at)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Γράψε σχόλιο..."
          className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-muted-foreground/50 transition-all"
          disabled={sending}
        />
        <Button
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleSend}
          disabled={!message.trim() || sending}
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
};

export default SRComments;
