import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) { setProfile(null); return; }
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("exports_used, is_pro, stripe_customer_id")
      .eq("id", user.id)
      .single();
    setProfile(data);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // Re-fetch when tab becomes visible (e.g. returning from Stripe checkout)
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchProfile(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchProfile]);

  const exportsUsed = profile?.exports_used ?? 0;
  const isPro       = profile?.is_pro ?? false;
  const exportsLeft = Math.max(0, 7 - exportsUsed);

  return { profile, loading, refetch: fetchProfile, exportsUsed, exportsLeft, isPro };
}
