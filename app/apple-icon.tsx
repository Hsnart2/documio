import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
          background: "linear-gradient(145deg, #6556f5, #312e81)",
        }}
      >
        <div
          style={{
            width: 86,
            height: 112,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "40px 14px 12px",
            borderRadius: 12,
            background: "white",
          }}
        >
          <div style={{ height: 8, borderRadius: 4, background: "#4f46e5" }} />
          <div style={{ height: 8, borderRadius: 4, background: "#7771f7" }} />
          <div
            style={{
              width: 40,
              height: 8,
              borderRadius: 4,
              background: "#a7a3ff",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
