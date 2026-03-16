import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "./components/layout/AppShell";
import { parseLogLine, applyParsedEvents } from "./store/logParser";
import { logError } from "./utils/errorLogger";
import { installGlobalErrorHandlers } from "./utils/globalErrorHandler";

function App() {
  // Guard against double-registration in React Strict Mode: the ref persists
  // across the mount → unmount → remount cycle that Strict Mode triggers in dev.
  const listenerActive = useRef(false);

  useEffect(() => {
    if (listenerActive.current) return;
    listenerActive.current = true;

    // Install global error handlers once
    installGlobalErrorHandlers();

    let unlisten: (() => void) | undefined;

    listen<{ line: string; stream: string }>("pipeline-log", (event) => {
      try {
        const line = event?.payload?.line;
        if (typeof line !== "string") {
          logError("App", `pipeline-log event has invalid payload: ${JSON.stringify(event?.payload)}`);
          return;
        }
        const parsed = parseLogLine(line, undefined);
        applyParsedEvents(parsed);
      } catch (err) {
        logError("App", err);
      }
    }).then((fn) => {
      unlisten = fn;
    }).catch((err) => {
      logError("App", err);
    });

    return () => {
      unlisten?.();
      listenerActive.current = false;
    };
  }, []);

  return <AppShell />;
}

export default App;
