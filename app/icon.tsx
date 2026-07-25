import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 118,
          background: "linear-gradient(145deg, #6556f5, #312e81)",
        }}
      >
        <div
          style={{
            width: 238,
            height: 304,
            display: "flex",
            flexDirection: "column",
            gap: 27,
            padding: "105px 38px 35px",
            borderRadius: 28,
            background: "white",
            boxShadow: "0 24px 55px rgba(23, 20, 87, .32)",
          }}
        >
          <div style={{ height: 22, borderRadius: 11, background: "#4f46e5" }} />
          <div style={{ height: 22, borderRadius: 11, background: "#7771f7" }} />
          <div
            style={{
              width: 108,
              height: 22,
              borderRadius: 11,
              background: "#a7a3ff",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
