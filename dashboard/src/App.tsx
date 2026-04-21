import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { Telescope, BarChart3, GitBranch, Brain, FileText, AlertTriangle, Diff, Layers, Search, Zap } from "lucide-react";
import { Overview } from "./pages/Overview";
import { Timeline } from "./pages/Timeline";
import { TokenKarma } from "./pages/TokenKarma";
import { TrajectoryPage } from "./pages/Trajectory";
import { GhostContext } from "./pages/GhostContext";
import { SessionPassport } from "./pages/SessionPassport";
import { DriftDetector } from "./pages/DriftDetector";
import { VibeDiffPage } from "./pages/VibeDiff";
import { ModelCompare } from "./pages/ModelCompare";
import { SearchPage } from "./pages/Search";
import { Recommend } from "./pages/Recommend";
import { Quality } from "./pages/Quality";
import { Wrapped } from "./pages/Wrapped";
import { XRayPage } from "./pages/XRay";
import { useLiveUpdates } from "./hooks/useLive";

const NAV = [
  { to: "/", icon: Telescope, label: "Overview", hint: "Your AI activity summary" },
  { to: "/timeline", icon: Layers, label: "All Sessions", hint: "Browse every session" },
  { to: "/xray", icon: Zap, label: "X-Ray", hint: "See every AI action" },
  { to: "/karma", icon: BarChart3, label: "Spending", hint: "Where your money goes" },
  { to: "/compare", icon: Layers, label: "Models", hint: "Compare AI models" },
  { to: "/recommend", icon: AlertTriangle, label: "Savings", hint: "Tips to reduce cost" },
  { to: "/quality", icon: BarChart3, label: "Quality", hint: "Session grades A-F" },
  { to: "/wrapped", icon: Telescope, label: "Wrapped", hint: "Shareable stats card" },
  { to: "/drift", icon: AlertTriangle, label: "Drift", hint: "Pattern inconsistencies" },
  { to: "/search", icon: Search, label: "Search", hint: "Find past conversations" },
];

function Sidebar(): React.ReactElement {
  const location = useLocation();
  return (
    <aside className="w-56 border-r border-zinc-800 bg-zinc-950 flex flex-col h-screen fixed">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔭</span>
          <span className="font-bold text-white tracking-tight">Rasad</span>
          <span className="text-[10px] text-zinc-500 font-mono">v0.1.0</span>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">AI Observatory</p>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label, hint }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                isActive ? "text-blue-400 bg-blue-500/10 border-r-2 border-blue-400" : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              }`
            }
            title={hint}
          >
            <Icon size={16} />
            <div>
              <span>{label}</span>
              <span className="block text-[9px] text-zinc-600 -mt-0.5">{hint}</span>
            </div>
          </NavLink>
        ))}

        <div className="px-4 pt-4 pb-1">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Deep Dive</p>
          <p className="text-[9px] text-zinc-700 mt-0.5">Pick a session to analyze</p>
        </div>
        {[
          { to: "/trajectory", icon: GitBranch, label: "Trajectory", hint: "Step-by-step execution" },
          { to: "/context", icon: Brain, label: "Memory", hint: "What the AI forgot" },
          { to: "/passport", icon: FileText, label: "Summary", hint: "Session at a glance" },
          { to: "/vibe-diff", icon: Diff, label: "Review", hint: "What the AI changed" },
        ].map(({ to, icon: Icon, label, hint }) => (
          <NavLink
            key={to}
            to={to}
            className={() => {
              const isActive = location.pathname.startsWith(to);
              return `flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                isActive ? "text-blue-400 bg-blue-500/10 border-r-2 border-blue-400" : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              }`;
            }}
            title={hint}
          >
            <Icon size={16} />
            <div>
              <span>{label}</span>
              <span className="block text-[9px] text-zinc-600 -mt-0.5">{hint}</span>
            </div>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-zinc-800">
        <p className="text-[9px] text-zinc-700 text-center">Local-first. Your data never leaves.</p>
      </div>
    </aside>
  );
}

export function App(): React.ReactElement {
  useLiveUpdates();

  return (
    <BrowserRouter>
      <div className="flex">
        <Sidebar />
        <main className="ml-56 flex-1 min-h-screen">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/xray" element={<XRayPage />} />
            <Route path="/xray/:id" element={<XRayPage />} />
            <Route path="/karma" element={<TokenKarma />} />
            <Route path="/trajectory" element={<TrajectoryPage />} />
            <Route path="/trajectory/:id" element={<TrajectoryPage />} />
            <Route path="/context" element={<GhostContext />} />
            <Route path="/context/:id" element={<GhostContext />} />
            <Route path="/passport" element={<SessionPassport />} />
            <Route path="/passport/:id" element={<SessionPassport />} />
            <Route path="/drift" element={<DriftDetector />} />
            <Route path="/vibe-diff" element={<VibeDiffPage />} />
            <Route path="/vibe-diff/:id" element={<VibeDiffPage />} />
            <Route path="/compare" element={<ModelCompare />} />
            <Route path="/recommend" element={<Recommend />} />
            <Route path="/quality" element={<Quality />} />
            <Route path="/wrapped" element={<Wrapped />} />
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
