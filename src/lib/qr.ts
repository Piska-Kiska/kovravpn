// src/lib/qr.ts
import QRCode from "qrcode";

/** Generate QR code as PNG buffer */
export async function generateQR(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    width: 400,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
