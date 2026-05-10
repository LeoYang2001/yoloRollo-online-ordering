# Yolo Rollo Ice Cream — online ordering

Mobile-first React ordering site with Clover POS integration. The
in-store TV shows a fullscreen QR code at `/tv` that customers scan to
order from their phone. Orders push into Clover already paid, so the
team just rolls and hands them off.

```
[ phone ] --scan--> /         → menu / cart / checkout
                                 │
                                 ▼
                       /api/orders/create  ─┐
                                            │ creates Clover order
                                            │ + Hosted Checkout session
                                            ▼
                              Clover Hosted Checkout (card)
                                            │
                                            ▼ on success redirect
                                  /confirmation/:orderId
                                            │
                                            ▼ polls
                                /api/orders/:id/status (Clover REST)

[ TV ]    ─show─→ /tv  → fullscreen QR pointing at brand.publicUrl
```

## Stack

- Vite + React 18 + TypeScript + Tailwind
- Zustand for cart state (with `localStorage` persistence)
- React Router for routing
- `qrcode.react` for the TV QR
- Vercel serverless functions in `/api` (Node runtime) for Clover REST

## Local development

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local
# leave USE_MOCK_CLOVER=true to run without Clover credentials,
# or fill in the CLOVER_* vars to hit the real Clover API.

# 3. Run frontend + serverless functions side-by-side
#    Two terminals:
npx vercel dev    # serves /api on http://localhost:3000
npm run dev       # serves the React app on http://localhost:5173,
                  # proxies /api → http://localhost:3000

# 4. Open
#    http://localhost:5173        ← customer phone view
#    http://localhost:5173/tv     ← TV display
```

If you don't want to install the Vercel CLI yet, set `USE_MOCK_CLOVER=true`
and just run `npm run dev` — `/api/menu` will return the demo menu via
the proxy fallback in the build.

## Clover setup

1. **Create a developer account** at https://www.clover.com/developers and
   build a private/public app for your merchant.
2. **Choose your scopes** — at minimum:
   - `read:inventory`, `write:inventory`
   - `read:orders`, `write:orders`
   - `read:payments`, `write:payments`
   - `read:merchant`
3. **Install the app on your live merchant account.** This generates an
   OAuth token tied to your Wolfchase store.
4. **Create a Hosted Checkout app key** in the developer dashboard
   (Ecommerce API → API Tokens). Save the public + private keys.
5. **Configure a webhook** (optional, recommended):
   - Endpoint: `https://YOUR_DOMAIN/api/webhooks/clover`
   - Events: `ORDER`, `PAYMENT`
   - Save the signing secret.

Drop the credentials into `.env.local` (dev) and Vercel project env
vars (prod):

| Var                       | Where to find it                           |
| ------------------------- | ------------------------------------------ |
| `CLOVER_REGION`           | `us` for live, `sandbox` for testing       |
| `CLOVER_MERCHANT_ID`      | Clover Dashboard → Account & Setup         |
| `CLOVER_API_TOKEN`        | OAuth token from app install               |
| `CLOVER_ECOMM_PRIVATE_KEY`| Developer Dashboard → Ecommerce → Tokens   |
| `CLOVER_ECOMM_PUBLIC_KEY` | Developer Dashboard → Ecommerce → Tokens   |
| `CLOVER_WEBHOOK_SECRET`   | Developer Dashboard → Webhooks             |
| `VITE_PUBLIC_URL`         | Your prod URL, e.g. `https://order.yolorollo.com` |
| `USE_MOCK_CLOVER`         | `false` in prod (or omit entirely)         |

## Deploying to Vercel

```bash
npm i -g vercel
vercel link        # link the directory to a Vercel project
vercel env pull    # pulls vars into .env.local
vercel --prod
```

Add a custom domain (e.g. `order.yolorollo.com`) in the Vercel
dashboard. Set `VITE_PUBLIC_URL` to that domain so the TV QR points at
the right place. Redeploy.

## The TV display

1. Plug a Chromecast / Fire Stick / mini-PC / Raspberry Pi into the TV.
2. Open Chrome and navigate to `https://order.yolorollo.com/tv`.
3. Press `F11` (or `Cmd-Ctrl-F` on Mac, or use Chrome's "kiosk mode") to
   go fullscreen.
4. The QR points at `brand.publicUrl/?src=tv` — customers scanning land
   on the menu, the `?src=tv` lets you split out TV-driven orders later
   if you ever add analytics.

The TV display layout is in `src/pages/TVDisplay.tsx` — change the
copy, swap the lockup, or add a marquee there.

## Customizing

- **Brand colors / name / tagline** — `src/config/brand.ts` is the only
  place these live. Tailwind reads them in `tailwind.config.js`.
- **Logo** — drop a square PNG at `public/logo.png` and the header
  picks it up. Anything else: `public/favicon.png`, `public/og.png`.
- **Menu** — pulled from Clover Inventory. Update items, prices,
  modifier groups, and categories in the Clover Web Dashboard; the site
  picks up changes within ~60s (cache TTL).
- **Tax rate** — Memphis sales tax (~9.75%) is currently hardcoded in
  `api/orders/create.ts` for the pre-checkout estimate. Clover applies
  the merchant's configured tax during Hosted Checkout, so the final
  charge is correct regardless. Update the estimate if your tax setup
  changes.

## Project layout

```
api/
  _clover.ts            # server-only Clover REST + Hosted Checkout client
  _mockMenu.ts          # demo menu used when USE_MOCK_CLOVER=true
  menu.ts               # GET /api/menu
  orders/
    create.ts           # POST /api/orders/create
    [orderId]/status.ts # GET  /api/orders/:orderId/status
  webhooks/
    clover.ts           # POST /api/webhooks/clover (signed)
src/
  config/brand.ts       # ← single source of truth for branding
  components/
    Header.tsx
    ItemModal.tsx
  lib/
    api.ts              # client → /api/* wrapper
    cartStore.ts        # Zustand cart + persistence
  pages/
    Menu.tsx
    Cart.tsx
    Checkout.tsx
    Confirmation.tsx
    TVDisplay.tsx       # fullscreen QR for the TV
  types.ts              # shared types between client and api
  App.tsx
  main.tsx              # routes
  index.css
public/
  logo.png              # ← drop the Yolo Rollo logo here
  favicon.png
```

## Roadmap

Things intentionally left out of v1 — easy to add later:

- Live order queue on the TV (a second `/tv/queue` route reading the
  Clover orders list and showing "Now serving / Up next").
- Curbside / scheduled pickup time slots.
- Loyalty / repeat-customer discount via Clover's customer API.
- SMS pickup-ready alerts (wire it into `api/webhooks/clover.ts` once
  you've got a Twilio account).
