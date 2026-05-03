import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
import { IntegrationsPage } from "./pages/Integrations";
import { useLiveUpdates } from "./hooks/useLive";

const NAV_MAIN = [
  { to: "/", icon: Telescope, label: "Cockpit", hint: "Daily AI control surface" },
  { to: "/timeline", icon: Layers, label: "Sessions", hint: "Browse and triage sessions" },
  { to: "/agents", icon: Zap, label: "Agents", hint: "Coverage across coding agents" },
  { to: "/search", icon: Search, label: "Search", hint: "Pull up past conversations fast" },
];

const NAV_INSIGHTS = [
  { to: "/karma", icon: BarChart3, label: "Spending", hint: "See where money goes" },
  { to: "/compare", icon: Layers, label: "Models", hint: "Choose the right model" },
  { to: "/quality", icon: BarChart3, label: "Grades", hint: "See which sessions are efficient" },
  { to: "/recommend", icon: AlertTriangle, label: "Savings", hint: "Find waste and cut cost" },
  { to: "/wrapped", icon: Telescope, label: "Highlights", hint: "Shareable weekly view" },
  { to: "/drift", icon: AlertTriangle, label: "Patterns", hint: "Spot behavior drift" },
];

function NavItem({ to, icon: Icon, label, hint, end }: {
  to: string; icon: React.ComponentType<{ size: number }>; label: string; hint: string; end?: boolean;
}): React.ReactElement {
  const location = useLocation();
  const isActive = end ? location.pathname === to : location.pathname.startsWith(to);
  return (
    <NavLink
      to={to}
      end={end}
      className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
        isActive ? "text-blue-400 bg-blue-500/10 border-r-2 border-blue-400" : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
      }`}
      title={hint}
    >
      <Icon size={15} />
      <span>{label}</span>
    </NavLink>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="mt-4">
      <p className="px-4 pb-1 text-[10px] text-zinc-600 uppercase tracking-wider font-medium">{title}</p>
      {children}
    </div>
  );
}

function Sidebar(): React.ReactElement {
  return (
    <aside className="w-52 border-r border-zinc-800 bg-zinc-950 flex flex-col h-screen fixed">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white tracking-tight text-base">Rasad</span>
          <span className="text-[10px] text-zinc-600 font-mono">v1.0</span>
        </div>
        <p className="text-[10px] text-zinc-600 mt-0.5">See, understand, and steer your AI work</p>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_MAIN.map((item) => (
          <NavItem key={item.to} {...item} end={item.to === "/"} />
        ))}

        <SidebarSection title="Control">
          {NAV_INSIGHTS.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </SidebarSection>

        <SidebarSection title="Session Drilldown">
          {[
            { to: "/xray", icon: Zap, label: "X-Ray", hint: "Every action step by step" },
            { to: "/trajectory", icon: GitBranch, label: "Steps", hint: "Execution path" },
            { to: "/context", icon: Brain, label: "Memory", hint: "What the AI remembered" },
            { to: "/passport", icon: FileText, label: "Summary", hint: "Session at a glance" },
            { to: "/vibe-diff", icon: Diff, label: "Changes", hint: "What files changed" },
          ].map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </SidebarSection>
      </nav>
      <div className="p-3 border-t border-zinc-800">
        <p className="text-[9px] text-zinc-700 text-center">Your data stays on your machine</p>
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
        <main className="ml-52 flex-1 min-h-screen">
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/agents" element={<IntegrationsPage />} />
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
          </ErrorBoundary>
        </main>
      </div>
    </BrowserRouter>
  );
}
