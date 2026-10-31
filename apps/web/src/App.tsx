
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FileText,
  LayoutDashboard,
  Menu,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney } from "@tally/shared";
import "./App.css";

// --------------------------------------------------
// API CONFIGURATION
// --------------------------------------------------

const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type DashboardMetrics = {
  mrr: number;
  activeSubscriptions: number;
  outstanding: number;
  collected: number;
};

type TrendItem = {
  month: string;
  value: number;
};

type AttentionItem = {
  label: string;
  tone: "warning" | "danger" | "info";
};

type DashboardData = {
  metrics: DashboardMetrics;
  trend: TrendItem[];
  attention: AttentionItem[];
};

type NavigationItem = {
  label: string;
  icon: LucideIcon;
};

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

const NAVIGATION: NavigationItem[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Customers", icon: Users },
  { label: "Subscriptions", icon: Receipt },
  { label: "Invoices", icon: FileText },
  { label: "Payments", icon: CreditCard },
  { label: "Reports", icon: BarChart3 },
  { label: "Integrity Lab", icon: ShieldCheck },
];

const METRIC_CONFIG: {
  key: keyof DashboardMetrics;
  label: string;
  description: string;
  icon: LucideIcon;
  format: "money" | "number";
}[] = [
  {
    key: "mrr",
    label: "Monthly recurring revenue",
    description: "Current monthly recurring revenue",
    icon: CircleDollarSign,
    format: "money",
  },
  {
    key: "activeSubscriptions",
    label: "Active subscriptions",
    description: "Currently active subscriptions",
    icon: Activity,
    format: "number",
  },
  {
    key: "outstanding",
    label: "Outstanding invoices",
    description: "Amount awaiting payment",
    icon: FileText,
    format: "money",
  },
  {
    key: "collected",
    label: "Collected this month",
    description: "Payments successfully recorded",
    icon: CreditCard,
    format: "money",
  },
];

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function getCurrentDate(): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function formatMetric(
  value: number,
  format: "money" | "number"
): string {
  if (format === "money") {
    return formatMoney(value);
  }

  return value.toLocaleString("en-IN");
}

function isValidDashboardData(
  value: unknown
): value is DashboardData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Record<string, unknown>;
  const metrics = data.metrics;

  if (!metrics || typeof metrics !== "object") {
    return false;
  }

  const metricValues = metrics as Record<string, unknown>;

  const requiredMetrics: (keyof DashboardMetrics)[] = [
    "mrr",
    "activeSubscriptions",
    "outstanding",
    "collected",
  ];

  const validMetrics = requiredMetrics.every((key) => {
    const metric = metricValues[key];

    return (
      typeof metric === "number" &&
      Number.isFinite(metric)
    );
  });

  const validTrend =
    Array.isArray(data.trend) &&
    data.trend.every(
      (item: unknown) =>
        !!item &&
        typeof item === "object" &&
        typeof (item as TrendItem).month === "string" &&
        typeof (item as TrendItem).value === "number" &&
        Number.isFinite((item as TrendItem).value)
    );

  const validAttention =
    Array.isArray(data.attention) &&
    data.attention.every(
      (item: unknown) =>
        !!item &&
        typeof item === "object" &&
        typeof (item as AttentionItem).label === "string" &&
        ["warning", "danger", "info"].includes(
          (item as AttentionItem).tone
        )
    );

  return validMetrics && validTrend && validAttention;
}

async function getDashboardData(
  signal: AbortSignal
): Promise<DashboardData> {
  const response = await fetch(`${API_URL}/api/dashboard`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Dashboard request failed. Server returned ${response.status}.`
    );
  }

  const result: unknown = await response.json();

  if (!isValidDashboardData(result)) {
    throw new Error(
      "The dashboard API returned data in an unexpected format."
    );
  }

  return result;
}

// --------------------------------------------------
// MAIN APP
// --------------------------------------------------

export default function App() {
  const [activePage, setActivePage] = useState("Overview");
  const [dashboard, setDashboard] = useState<DashboardData | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const result = await getDashboardData(controller.signal);

        if (!controller.signal.aborted) {
          setDashboard(result);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load dashboard."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => controller.abort();
  }, [refreshKey]);

  function navigate(page: string) {
    setActivePage(page);
    setMobileMenuOpen(false);
    setCreateMenuOpen(false);
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        mobileMenuOpen={mobileMenuOpen}
        onNavigate={navigate}
        onClose={() => setMobileMenuOpen(false)}
      />

      <main className="main-content">
        <Header
          title={activePage}
          onMenuClick={() => setMobileMenuOpen(true)}
          createMenuOpen={createMenuOpen}
          onCreateClick={() =>
            setCreateMenuOpen((current) => !current)
          }
          onCreateAction={navigate}
        />

        {activePage === "Overview" ? (
          <Dashboard
            data={dashboard}
            loading={loading}
            error={error}
            onRetry={() => setRefreshKey((key) => key + 1)}
          />
        ) : (
          <PlaceholderPage
            title={activePage}
            onBack={() => navigate("Overview")}
          />
        )}
      </main>
    </div>
  );
}

// --------------------------------------------------
// SIDEBAR
// --------------------------------------------------

type SidebarProps = {
  activePage: string;
  mobileMenuOpen: boolean;
  onNavigate: (page: string) => void;
  onClose: () => void;
};

function Sidebar({
  activePage,
  mobileMenuOpen,
  onNavigate,
  onClose,
}: SidebarProps) {
  return (
    <>
      {mobileMenuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}

      <aside
        className={`sidebar ${
          mobileMenuOpen ? "sidebar-open" : ""
        }`}
      >
        <div className="brand">
          <div className="brand-logo">T.</div>

          <div className="brand-text">
            <strong>Tally</strong>
            <span>by Brightloop</span>
          </div>

          <button
            className="sidebar-close"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X size={19} />
          </button>
        </div>

        <button className="workspace-switcher">
          <span className="workspace-indicator" />
          <span>Brightloop Software</span>
          <ChevronRight size={15} />
        </button>

        <nav className="navigation">
          <p className="navigation-heading">WORKSPACE</p>

          {NAVIGATION.map(({ label, icon: Icon }) => {
            const isActive = activePage === label;

            return (
              <button
                key={label}
                className={`navigation-item ${
                  isActive ? "navigation-active" : ""
                }`}
                onClick={() => onNavigate(label)}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button
            className={`navigation-item ${
              activePage === "Settings" ? "navigation-active" : ""
            }`}
            onClick={() => onNavigate("Settings")}
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>

          <div className="profile">
            <div className="profile-avatar">AM</div>

            <div className="profile-details">
              <strong>Arjun Menon</strong>
              <span>Administrator</span>
            </div>

            <ChevronRight size={15} />
          </div>
        </div>
      </aside>
    </>
  );
}

// --------------------------------------------------
// HEADER
// --------------------------------------------------

type HeaderProps = {
  title: string;
  onMenuClick: () => void;
  createMenuOpen: boolean;
  onCreateClick: () => void;
  onCreateAction: (page: string) => void;
};

function Header({
  title,
  onMenuClick,
  createMenuOpen,
  onCreateClick,
  onCreateAction,
}: HeaderProps) {
  return (
    <header className="topbar">
      <button
        className="mobile-menu-button"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu size={21} />
      </button>

      <div className="page-heading">
        <p>{getCurrentDate()}</p>
        <h1>{title}</h1>
      </div>

      <div className="topbar-actions">
        <button
          className="icon-button"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell size={18} />
        </button>

        <div className="create-wrapper">
          <button
            className="create-button"
            onClick={onCreateClick}
            aria-expanded={createMenuOpen}
          >
            <Plus size={17} />
            <span>Create</span>
          </button>

          {createMenuOpen && (
            <div className="create-menu">
              <p>Create new</p>

              {[
                ["Customer", "Customers"],
                ["Subscription", "Subscriptions"],
                ["Invoice", "Invoices"],
                ["Payment", "Payments"],
              ].map(([label, page]) => (
                <button
                  key={page}
                  onClick={() => onCreateAction(page)}
                >
                  <Plus size={14} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

type DashboardProps = {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

function Dashboard({
  data,
  loading,
  error,
  onRetry,
}: DashboardProps) {
  if (loading && !data) {
    return (
      <section className="content-area">
        <div className="state-card">
          <div className="loading-spinner" />
          <h2>Preparing your workspace</h2>
          <p>Loading your financial information...</p>
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="content-area">
        <div className="state-card">
          <div className="state-icon state-error">
            <Activity size={22} />
          </div>

          <h2>Unable to load your dashboard</h2>
          <p>{error}</p>

          <button className="create-button" onClick={onRetry}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section className="content-area">
      <div className="welcome-banner">
        <div>
          <span className="welcome-eyebrow">
            <Activity size={14} />
            YOUR BUSINESS AT A GLANCE
          </span>

          <h2>The books prove themselves.</h2>

          <p>
            Clear financial insights, grounded in every record.
          </p>
        </div>

        <button
          className="banner-button"
          onClick={() => {
            document
              .getElementById("revenue-section")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          View financial overview
          <ArrowUpRight size={16} />
        </button>
      </div>

      {error && (
        <div className="inline-error">
          Unable to refresh the dashboard. Displaying previously
          loaded information.
          <button onClick={onRetry}>Retry</button>
        </div>
      )}

      <div className="metrics-grid">
        {METRIC_CONFIG.map((metric) => (
          <MetricCard
            key={metric.key}
            label={metric.label}
            value={formatMetric(
              data.metrics[metric.key],
              metric.format
            )}
            description={metric.description}
            icon={metric.icon}
          />
        ))}
      </div>

      <div className="dashboard-grid">
        <RevenueChart data={data.trend} />

        <div className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-eyebrow">ACTION QUEUE</span>
              <h3>Needs your attention</h3>
            </div>
          </div>

          <AttentionQueue items={data.attention} />
        </div>
      </div>

      <div className="bottom-note">
        <div className="bottom-note-icon">
          <ShieldCheck size={19} />
        </div>

        <div>
          <strong>Financial clarity starts with reliable records.</strong>
          <p>
            Review invoices, payments and subscription activity to
            keep your books accurate.
          </p>
        </div>

        <ArrowUpRight size={17} />
      </div>
    </section>
  );
}

// --------------------------------------------------
// METRIC CARD
// --------------------------------------------------

type MetricCardProps = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
};

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-heading">
        <span>{label}</span>
        <Icon size={18} strokeWidth={1.7} />
      </div>

      <strong className="metric-value">{value}</strong>
      <span className="metric-description">{description}</span>
    </article>
  );
}

// --------------------------------------------------
// REVENUE CHART
// --------------------------------------------------

function RevenueChart({ data }: { data: TrendItem[] }) {
  return (
    <section className="panel revenue-panel" id="revenue-section">
      <div className="panel-heading">
        <div>
          <span className="panel-eyebrow">FINANCIAL OVERVIEW</span>
          <h3>Revenue trend</h3>
        </div>

        <span className="chart-period">Monthly</span>
      </div>

      {data.length > 0 ? (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{
                top: 12,
                right: 12,
                left: 0,
                bottom: 0,
              }}
            >
              <defs>
                <linearGradient
                  id="revenueFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="#D71920"
                    stopOpacity={0.17}
                  />
                  <stop
                    offset="100%"
                    stopColor="#D71920"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                vertical={false}
                stroke="#E8E9EB"
                strokeDasharray="3 3"
              />

              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: "#85888D",
                  fontSize: 11,
                }}
                tickMargin={12}
              />

              <YAxis hide />

              <Tooltip
                contentStyle={{
                  border: "1px solid #E8E9EB",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value) => [
                  formatMoney(Number(value ?? 0)),
                  "Revenue",
                ]}
              />

              <Area
                type="monotone"
                dataKey="value"
                stroke="#D71920"
                strokeWidth={2.2}
                fill="url(#revenueFill)"
                activeDot={{
                  r: 5,
                  strokeWidth: 0,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="chart-empty">
          <BarChart3 size={25} />
          <p>Revenue history will appear here when data is available.</p>
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------
// ATTENTION QUEUE
// --------------------------------------------------

function AttentionQueue({
  items,
}: {
  items: AttentionItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="attention-empty">
        <CheckCircle2 size={22} />
        <p>Nothing requires your attention right now.</p>
      </div>
    );
  }

  return (
    <div className="attention-list">
      {items.map((item, index) => (
        <div className="attention-item" key={`${item.label}-${index}`}>
          <div className={`attention-indicator ${item.tone}`}>
            <Bell size={15} />
          </div>

          <span>{item.label}</span>

          <ChevronRight size={15} />
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------
// PLACEHOLDER PAGE
// --------------------------------------------------

function PlaceholderPage({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <section className="content-area">
      <div className="state-card">
        <div className="state-icon">
          <LayoutDashboard size={22} />
        </div>

        <h2>{title}</h2>

        <p>
          This section is not implemented yet. Its functionality
          will be added as the application develops.
        </p>

        <button className="create-button" onClick={onBack}>
          Back to overview
        </button>
      </div>
    </section>
  );
}
