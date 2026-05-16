import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import App from "./App";
import { Welcome } from "./pages/Welcome";
import { Menu } from "./pages/Menu";
import { Cart } from "./pages/Cart";
import { Checkout } from "./pages/Checkout";
import { Confirmation } from "./pages/Confirmation";
import { MockCheckout } from "./pages/MockCheckout";
import { TVDisplay } from "./pages/TVDisplay";
import { Location } from "./pages/Location";
import { KdsPage } from "./pages/Kds";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* /tv and /kds are intentionally OUTSIDE the App layout —
            /tv is fullscreen for the lobby TV, /kds is fullscreen for
            kitchen tablets with its own dark chrome and PIN gate. */}
        <Route path="/tv" element={<TVDisplay />} />
        <Route path="/kds" element={<KdsPage />} />

        <Route element={<App />}>
          <Route path="/" element={<Welcome />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          {/* Confirmation has two arrival shapes:
              - /confirmation/:orderId — inline payment path (we pre-
                created the order so we know its ID).
              - /confirmation?order_id=… — Clover Hosted Checkout's
                redirect target after payment. Clover appends the
                order_id query param. */}
          <Route path="/confirmation" element={<Confirmation />} />
          <Route path="/confirmation/:orderId" element={<Confirmation />} />
          <Route path="/location" element={<Location />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
