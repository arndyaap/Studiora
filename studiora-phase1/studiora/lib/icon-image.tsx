import { ImageResponse } from "next/og";

/** Ikon aplikasi STUDIORA (PNG) yang dipakai manifest PWA dan apple-touch-icon. */
export function renderIcon(size: number, radiusRatio = 0.25) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6279F5, #A78BFA)",
          borderRadius: size * radiusRatio,
          color: "#F0F2F5",
          fontSize: size * 0.62,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        S
      </div>
    ),
    { width: size, height: size },
  );
}
