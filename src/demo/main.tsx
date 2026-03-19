import { createRoot } from "react-dom/client";
import { App } from "./App";

const mount = document.getElementById("react-root");

if (!mount) {
  throw new Error("Missing #react-root mount element.");
}

createRoot(mount).render(<App />);
