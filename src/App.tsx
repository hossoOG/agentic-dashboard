import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { DashboardMap } from "./components/DashboardMap";
import { Header } from "./components/Header";
import { parseLogLine, applyParsedEvents } from "./store/logParser";

function App() {
  // Guard against double-registration in React Strict Mode: the ref persists
  // across the mount → unmount → remount cycle that Strict Mode triggers in dev.
  const listenerActive = useRef(false);

  useEffect(() => {
    if (listenerActive.current) return;
    listenerActive.current = true;

    let unlisten: (() => void) | undefined;

    listen<{ line: string; stream: string }>("pipeline-log", (event) => {
      const parsed = parseLogLine(event.payload.line, undefined);
      applyParsedEvents(parsed);
    }).then((fn) => {
      unlisten = fn;
    }).catch((err) => {
      console.error("[pipeline-log] Failed to register Tauri event listener:", err);
    });

    return () => {
      unlisten?.();
      listenerActive.current = false;
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-dark-bg">
      <Header />
      <DashboardMap />
    </div>
  );
}

export default App;
