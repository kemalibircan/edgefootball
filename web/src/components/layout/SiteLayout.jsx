import React from "react";
import { Outlet } from "react-router-dom";
import StickyAiChatDock from "../chat/StickyAiChatDock";
import StickyCouponDock from "../coupon/StickyCouponDock";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import { CouponSlipProvider } from "../../state/coupon/CouponSlipContext";
import { AiChatProvider } from "../../state/chat/AiChatContext";

export default function SiteLayout() {
  return (
    <CouponSlipProvider>
      <AiChatProvider>
        <div className="site-shell">
          <div className="container">
            <SiteHeader />
          </div>
          <main className="route-stage">
            <Outlet />
          </main>
          <div className="container">
            <SiteFooter />
          </div>
        </div>
        <StickyCouponDock />
        <StickyAiChatDock />
      </AiChatProvider>
    </CouponSlipProvider>
  );
}
