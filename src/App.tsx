import { useEffect } from "react";
import { DashboardMap } from "./components/DashboardMap";
import { Header } from "./components/Header";
import { usePipelineStore } from "./store/pipelineStore";

function App() {
  const { isRunning } = usePipelineStore();

  useEffect(() => {
    // Auto-start mock on load for demo
    if (!isRunning) {
      // Uncomment to auto-start: startMockPipeline();
    }
  }, [isRunning]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-dark-bg">
      <Header />
      <DashboardMap />
    </div>
  );
}

export default App;
