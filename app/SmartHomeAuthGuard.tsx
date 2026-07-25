"use client";

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";

function applyAuthenticatedState(authenticated: boolean) {
  document.body.classList.toggle("documio-authenticated", authenticated);

  if (!authenticated) {
    document.body.classList.remove("smart-home-active");
    document.querySelectorAll(".legacy-dashboard-hidden").forEach((element) => {
      element.classList.remove("legacy-dashboard-hidden");
    });
  }
}

export default function SmartHomeAuthGuard() {
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      applyAuthenticatedState(false);
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active) applyAuthenticatedState(Boolean(data.session?.user));
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      applyAuthenticatedState(Boolean(session?.user));
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
      document.body.classList.remove("documio-authenticated");
    };
  }, []);

  return null;
}
