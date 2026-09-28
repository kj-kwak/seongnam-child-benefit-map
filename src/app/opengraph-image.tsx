import { ImageResponse } from "next/og";
export const runtime = "edge";
export const alt = "성남 아동수당 지도";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#f7f7ef",
          color: "#214f40",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          gap: "26px",
        }}
      >
        <div style={{ fontSize: 28 }}>SEONGNAM · FAMILY MAP</div>
        <div style={{ fontSize: 80, fontWeight: 700 }}>성남 아동수당 지도</div>
        <div style={{ fontSize: 32 }}>우리 동네 사용처를 한눈에</div>
      </div>
    ),
    size,
  );
}
