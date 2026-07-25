"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FolderKanban } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type PracticeRow = { id: string; status: string };
type DocumentRow = {
  id: string;
  practice_id: string | null;
  expiry_date: string | null;
  payment_status: string | null;
  paid_amount: number | null;
};
type AttachmentRow = { document_id: string; attachment_type: string };

const PAYMENT_PROOFS = new Set(["Ricevuta", "Quietanza", "Pagamento"]);

export default function PracticeAttentionCard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCount(0);
      setLoading(false);
      return;
    }
    const [practiceResult, documentResult, attachmentResult] = await Promise.all([
      supabase
        .from("practices")
        .select("id,status")
        .eq("user_id", user.id)
        .not("status", "in", '("Chiusa","Completata")')
        .limit(300),
      supabase
        .from("documents")
        .select("id,practice_id,expiry_date,payment_status,paid_amount")
        .eq("user_id", user.id)
        .limit(1200),
      supabase
        .from("document_attachments")
        .select("document_id,attachment_type")
        .eq("user_id", user.id)
        .limit(3000),
    ]);
    if (practiceResult.error || documentResult.error || attachmentResult.error) {
      setLoading(false);
      return;
    }
    const practices = (practiceResult.data ?? []) as PracticeRow[];
    const documents = (documentResult.data ?? []) as DocumentRow[];
    const attachments = (attachmentResult.data ?? []) as AttachmentRow[];
    const proofByDocument = new Set(
      attachments
        .filter((item) => PAYMENT_PROOFS.has(item.attachment_type))
        .map((item) => item.document_id),
    );
    const today = new Date().toISOString().slice(0, 10);
    const attention = practices.filter((practice) => {
      const linked = documents.filter((document) => document.practice_id === practice.id);
      if (linked.length === 0) return true;
      return linked.some(
        (document) =>
          Boolean(document.expiry_date && document.expiry_date < today) ||
          ((document.payment_status === "Pagato" || Number(document.paid_amount) > 0) &&
            !proofByDocument.has(document.id)),
      );
    });
    setCount(attention.length);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mount: HTMLDivElement | null = null;
    const inspect = () => {
      const cards = document.querySelector<HTMLElement>(".smart-home-cards");
      if (!cards) {
        setTarget(null);
        return;
      }
      mount = cards.querySelector<HTMLDivElement>("#documio-practice-attention-card-root");
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "documio-practice-attention-card-root";
        cards.appendChild(mount);
      }
      setTarget(mount);
    };
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [load]);

  function openPractices() {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    const practicesButton = buttons.find((button) =>
      ["pratiche", "cases"].includes(button.textContent?.trim().toLowerCase() ?? ""),
    );
    practicesButton?.click();
    practicesButton?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (!target) return null;
  return createPortal(
    <button
      type="button"
      className="smart-home-card practice-attention-card"
      onClick={openPractices}
    >
      <span className="smart-home-card-icon"><FolderKanban size={22} /></span>
      <span className="smart-home-card-label">Pratiche da completare</span>
      <strong>{loading ? "—" : count}</strong>
      <small>{count ? "Richiedono un controllo" : "Tutte sotto controllo"}</small>
    </button>,
    target,
  );
}
