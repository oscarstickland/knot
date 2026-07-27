/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root";
import { BrowserRouter } from "react-router";
import { SWRConfig, type SWRConfiguration } from "swr";
import { fetcher } from "./lib/fetcher";
import { AuthProvider } from "./lib/auth";

const swrConfig: SWRConfiguration = {
  fetcher: fetcher
}

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <SWRConfig value={swrConfig}>
      <AuthProvider>
        <BrowserRouter>
          <Root />
        </BrowserRouter>
      </AuthProvider>
    </SWRConfig>
  </StrictMode>
);

// https://bun.com/docs/bundler/hot-reloading#import-meta-hot-data
(import.meta.hot.data.root ??= createRoot(elem)).render(app);
