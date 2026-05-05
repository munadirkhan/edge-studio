import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

const LIMITS = { free: 5, starter: 20, pro: Infinity };

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) { setProfile(null); return; }
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("exports_used, plan, stripe_customer_id")
      .eq("id", user.id)
      .single();
    setProfile(data);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchProfile(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchProfile]);

  const plan       = profile?.plan ?? "free";
  const exportsUsed = profile?.exports_used ?? 0;
  const exportLimit = LIMITS[plan] ?? 5;
  const exportsLeft = exportLimit === Infinity ? Infinity : Math.max(0, exportLimit - exportsUsed);
  const isPro       = plan === "pro";
  const isStarter   = plan === "starter";
  const isPaid      = plan === "starter" || plan === "pro";

  return { profile, loading, refetch: fetchProfile, plan, exportsUsed, exportsLeft, exportLimit, isPro, isStarter, isPaid };
}
