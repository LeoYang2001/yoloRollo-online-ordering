import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";
import { brand } from "../config/brand";
import { Wordmark, Display, Mono, Sticker } from "../components/ui/Typography";
import { Button } from "../components/ui/Button";

/**
 * In-store TV display. Open in fullscreen (Chrome: F11). Customers in
 * the shop scan the QR to land on the ordering site.
 *
 *   Hot pink fullscreen bg with decorative blobs in corners.
 *   Top:    "yolo rollo" wordmark (green/white) + "IN-STORE DISPLAY"
 *   Center: "✦ SKIP THE LINE" sticker · "Scan. Order. Roll." (Roll in
 *           butter yellow) · big QR card tilted -2deg
 *   Bottom: "NOW ROLLING / A-041 · A-042" + dark Exit button
 */
export function TVDisplay() {
  const navigate = useNavigate();
  const url = `${brand.publicUrl}/?src=tv`;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-rollo-pink text-white">
      {/* Decorative corner blobs — positioned so they never cover text */}
      <div className="absolute -right-20 -top-16 h-[260px] w-[260px] rounded-full bg-rollo-rose" />
      <div className="absolute -bottom-24 -left-20 h-[300px] w-[300px] rounded-full bg-rollo-butter opacity-90" />
      <div className="absolute right-[-40px] top-32 h-16 w-16 rounded-full bg-rollo-green" />

      <div className="relative z-10 flex h-full flex-col px-7 pb-10 pt-16">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <Wordmark
            size={28}
            colors={{ yolo: "#A6CE39", rollo: "#FFFFFF", sub: "#FCD86F" }}
          />
          <Mono size={11} color="#fff">
            IN-STORE DISPLAY
          </Mono>
        </div>

        {/* Center column */}
        <div className="flex flex-1 flex-col justify-center">
          <div className="self-start">
            <Sticker size="md" bg="#FCD86F" fg="#2A1722">
              ✦ SKIP THE LINE
            </Sticker>
          </div>

          <Display
            size={72}
            className="mt-5 text-white"
            style={{ lineHeight: 0.98 }}
          >
            Scan.
            <br />
            Order.
            <br />
            <span style={{ color: "#FCD86F" }}>Roll.</span>
          </Display>

          {/* QR card */}
          <div
            className="mt-7 self-center rounded-rollo-card bg-white p-3.5"
            style={{
              transform: "rotate(-2deg)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
            }}
          >
            <QRCodeSVG
              value={url}
              size={260}
              level="H"
              fgColor="#2A1722"
              bgColor="#FFFFFF"
            />
            <div className="mt-1.5 text-center">
              <Mono size={10} color="rgba(42,23,34,0.40)">
                {url.replace(/^https?:\/\//, "").toUpperCase()}
              </Mono>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <Mono size={10} color="#fff">
              NOW ROLLING
            </Mono>
            <div className="mt-0.5 whitespace-nowrap font-display text-[20px] font-extrabold tracking-[-0.02em] text-white">
              A-041 · A-042
            </div>
          </div>
          <Button variant="dark" size="sm" onClick={() => navigate("/")}>
            ← Exit
          </Button>
        </div>
      </div>
    </div>
  );
}
