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
import { TVDisplay } from "./pages/TVDisplay";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* /tv is intentionally OUTSIDE the App layout — it's fullscreen for the TV */}
        <Route path="/tv" element={<TVDisplay />} />

        <Route element={<App />}>
          <Route path="/" element={<Welcome />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/confirmation/:orderId" element={<Confirmation />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
