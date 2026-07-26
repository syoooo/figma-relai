import "./index.css";
import ReactDOM from "react-dom/client";
import { PhilosophyPage } from "./components/PhilosophyPage";

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(<PhilosophyPage />);
}
