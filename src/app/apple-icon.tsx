import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ícone de toque para iOS, com mais respiro que o favicon. */
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
          background: "#0a0a0b",
        }}
      >
        <div
          style={{
            width: 104,
            height: 104,
            borderRadius: 999,
            border: "26px solid #fff",
          }}
        />
      </div>
    ),
    size,
  );
}
