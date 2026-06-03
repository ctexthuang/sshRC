
  import { createRoot } from "react-dom/client";
  import App from "./app/App";
  import { LanguageProvider } from "./app/lib/i18n";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(
    <LanguageProvider>
      <App />
    </LanguageProvider>
  );
  
