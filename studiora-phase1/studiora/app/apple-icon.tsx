import { renderIcon } from "@/lib/icon-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // iOS menerapkan sudut membulat sendiri, jadi gambar dibuat penuh (tanpa radius).
  return renderIcon(180, 0);
}
