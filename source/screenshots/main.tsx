import { createRoot } from "react-dom/client";
import PriceTracker from "../app/price-tracker.tsx";
import "../app/globals.css";
import "./preview.css";

createRoot(document.getElementById("root")!).render(<>
  <div className="screenshot-banner">
    DEMO DATA · Fictional products, prices &amp; club location · No account connected
  </div>
  <PriceTracker />
</>);
