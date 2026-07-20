"use client";

import { useEffect, useState } from "react";

function findPracticeSelect(card: HTMLElement) {
  const selects = Array.from(card.querySelectorAll<HTMLSelectElement>("select"));

  return (
    selects.find((select) =>
      Array.from(select.options).some((option) => {
        const text = option.textContent?.trim().toLowerCase() ?? "";
        return (
          option.value === "" &&
          (text.includes("nessuna pratica") || text.includes("no case"))
        );
      }),
    ) ?? null
  );
}

export default function PracticeVisibility() {
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);

  useEffect(() => {
    let frame = 0;

    const updateVisibility = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(".doc-card"),
        );
        let count = 0;

        cards.forEach((card) => {
          const practiceSelect = findPracticeSelect(card);

          if (!practiceSelect) {
            card.style.removeProperty("display");
            return;
          }

          const isArchived = Boolean(practiceSelect.value);
          if (isArchived) count += 1;

          if (isArchived && !showArchived) {
            card.style.display = "none";
          } else {
            card.style.removeProperty("display");
          }
        });

        setArchivedCount(count);
      });
    };

    updateVisibility();

    const observer = new MutationObserver(updateVisibility);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    document.addEventListener("change", updateVisibility, true);
    window.addEventListener("resize", updateVisibility);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("change", updateVisibility, true);
      window.removeEventListener("resize", updateVisibility);

      document
        .querySelectorAll<HTMLElement>(".doc-card")
        .forEach((card) => card.style.removeProperty("display"));
    };
  }, [showArchived]);

  if (archivedCount === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 45,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 7,
      }}
    >
      {!showArchived && (
        <span
          style={{
            maxWidth: 250,
            padding: "8px 11px",
            borderRadius: 12,
            background: "rgba(15, 23, 42, 0.92)",
            color: "white",
            fontSize: 12,
            fontWeight: 700,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
          }}
        >
          {archivedCount} {archivedCount === 1 ? "documento archiviato nascosto" : "documenti archiviati nascosti"}
        </span>
      )}

      <button
        type="button"
        onClick={() => setShowArchived((current) => !current)}
        aria-pressed={showArchived}
        style={{
          border: "1px solid #c7d2fe",
          borderRadius: 999,
          padding: "11px 16px",
          background: showArchived ? "#eef2ff" : "#5b5ce2",
          color: showArchived ? "#3730a3" : "white",
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 12px 30px rgba(79, 70, 229, 0.24)",
        }}
      >
        {showArchived
          ? "Nascondi documenti nelle pratiche"
          : `Mostra archiviati (${archivedCount})`}
      </button>
    </div>
  );
}
