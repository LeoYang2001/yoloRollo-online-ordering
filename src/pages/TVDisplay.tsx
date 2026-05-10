import { QRCodeSVG } from "qrcode.react";
import { brand } from "../config/brand";

/**
 * Fullscreen TV display. Open this on the in-store TV in fullscreen
 * (Chrome: F11 / Cmd-Ctrl-F). The QR code links to the customer-facing
 * ordering site at brand.publicUrl.
 *
 * Tip: append ?utm=tv-qr to track scans separately if you want.
 */
export function TVDisplay() {
  const url = `${brand.publicUrl}/?src=tv`;

  return (
    <div className="grid h-screen w-screen place-items-center bg-rollo-pink-soft">
      <div className="flex flex-col items-center text-center">
        <h1 className="font-display text-7xl leading-none md:text-8xl">
          <span className="text-rollo-green">yolo</span>{" "}
          <span className="text-rollo-pink">rollo</span>
        </h1>
        <p className="mt-3 font-display text-4xl text-rollo-orange">
          ICE CREAM
        </p>

        <p className="mt-10 font-display text-3xl">Skip the line.</p>
        <p className="font-display text-3xl">
          <span className="text-rollo-pink">Scan</span>{" "}
          <span className="text-rollo-green">to order.</span>
        </p>

        <div className="mt-8 rounded-3xl bg-white p-8 shadow-rollo">
          {/* Big QR — sized for a TV viewed across the store */}
          <QRCodeSVG
            value={url}
            size={520}
            level="H"
            includeMargin={false}
            fgColor="#1A1A1A"
            bgColor="#FFFFFF"
          />
        </div>

        <p className="mt-6 font-mono text-sm text-rollo-ink/60">{url}</p>
        <p className="mt-1 text-xs text-rollo-ink/50">
          {brand.subTagline} · {brand.location}
        </p>
      </div>
    </div>
  );
}
