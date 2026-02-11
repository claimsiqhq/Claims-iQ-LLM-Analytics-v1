import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { Router, Route, Switch } from "wouter";
import App from "./App";
import { SharePage } from "./pages/SharePage";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="claims-iq-theme">
    <Router>
      <Switch>
        <Route path="/share/:token" component={SharePage} />
        <Route component={App} />
      </Switch>
    </Router>
  </ThemeProvider>
);
