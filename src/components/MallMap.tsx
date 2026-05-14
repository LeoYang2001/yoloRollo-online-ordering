import { MapContainer, ImageOverlay, Marker } from "react-leaflet";
import { CRS, latLngBounds, divIcon } from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Wolfchase mall wayfinder.
 *
 * Renders the AI-generated `/public/mall-map.png` as a flat Leaflet
 * image overlay (CRS.Simple — pixel coordinates, not geographic).
 * On top we drop two branded "pin" markers built with divIcon HTML so
 * they pick up our font + palette without any extra image assets.
 *
 * Pan / pinch-to-zoom / double-tap-to-zoom / wheel-zoom all come free
 * from Leaflet's mobile-friendly defaults.
 *
 * To tune marker positions:
 *   1. Open /mall-map.png in any image viewer
 *   2. Note the pixel position of the place you want to mark, measuring
 *      x from the LEFT and y from the TOP of the image
 *   3. Leaflet's Simple CRS measures y from the BOTTOM of the image, so:
 *        leafletY = MAP_H - topY
 *   4. Update the constant below with `[leafletY, x]`.
 */

// Real pixel dimensions of public/mall-map.png. If you swap the image,
// remember to update these.
const MAP_W = 1448;
const MAP_H = 1086;
const BOUNDS = latLngBounds([0, 0], [MAP_H, MAP_W]);

// Marker positions in Leaflet [y, x] pixel coords (y from BOTTOM).
// Eyeballed off your generated map — fine-tune after seeing them live.
//   Food Court badge:  ~(720, 270 from top)  → y = 1086 - 270 = 816
//   Yolo Rollo storefront: ~(1150, 520 from top) → y = 1086 - 520 = 566
const FOOD_COURT: [number, number] = [816, 720];
const YOLO_ROLLO: [number, number] = [566, 1150];

/**
 * Build a Leaflet divIcon from raw HTML. We embed the inline styles
 * directly so we don't depend on Tailwind reaching inside Leaflet's
 * portal-rendered markers.
 */
function chipIcon(label: string, bg: string, fg = "#fff", emoji = "") {
  return divIcon({
    className: "",
    html: `
      <div style="
        display:inline-flex;align-items:center;gap:6px;
        background:${bg};color:${fg};
        padding:6px 12px;border-radius:999px;
        font-family:'Plus Jakarta Sans',system-ui,sans-serif;
        font-weight:800;font-size:11px;letter-spacing:0.06em;
        box-shadow:0 6px 14px -4px rgba(0,0,0,0.32);
        white-space:nowrap;
        transform:translate(-50%,-50%);
      ">
        ${emoji ? `<span style="font-size:13px">${emoji}</span>` : ""}
        <span>${label}</span>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function MallMap() {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-rollo-ink-line">
      <MapContainer
        crs={CRS.Simple}
        bounds={BOUNDS}
        maxBounds={BOUNDS}
        maxBoundsViscosity={1.0}
        minZoom={-2}
        maxZoom={2}
        zoom={-1}
        center={[MAP_H / 2, MAP_W / 2]}
        zoomControl
        attributionControl={false}
        scrollWheelZoom
        style={{
          height: 420,
          width: "100%",
          background: "#FFF1F5",
        }}
      >
        <ImageOverlay url="/mall-map.png" bounds={BOUNDS} />
        <Marker
          position={FOOD_COURT}
          icon={chipIcon("FOOD COURT", "#FCD86F", "#2A1722", "🍴")}
        />
        <Marker
          position={YOLO_ROLLO}
          icon={chipIcon("YOLO ROLLO", "#EC1E79", "#FFFFFF", "★")}
        />
      </MapContainer>
    </div>
  );
}
