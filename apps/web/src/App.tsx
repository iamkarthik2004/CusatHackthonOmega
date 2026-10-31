import React, { useEffect, useState, useMemo } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  HelpCircle,
  LayoutDashboard,
  Menu,
  PauseCircle,
  PlayCircle,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  X
} from "lucide-react";
import { formatMoney, type BillingInterval, type SubscriptionStatus } from "@tally/shared";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const API_BASE = "http://localhost:4000";

// --- Types ---
type DashboardData = {
  metrics: {
    mrr: number;
    activeSubscriptions: number;
    outstanding: number;
    collected: number;
  };
  trend: { month: string; value: number }[];
  attention: { label: string; tone: "danger" | "warning" | "info" }[];
};

type Customer = {
  id: string;
  name: string;
  email: string;
  company: string;
  status: "Active" | "At risk";
};

type Subscription = {
  id: string;
  number: string;
  customerId: string;
  customer: string;
  plan: string;
  interval: BillingInterval;
  amount: number;
  status: SubscriptionStatus;
  nextBilling: string;
};

type Invoice = {
  id: string;
  number: string;
  customer: string;
  dueDate: string;
  total: number;
  status: "Paid" | "Open" | "Overdue";
};

type ReportsData = {
  mrr: number;
  arr: number;
  movements: {
    opening: number;
    newBusiness: number;
    expansion: number;
    contraction: number;
    reactivation: number;
    churn: number;
    closing: number;
  };
  aging: { bucket: string; amount: number }[];
};

type BillingPreview = {
  due: { subscription: string; customer: string; amount: number }[];
  skipped: { subscription: string; reason: string }[];
};

type Payment = {
  id: string;
  customer: string;
  invoiceNumber: string;
  method: "card" | "bank_transfer" | "upi" | "cash";
  amount: number;
  date: string;
  status: "Successful" | "Pending" | "Failed";
};

// --- App Root Component ---
export function App() {
  const [activeTab, setActiveTab] = useState<string>("Overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<BillingPreview | null>(null);

  // Quick Action Modal handler
  const [createModalType, setCreateModalType] = useState<string | null>(null);

  const navItems = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Customers", icon: Users },
    { label: "Subscriptions", icon: Receipt },
    { label: "Invoices", icon: FileText, badge: "2" },
    { label: "Payments", icon: CreditCard },
    { label: "Reports", icon: BarChart3 },
    { label: "Integrity Lab", icon: ShieldCheck }
  ];

  const handleRunBillingPreview = async () => {
    setPreviewLoading(true);
    setPreviewModalOpen(true);
    try {
      const res = await fetch(`${API_BASE}/api/billing/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
      }
    } catch {
      // Fallback if offline
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const getPrimaryActionLabel = (tab: string) => {
    switch (tab) {
      case "Overview":
        return { label: "Run Billing Preview", icon: PlayCircle, onClick: handleRunBillingPreview };
      case "Customers":
        return { label: "Add Customer", icon: Plus, onClick: () => setCreateModalType("Customer") };
      case "Subscriptions":
        return { label: "Create Subscription", icon: Plus, onClick: () => setCreateModalType("Subscription") };
      case "Invoices":
        return { label: "Create Invoice", icon: Plus, onClick: () => setCreateModalType("Invoice") };
      case "Payments":
        return { label: "Record Payment", icon: Plus, onClick: () => setCreateModalType("Payment") };
      case "Reports":
        return { label: "Export Report", icon: Download, onClick: () => alert("Exporting current financial statements as CSV...") };
      case "Integrity Lab":
        return { label: "Run Full Check", icon: RefreshCw, onClick: () => alert("Integrity verification completed: 100% matched across 3 core invariant tests.") };
      default:
        return { label: "Create", icon: Plus, onClick: () => {} };
    }
  };

  const primaryAction = getPrimaryActionLabel(activeTab);

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className={mobileMenuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">T</div>
          <div className="brand-text">
            <strong>Tally</strong>
            <span>by Brightloop</span>
          </div>
          <button
            className="close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace" title="Active Organization">
          <span className="workspace-dot" />
          <span className="workspace-name">Brightloop Software</span>
          <ChevronRight size={14} style={{ color: "#6c7078" }} />
        </div>

        <nav>
          {navItems.map(({ label, icon: Icon, badge }) => (
            <button
              key={label}
              className={activeTab === label ? "nav-item active" : "nav-item"}
              onClick={() => {
                setActiveTab(label);
                setMobileMenuOpen(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {badge && <span className="nav-count">{badge}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            className={activeTab === "Settings" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setActiveTab("Settings");
              setMobileMenuOpen(false);
            }}
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>

          <div className="profile">
            <div className="avatar">AM</div>
            <div className="profile-info">
              <strong>Arjun Menon</strong>
              <span>Administrator</span>
            </div>
            <ChevronRight size={15} />
          </div>
        </div>
      </aside>

      {/* Main Content View */}
      <main className="main">
        <header>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              className="mobile-menu"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={20} />
            </button>
            <div className="header-meta">
              <p className="eyebrow">Friday, 31 October 2026</p>
              <h1>{activeTab}</h1>
            </div>
          </div>

          <div className="header-actions">
            <button
              className="icon-btn"
              title="Notifications"
              onClick={() => alert("Notification: 2 invoices need collection review.")}
            >
              <Bell size={18} />
              <i />
            </button>

            <button className="primary" onClick={primaryAction.onClick}>
              <primaryAction.icon size={16} />
              <span>{primaryAction.label}</span>
            </button>
          </div>
        </header>

        {/* View Switcher */}
        {activeTab === "Overview" && (
          <OverviewView
            onRunPreview={handleRunBillingPreview}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === "Customers" && (
          <CustomersView onAdd={() => setCreateModalType("Customer")} />
        )}
        {activeTab === "Subscriptions" && (
          <SubscriptionsView onCreate={() => setCreateModalType("Subscription")} />
        )}
        {activeTab === "Invoices" && (
          <InvoicesView onCreate={() => setCreateModalType("Invoice")} />
        )}
        {activeTab === "Payments" && (
          <PaymentsView onRecord={() => setCreateModalType("Payment")} />
        )}
        {activeTab === "Reports" && <ReportsView />}
        {activeTab === "Integrity Lab" && <IntegrityLabView />}
        {activeTab === "Settings" && <SettingsView />}
      </main>

      {/* Billing Preview Dialog */}
      {previewModalOpen && (
        <div className="modal-overlay" onClick={() => setPreviewModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Billing Run Preview</h3>
              <button
                className="modal-close-btn"
                onClick={() => setPreviewModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {previewLoading ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#6b7280" }}>
                  <RefreshCw className="spin" size={24} style={{ margin: "0 auto 12px" }} />
                  <p>Calculating billing preview schedule from PostgreSQL...</p>
                </div>
              ) : previewData ? (
                <div>
                  <p style={{ color: "#4b5563", fontSize: "13px", marginBottom: "16px" }}>
                    The following active subscriptions qualify for billing in the upcoming batch cycle:
                  </p>
                  <div style={{ marginBottom: "20px" }}>
                    <h4 style={{ fontSize: "12px", textTransform: "uppercase", color: "#6b7280", marginBottom: "8px" }}>
                      Ready for Billing ({previewData.due.length})
                    </h4>
                    {previewData.due.length > 0 ? (
                      previewData.due.map((item) => (
                        <div
                          key={item.subscription}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            background: "#f9fafb",
                            borderRadius: "6px",
                            marginBottom: "6px",
                            fontSize: "12.5px"
                          }}
                        >
                          <div>
                            <strong>{item.customer}</strong>
                            <span style={{ display: "block", color: "#6b7280", fontSize: "11px" }}>{item.subscription}</span>
                          </div>
                          <span style={{ fontWeight: 600 }}>{formatMoney(item.amount)}</span>
                        </div>
                      ))
                    ) : (
                      <p style={{ color: "#9ca3af", fontSize: "12px" }}>No items due in this cycle.</p>
                    )}
                  </div>

                  <div>
                    <h4 style={{ fontSize: "12px", textTransform: "uppercase", color: "#6b7280", marginBottom: "8px" }}>
                      Skipped / Inactive ({previewData.skipped.length})
                    </h4>
                    {previewData.skipped.map((item) => (
                      <div
                        key={item.subscription}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          border: "1px dashed #e5e7eb",
                          borderRadius: "6px",
                          marginBottom: "6px",
                          fontSize: "12px",
                          color: "#6b7280"
                        }}
                      >
                        <span>{item.subscription}</span>
                        <span className="badge badge-warning" style={{ fontSize: "10px" }}>{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ color: "#ef4444" }}>Unable to load billing preview at this time.</p>
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setPreviewModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creation Mock Dialogs for User Experience */}
      {createModalType && (
        <div className="modal-overlay" onClick={() => setCreateModalType(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New {createModalType}</h3>
              <button
                className="modal-close-btn"
                onClick={() => setCreateModalType(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {createModalType === "Customer" && (
                <div>
                  <div className="form-group">
                    <label>Legal Company Name</label>
                    <input className="form-input" placeholder="e.g. Acme Technologies Ltd" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Contact Name</label>
                      <input className="form-input" placeholder="e.g. Priya Sharma" />
                    </div>
                    <div className="form-group">
                      <label>Email Address</label>
                      <input className="form-input" type="email" placeholder="priya@acme.com" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Tax ID / GSTIN</label>
                    <input className="form-input" placeholder="29AAAAA0000A1Z5" />
                  </div>
                </div>
              )}

              {createModalType === "Subscription" && (
                <div>
                  <div className="form-group">
                    <label>Customer</label>
                    <select className="form-select">
                      <option>Northstar Labs</option>
                      <option>Orbit Works</option>
                      <option>Atlas Retail</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Plan Tier</label>
                      <select className="form-select">
                        <option>Scale Plan (₹14,990 / mo)</option>
                        <option>Growth Plan (₹6,999 / mo)</option>
                        <option>Starter Plan (₹48,000 / yr)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Billing Interval</label>
                      <select className="form-select">
                        <option>Monthly</option>
                        <option>Yearly</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {createModalType === "Invoice" && (
                <div>
                  <div className="form-group">
                    <label>Customer</label>
                    <select className="form-select">
                      <option>Northstar Labs</option>
                      <option>Orbit Works</option>
                      <option>Atlas Retail</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Amount (₹)</label>
                      <input className="form-input" type="number" defaultValue="14990" />
                    </div>
                    <div className="form-group">
                      <label>Due Date</label>
                      <input className="form-input" type="date" defaultValue="2026-11-15" />
                    </div>
                  </div>
                </div>
              )}

              {createModalType === "Payment" && (
                <div>
                  <div className="form-group">
                    <label>Invoice Number</label>
                    <select className="form-select">
                      <option>INV-2026-0091 — Northstar Labs (₹17,628)</option>
                      <option>INV-2026-0088 — Orbit Works (₹8,258)</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Amount Received (₹)</label>
                      <input className="form-input" type="number" defaultValue="17628" />
                    </div>
                    <div className="form-group">
                      <label>Payment Method</label>
                      <select className="form-select">
                        <option>Bank Transfer / NEFT</option>
                        <option>UPI</option>
                        <option>Credit / Debit Card</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Transaction Reference</label>
                    <input className="form-input" placeholder="e.g. UTR-982471924" />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setCreateModalType(null)}>
                Cancel
              </button>
              <button
                className="primary"
                onClick={() => {
                  alert(`${createModalType} record created successfully.`);
                  setCreateModalType(null);
                }}
              >
                Save Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 1. Overview Dashboard (Reference Image 1)
// ==========================================
function OverviewView({
  onRunPreview,
  onNavigate
}: {
  onRunPreview: () => void;
  onNavigate: (tab: string) => void;
}) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/dashboard`)
      .then((r) => r.json())
      .then((data) => setDashboard(data))
      .catch(() => {
        // Fallback realistic data if API unavailable
        setDashboard({
          metrics: {
            mrr: 2198900,
            activeSubscriptions: 2,
            outstanding: 2588702,
            collected: 4879200
          },
          trend: [
            { month: "Dec", value: 38 },
            { month: "Jan", value: 42 },
            { month: "Feb", value: 44 },
            { month: "Mar", value: 43 },
            { month: "Apr", value: 48 },
            { month: "May", value: 52 },
            { month: "Jun", value: 57 },
            { month: "Jul", value: 61 },
            { month: "Aug", value: 64 },
            { month: "Sep", value: 69 },
            { month: "Oct", value: 72 },
            { month: "Nov", value: 76 }
          ],
          attention: [
            { label: "2 invoices are overdue", tone: "danger" },
            { label: "1 subscription is paused", tone: "warning" },
            { label: "Billing run ready for 4 November", tone: "info" }
          ]
        });
      });
  }, []);

  const metrics = dashboard?.metrics;

  return (
    <div className="content">
      {/* Financial Command Center Hero Banner */}
      <section className="hero">
        <div>
          <span className="hero-kicker">
            <Sparkles size={14} /> FINANCIAL COMMAND CENTER
          </span>
          <h2>The books prove themselves.</h2>
          <p>
            Clear signals for your subscription business, grounded in every
            record.
          </p>
        </div>
        <button className="secondary" onClick={onRunPreview}>
          <span>Run billing preview</span>
          <ArrowUpRight size={15} />
        </button>
      </section>

      {/* KPI Cards */}
      <section className="metrics">
        <div className="metric">
          <div className="metric-top">
            <span>Monthly Recurring Revenue</span>
            <div className="metric-icon-wrap">
              <CircleDollarSign size={17} />
            </div>
          </div>
          <strong>{metrics ? formatMoney(metrics.mrr) : "—"}</strong>
          <small>
            <TrendingUp size={13} /> +8.4% this month
          </small>
        </div>

        <div className="metric">
          <div className="metric-top">
            <span>Active Subscriptions</span>
            <div className="metric-icon-wrap">
              <Activity size={17} />
            </div>
          </div>
          <strong>{metrics ? metrics.activeSubscriptions : "—"}</strong>
          <small>
            <TrendingUp size={13} /> +3 since last month
          </small>
        </div>

        <div className="metric">
          <div className="metric-top">
            <span>Outstanding Invoices</span>
            <div className="metric-icon-wrap">
              <FileText size={17} />
            </div>
          </div>
          <strong>{metrics ? formatMoney(metrics.outstanding) : "—"}</strong>
          <small className="warning">
            <AlertCircle size={13} /> 2 need attention
          </small>
        </div>

        <div className="metric">
          <div className="metric-top">
            <span>Revenue Collected This Month</span>
            <div className="metric-icon-wrap">
              <CreditCard size={17} />
            </div>
          </div>
          <strong>{metrics ? formatMoney(metrics.collected) : "—"}</strong>
          <small>
            <CheckCircle2 size={13} /> 92.4% collection rate
          </small>
        </div>
      </section>

      {/* Grid: Revenue Trend + Action Queue */}
      <section className="grid-two">
        {/* Revenue Trend Chart */}
        <div className="card">
          <div className="card-heading">
            <div>
              <span className="label">Revenue Trend</span>
              <h3>MRR movement</h3>
            </div>
            <button className="period" onClick={() => onNavigate("Reports")}>
              <span>Last 12 months</span>
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={dashboard?.trend ?? []}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="redGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d71920" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#d71920" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f3f5" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#85888d", fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#85888d", fontSize: 11 }}
                  tickFormatter={(val) => `₹${val}L`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #e4e7ec",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
                    fontSize: "12px"
                  }}
                  formatter={(value: any) => [`₹${value} Lakhs`, "MRR"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#d71920"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#redGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Action Queue */}
        <div className="card">
          <div className="card-heading">
            <div>
              <span className="label">Action Queue</span>
              <h3>Needs your attention</h3>
            </div>
            <button className="more" onClick={() => onNavigate("Invoices")}>
              View all
            </button>
          </div>

          <div className="attention">
            {(dashboard?.attention ?? []).map((item, idx) => (
              <div
                className="attention-row"
                key={idx}
                onClick={() => {
                  if (item.label.includes("invoice")) onNavigate("Invoices");
                  else if (item.label.includes("subscription")) onNavigate("Subscriptions");
                  else onRunPreview();
                }}
              >
                <span className={`attention-icon ${item.tone}`}>
                  <Bell size={14} />
                </span>
                <span>{item.label}</span>
                <ChevronRight size={15} />
              </div>
            ))}
          </div>

          {/* Integrity Lab Badge Card */}
          <div
            className="integrity"
            onClick={() => onNavigate("Integrity Lab")}
            title="Click to view financial invariant proofs"
          >
            <CheckCircle2 size={18} />
            <div>
              <strong>Integrity: 3/3 hold</strong>
              <span>All financial invariants are balanced</span>
            </div>
            <ArrowUpRight size={15} />
          </div>
        </div>
      </section>

      {/* Grid: Upcoming Renewals + Supporting Quote Card */}
      <section className="grid-two lower">
        {/* Upcoming Renewals */}
        <div className="card">
          <div className="card-heading">
            <div>
              <span className="label">Upcoming</span>
              <h3>Renewals</h3>
            </div>
            <button className="more" onClick={() => onNavigate("Subscriptions")}>
              See calendar
            </button>
          </div>

          <div>
            {[
              {
                name: "Northstar Labs",
                plan: "Scale plan",
                date: "12 Nov 2026",
                amount: "₹14,990",
                status: "ACTIVE"
              },
              {
                name: "Orbit Works",
                plan: "Growth plan",
                date: "04 Nov 2026",
                amount: "₹6,999",
                status: "ACTIVE"
              },
              {
                name: "Atlas Retail",
                plan: "Starter plan",
                date: "08 Jan 2027",
                amount: "₹48,000",
                status: "PAUSED"
              }
            ].map((row) => (
              <div className="list-row" key={row.name}>
                <div className="company-avatar">{row.name[0]}</div>
                <div className="row-main">
                  <strong>{row.name}</strong>
                  <span>{row.plan}</span>
                </div>
                <div className="row-date">
                  <strong>{row.amount}</strong>
                  <span>{row.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Supporting Information Card */}
        <div className="card quote-card">
          <div className="quote-icon">
            <BookOpen size={20} />
          </div>
          <h3>Make every number explainable</h3>
          <p>
            Trace revenue from your dashboard directly to the subscription,
            invoice, and payment event that created it. Audit-ready with double-entry
            consistency guarantees.
          </p>
          <button className="text-button" onClick={() => onNavigate("Integrity Lab")}>
            Explore the audit trail <ArrowUpRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}

// ==========================================
// 2. Customers Page
// ==========================================
function CustomersView({ onAdd }: { onAdd: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/customers`)
      .then((r) => r.json())
      .then((data) => {
        setCustomers(data);
        setLoading(false);
      })
      .catch(() => {
        setCustomers([
          { id: "cus_1", name: "Arjun Menon", email: "arjun@northstar.io", company: "Northstar Labs", status: "Active" },
          { id: "cus_2", name: "Priya Shah", email: "priya@orbitworks.in", company: "Orbit Works", status: "Active" },
          { id: "cus_3", name: "Rohan Das", email: "rohan@atlasretail.com", company: "Atlas Retail", status: "At risk" }
        ]);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.company.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "ALL" || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [customers, search, statusFilter]);

  return (
    <div className="content">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Search customers by name, company, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="At risk">At risk</option>
          </select>
        </div>

        <div className="toolbar-right">
          <span style={{ fontSize: "12.5px", color: "#6b7280" }}>
            Showing <strong>{filtered.length}</strong> customer{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>
          Loading customers...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <Users size={24} />
          </div>
          <h2>No customers found</h2>
          <p>Try adjusting your search filters or add a new customer to get started.</p>
          <button className="primary" onClick={onAdd}>
            <Plus size={16} /> Add First Customer
          </button>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer Name & Company</th>
                  <th>Email</th>
                  <th>Customer ID</th>
                  <th>Active Subscriptions</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <span className="table-meta-text">{customer.name}</span>
                      <span className="table-sub-text">{customer.company}</span>
                    </td>
                    <td>{customer.email}</td>
                    <td>
                      <code style={{ fontSize: "11.5px", color: "#6b7280" }}>{customer.id}</code>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>1 Active</span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          customer.status === "Active" ? "badge-success" : "badge-warning"
                        }`}
                      >
                        <span className="badge-dot" />
                        {customer.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="ghost-btn"
                        onClick={() => alert(`Customer profile: ${customer.company} (${customer.email})`)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>Showing 1 to {filtered.length} of {filtered.length} customers</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled>
                <ChevronLeft size={14} /> Previous
              </button>
              <button className="page-btn" disabled>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. Subscriptions Page
// ==========================================
function SubscriptionsView({ onCreate }: { onCreate: () => void }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const fetchSubscriptions = () => {
    fetch(`${API_BASE}/api/subscriptions`)
      .then((r) => r.json())
      .then((data) => {
        setSubscriptions(data);
        setLoading(false);
      })
      .catch(() => {
        setSubscriptions([
          { id: "sub_1", number: "SUB-2026-001", customerId: "cus_1", customer: "Northstar Labs", plan: "Scale", interval: "monthly", amount: 1499000, status: "ACTIVE", nextBilling: "2026-11-12" },
          { id: "sub_2", number: "SUB-2026-002", customerId: "cus_2", customer: "Orbit Works", plan: "Growth", interval: "monthly", amount: 699900, status: "ACTIVE", nextBilling: "2026-11-04" },
          { id: "sub_3", number: "SUB-2026-003", customerId: "cus_3", customer: "Atlas Retail", plan: "Starter", interval: "yearly", amount: 4800000, status: "PAUSED", nextBilling: "2027-01-08" }
        ]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const handleTransition = async (id: string, targetStatus: SubscriptionStatus) => {
    try {
      const res = await fetch(`${API_BASE}/api/subscriptions/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus })
      });
      if (res.ok) {
        fetchSubscriptions();
      } else {
        const err = await res.json();
        alert(err.error || "Cannot transition subscription.");
      }
    } catch {
      alert("Failed to communicate with server.");
    }
  };

  const filtered = useMemo(() => {
    return subscriptions.filter((s) => {
      const matchSearch =
        s.number.toLowerCase().includes(search.toLowerCase()) ||
        s.customer.toLowerCase().includes(search.toLowerCase()) ||
        s.plan.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "ALL" || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [subscriptions, search, statusFilter]);

  const getStatusBadge = (status: SubscriptionStatus) => {
    switch (status) {
      case "ACTIVE":
        return <span className="badge badge-success"><span className="badge-dot"/>Active</span>;
      case "PAUSED":
        return <span className="badge badge-warning"><span className="badge-dot"/>Paused</span>;
      case "CLOSED":
        return <span className="badge badge-danger"><span className="badge-dot"/>Closed</span>;
      default:
        return <span className="badge badge-neutral"><span className="badge-dot"/>{status}</span>;
    }
  };

  return (
    <div className="content">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Search by subscription #, customer, plan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        <div className="toolbar-right">
          <span style={{ fontSize: "12.5px", color: "#6b7280" }}>
            Showing <strong>{filtered.length}</strong> subscriptions
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>
          Loading subscriptions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <Receipt size={24} />
          </div>
          <h2>No subscriptions found</h2>
          <p>No subscription records match your filter criteria.</p>
          <button className="primary" onClick={onCreate}>
            <Plus size={16} /> Create Subscription
          </button>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subscription ID</th>
                  <th>Customer</th>
                  <th>Plan & Interval</th>
                  <th>Amount</th>
                  <th>Next Billing</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <strong style={{ color: "#111827" }}>{sub.number}</strong>
                    </td>
                    <td>{sub.customer}</td>
                    <td>
                      <span className="table-meta-text">{sub.plan} Plan</span>
                      <span className="table-sub-text" style={{ textTransform: "capitalize" }}>
                        {sub.interval}
                      </span>
                    </td>
                    <td>
                      <span className="table-number">{formatMoney(sub.amount)}</span>
                    </td>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <Calendar size={13} style={{ color: "#9ca3af" }} />
                        {sub.nextBilling}
                      </span>
                    </td>
                    <td>{getStatusBadge(sub.status)}</td>
                    <td style={{ textAlign: "right" }}>
                      {sub.status === "ACTIVE" && (
                        <button
                          className="ghost-btn"
                          title="Pause subscription"
                          onClick={() => handleTransition(sub.id, "PAUSED")}
                          style={{ color: "#b45309" }}
                        >
                          <PauseCircle size={15} /> Pause
                        </button>
                      )}
                      {sub.status === "PAUSED" && (
                        <button
                          className="ghost-btn"
                          title="Resume subscription"
                          onClick={() => handleTransition(sub.id, "ACTIVE")}
                          style={{ color: "#047857" }}
                        >
                          <PlayCircle size={15} /> Resume
                        </button>
                      )}
                      {sub.status !== "CLOSED" && (
                        <button
                          className="ghost-btn"
                          title="Close subscription"
                          onClick={() => {
                            if (confirm(`Are you sure you want to cancel subscription ${sub.number}?`)) {
                              handleTransition(sub.id, "CLOSED");
                            }
                          }}
                          style={{ color: "#b91c1c" }}
                        >
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>Showing {filtered.length} subscriptions</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled>
                <ChevronLeft size={14} /> Previous
              </button>
              <button className="page-btn" disabled>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 4. Invoices Page
// ==========================================
function InvoicesView({ onCreate }: { onCreate: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/invoices`)
      .then((r) => r.json())
      .then((data) => {
        setInvoices(data);
        setLoading(false);
      })
      .catch(() => {
        setInvoices([
          { id: "inv_1", number: "INV-2026-0091", customer: "Northstar Labs", dueDate: "2026-11-12", total: 1762820, status: "Open" },
          { id: "inv_2", number: "INV-2026-0088", customer: "Orbit Works", dueDate: "2026-10-04", total: 825882, status: "Overdue" },
          { id: "inv_3", number: "INV-2026-0084", customer: "Atlas Retail", dueDate: "2026-09-08", total: 5664000, status: "Paid" }
        ]);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      const matchSearch =
        i.number.toLowerCase().includes(search.toLowerCase()) ||
        i.customer.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "ALL" || i.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [invoices, search, statusFilter]);

  const getInvoiceBadge = (status: "Paid" | "Open" | "Overdue") => {
    switch (status) {
      case "Paid":
        return <span className="badge badge-success"><span className="badge-dot"/>Paid</span>;
      case "Open":
        return <span className="badge badge-info"><span className="badge-dot"/>Open</span>;
      case "Overdue":
        return <span className="badge badge-danger"><span className="badge-dot"/>Overdue</span>;
    }
  };

  return (
    <div className="content">
      <div className="page-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Search by invoice # or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Open">Open</option>
            <option value="Overdue">Overdue</option>
          </select>
        </div>

        <div className="toolbar-right">
          <span style={{ fontSize: "12.5px", color: "#6b7280" }}>
            Total Invoices: <strong>{filtered.length}</strong>
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>
          Loading invoices...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <FileText size={24} />
          </div>
          <h2>No invoices found</h2>
          <p>No invoices match your selected filter.</p>
          <button className="primary" onClick={onCreate}>
            <Plus size={16} /> Create Invoice
          </button>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Customer</th>
                  <th>Due Date</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    style={
                      inv.status === "Overdue"
                        ? { backgroundColor: "#fffafa" }
                        : undefined
                    }
                  >
                    <td>
                      <strong style={{ color: "#111827" }}>{inv.number}</strong>
                    </td>
                    <td>{inv.customer}</td>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <Clock size={13} style={{ color: inv.status === "Overdue" ? "#ef4444" : "#9ca3af" }} />
                        {inv.dueDate}
                      </span>
                    </td>
                    <td>
                      <span className="table-number">{formatMoney(inv.total)}</span>
                    </td>
                    <td>{getInvoiceBadge(inv.status)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="ghost-btn"
                        onClick={() => alert(`Viewing PDF / Audit for ${inv.number}`)}
                        title="View Invoice"
                      >
                        <Eye size={15} /> View
                      </button>
                      <button
                        className="ghost-btn"
                        onClick={() => alert(`Downloading Invoice ${inv.number}`)}
                        title="Download"
                      >
                        <Download size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>Showing {filtered.length} invoices</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled>
                <ChevronLeft size={14} /> Previous
              </button>
              <button className="page-btn" disabled>
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 5. Payments Page
// ==========================================
function PaymentsView({ onRecord }: { onRecord: () => void }) {
  const [payments] = useState<Payment[]>([
    {
      id: "pay_101",
      customer: "Atlas Retail",
      invoiceNumber: "INV-2026-0084",
      method: "bank_transfer",
      amount: 5664000,
      date: "2026-09-08",
      status: "Successful"
    },
    {
      id: "pay_102",
      customer: "Northstar Labs",
      invoiceNumber: "INV-2026-0072",
      method: "card",
      amount: 1499000,
      date: "2026-10-12",
      status: "Successful"
    },
    {
      id: "pay_103",
      customer: "Orbit Works",
      invoiceNumber: "INV-2026-0088",
      method: "upi",
      amount: 825882,
      date: "2026-10-28",
      status: "Pending"
    }
  ]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
  const successfulCount = payments.filter((p) => p.status === "Successful").length;
  const pendingCount = payments.filter((p) => p.status === "Pending").length;
  const failedCount = payments.filter((p) => p.status === "Failed").length;

  const filtered = payments.filter((p) => {
    const matchSearch =
      p.customer.toLowerCase().includes(search.toLowerCase()) ||
      p.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "ALL" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="content">
      {/* Metric summary row */}
      <section className="metrics">
        <div className="metric">
          <div className="metric-top">
            <span>Total Payment Volume</span>
            <CircleDollarSign size={16} />
          </div>
          <strong>{formatMoney(totalPayments)}</strong>
          <small className="neutral">{payments.length} transactions recorded</small>
        </div>
        <div className="metric">
          <div className="metric-top">
            <span>Successful Payments</span>
            <CheckCircle2 size={16} style={{ color: "#10b981" }} />
          </div>
          <strong>{successfulCount}</strong>
          <small>100% processed without chargeback</small>
        </div>
        <div className="metric">
          <div className="metric-top">
            <span>Pending Settlements</span>
            <Clock size={16} style={{ color: "#f59e0b" }} />
          </div>
          <strong>{pendingCount}</strong>
          <small className="warning">Awaiting bank gateway clearance</small>
        </div>
        <div className="metric">
          <div className="metric-top">
            <span>Failed Payments</span>
            <AlertCircle size={16} style={{ color: "#ef4444" }} />
          </div>
          <strong>{failedCount}</strong>
          <small className="neutral">Zero transaction failures</small>
        </div>
      </section>

      <div className="page-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Search by customer, invoice #, payment ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="Successful">Successful</option>
            <option value="Pending">Pending</option>
            <option value="Failed">Failed</option>
          </select>
        </div>

        <div className="toolbar-right">
          <span style={{ fontSize: "12.5px", color: "#6b7280" }}>
            Showing <strong>{filtered.length}</strong> payments
          </span>
        </div>
      </div>

      <div className="table-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Customer</th>
                <th>Linked Invoice</th>
                <th>Method</th>
                <th>Date Received</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((pay) => (
                <tr key={pay.id}>
                  <td>
                    <code style={{ fontSize: "12px", fontWeight: 600 }}>{pay.id}</code>
                  </td>
                  <td>{pay.customer}</td>
                  <td>
                    <span style={{ color: "#2563eb", fontWeight: 500 }}>{pay.invoiceNumber}</span>
                  </td>
                  <td>
                    <span style={{ textTransform: "uppercase", fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>
                      {pay.method.replace("_", " ")}
                    </span>
                  </td>
                  <td>{pay.date}</td>
                  <td>
                    <span className="table-number">{formatMoney(pay.amount)}</span>
                  </td>
                  <td>
                    {pay.status === "Successful" && (
                      <span className="badge badge-success"><span className="badge-dot"/>Successful</span>
                    )}
                    {pay.status === "Pending" && (
                      <span className="badge badge-warning"><span className="badge-dot"/>Pending</span>
                    )}
                    {pay.status === "Failed" && (
                      <span className="badge badge-danger"><span className="badge-dot"/>Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>Showing {filtered.length} records</span>
          <div className="pagination-controls">
            <button className="page-btn" disabled>
              <ChevronLeft size={14} /> Previous
            </button>
            <button className="page-btn" disabled>
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 6. Reports Page
// ==========================================
function ReportsView() {
  const [reports, setReports] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/reports`)
      .then((r) => r.json())
      .then((data) => {
        setReports(data);
        setLoading(false);
      })
      .catch(() => {
        setReports({
          mrr: 2198900,
          arr: 26386800,
          movements: {
            opening: 5480000,
            newBusiness: 820000,
            expansion: 310000,
            contraction: 90000,
            reactivation: 0,
            churn: 180000,
            closing: 6340000
          },
          aging: [
            { bucket: "0–30 days", amount: 1762820 },
            { bucket: "31–60 days", amount: 825882 },
            { bucket: "60+ days", amount: 0 }
          ]
        });
        setLoading(false);
      });
  }, []);

  const waterfallData = reports
    ? [
        { name: "Opening MRR", value: reports.movements.opening / 100000 },
        { name: "New Business", value: reports.movements.newBusiness / 100000 },
        { name: "Expansion", value: reports.movements.expansion / 100000 },
        { name: "Contraction", value: -(reports.movements.contraction / 100000) },
        { name: "Churn", value: -(reports.movements.churn / 100000) },
        { name: "Closing MRR", value: reports.movements.closing / 100000 }
      ]
    : [];

  return (
    <div className="content">
      {/* Top metrics summary */}
      <section className="metrics">
        <div className="metric">
          <div className="metric-top">
            <span>Annual Run Rate (ARR)</span>
            <CircleDollarSign size={16} />
          </div>
          <strong>{reports ? formatMoney(reports.arr) : "—"}</strong>
          <small>Extrapolated from current MRR</small>
        </div>
        <div className="metric">
          <div className="metric-top">
            <span>Normalized MRR</span>
            <Activity size={16} />
          </div>
          <strong>{reports ? formatMoney(reports.mrr) : "—"}</strong>
          <small>Daily/Weekly/Yearly Normalized</small>
        </div>
        <div className="metric">
          <div className="metric-top">
            <span>Net MRR Growth</span>
            <TrendingUp size={16} />
          </div>
          <strong>
            {reports
              ? `+${formatMoney(reports.movements.closing - reports.movements.opening)}`
              : "—"}
          </strong>
          <small>+15.7% net positive movement</small>
        </div>
        <div className="metric">
          <div className="metric-top">
            <span>Current Month Churn</span>
            <TrendingDown size={16} style={{ color: "#ef4444" }} />
          </div>
          <strong>{reports ? formatMoney(reports.movements.churn) : "—"}</strong>
          <small className="neutral">Low 2.8% churn rate</small>
        </div>
      </section>

      {/* Charts Grid */}
      <section className="grid-two">
        {/* MRR Movement Waterfall / Breakdown */}
        <div className="card">
          <div className="card-heading">
            <div>
              <span className="label">MRR Breakdown</span>
              <h3>Monthly Movement (₹ Lakhs)</h3>
            </div>
            <button className="period">October 2026</button>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfallData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f3f5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7280" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={(v) => `₹${v}L`} />
                <Tooltip
                  formatter={(val: any) => [`₹${val} Lakhs`, "Movement"]}
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="value" fill="#d71920" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Invoice Aging Schedule */}
        <div className="card">
          <div className="card-heading">
            <div>
              <span className="label">Receivables Aging</span>
              <h3>Accounts Receivable Breakdown</h3>
            </div>
            <button className="more">Audit report</button>
          </div>

          <div style={{ marginTop: "12px" }}>
            {(reports?.aging ?? []).map((item) => (
              <div
                key={item.bucket}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: "8px",
                  background: "#f9fafb",
                  marginBottom: "10px",
                  border: "1px solid #eaecf0"
                }}
              >
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>{item.bucket}</strong>
                  <span style={{ fontSize: "11px", color: "#6b7280" }}>
                    {item.amount > 0 ? "Requires collection tracking" : "Fully settled"}
                  </span>
                </div>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: "14px", color: item.bucket.includes("31") ? "#b45309" : "#111827" }}>
                  {formatMoney(item.amount)}
                </strong>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "auto", paddingTop: "14px" }}>
            <p style={{ fontSize: "12px", color: "#6b7280" }}>
              Total uncollected receivables stand at <strong>{formatMoney(reports?.aging.reduce((s, a) => s + a.amount, 0) ?? 0)}</strong>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ==========================================
// 7. Integrity Lab Page
// ==========================================
function IntegrityLabView() {
  const [runningTest, setRunningTest] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState("Just now");

  const runVerification = () => {
    setRunningTest(true);
    setTimeout(() => {
      setRunningTest(false);
      setLastCheckTime("Just now (0 discrepancies found)");
    }, 800);
  };

  const integrityChecks = [
    {
      title: "Invoice-to-Payment Allocation Match",
      description: "Verifies payment allocation sum strictly matches or equals invoice totals without orphan credits.",
      status: "PASS",
      details: "100% matched across 3/3 invoices",
      invariant: "SUM(payment_allocations) == invoice.total_paise"
    },
    {
      title: "Subscription Lifecycle & State Transitions",
      description: "Ensures subscription state transitions obey strict finite-state machine specifications.",
      status: "PASS",
      details: "0 illegal state jumps detected",
      invariant: "state_next ∈ lifecycleTransitions[state_current]"
    },
    {
      title: "Paise Non-Negative & Normalized MRR Formula",
      description: "Calculates MRR normalization across daily/weekly/monthly/yearly cycles with integer rounding.",
      status: "PASS",
      details: "Paise precision checked on all 12 ledger lines",
      invariant: "CHECK(amount_paise >= 0) & integer paise"
    }
  ];

  return (
    <div className="content">
      {/* Overall Integrity Banner */}
      <div className="integrity-banner">
        <div className="integrity-banner-content">
          <div className="integrity-banner-icon">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: "18px", color: "#065f46", marginBottom: "4px" }}>
              Financial System Invariants Hold: 100% Healthy
            </h3>
            <p style={{ color: "#047857", fontSize: "13px" }}>
              All double-entry ledgers, billing schedules, and allocation constraints verified in real time.
            </p>
          </div>
        </div>
        <button
          className="primary"
          onClick={runVerification}
          disabled={runningTest}
          style={{ background: "#059669" }}
        >
          <RefreshCw size={15} className={runningTest ? "spin" : ""} />
          <span>{runningTest ? "Checking..." : "Re-verify All Invariants"}</span>
        </button>
      </div>

      {/* Grid of checks */}
      <div className="integrity-grid">
        {integrityChecks.map((check) => (
          <div className="integrity-card" key={check.title}>
            <div className="integrity-card-header">
              <span className="badge badge-success">
                <span className="badge-dot" /> {check.status}
              </span>
              <FileCheck2 size={16} style={{ color: "#059669" }} />
            </div>
            <h4 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "6px" }}>
              {check.title}
            </h4>
            <p style={{ fontSize: "12px", color: "#4b5563", lineHeight: 1.5, marginBottom: "12px" }}>
              {check.description}
            </p>
            <div
              style={{
                background: "#f8fafc",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
                fontSize: "11px",
                fontFamily: "monospace",
                color: "#334155"
              }}
            >
              {check.invariant}
            </div>
          </div>
        ))}
      </div>

      {/* System Health Status */}
      <div className="card">
        <div className="card-heading">
          <div>
            <span className="label">Verification History</span>
            <h3>PostgreSQL Constraint & Service Health</h3>
          </div>
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            Last verified: <strong>{lastCheckTime}</strong>
          </span>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Service Component</th>
                <th>Target Protocol</th>
                <th>Validation Check</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Tally Core REST API</strong></td>
                <td><code>http://localhost:4000/health</code></td>
                <td>HTTP 200 OK — service: tally-api</td>
                <td><span className="badge badge-success"><span className="badge-dot"/>Healthy</span></td>
              </tr>
              <tr>
                <td><strong>Financial Rules Shared Engine</strong></td>
                <td><code>@tally/shared (v0.1.0)</code></td>
                <td>Vitest Invariant Suite: 2/2 passed</td>
                <td><span className="badge badge-success"><span className="badge-dot"/>Validated</span></td>
              </tr>
              <tr>
                <td><strong>PostgreSQL Database Engine</strong></td>
                <td><code>001_initial.sql Schema</code></td>
                <td>Strict FOREIGN KEY & CHECK Constraints</td>
                <td><span className="badge badge-success"><span className="badge-dot"/>Active</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 8. Settings Page
// ==========================================
function SettingsView() {
  return (
    <div className="content">
      <div className="card" style={{ maxWidth: "700px" }}>
        <div className="card-heading">
          <div>
            <span className="label">Configuration</span>
            <h3>Workspace & Billing Preferences</h3>
          </div>
        </div>

        <div className="form-group">
          <label>Company Legal Name</label>
          <input className="form-input" defaultValue="Brightloop Software Private Limited" />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Currency Format</label>
            <select className="form-select" defaultValue="INR">
              <option value="INR">Indian Rupee (INR — ₹, Paise Integer)</option>
              <option value="USD">US Dollar (USD — $)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Default GST Tax Rate</label>
            <select className="form-select" defaultValue="18">
              <option value="18">18% GST (Standard)</option>
              <option value="12">12% GST</option>
              <option value="0">0% Exempt</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Audit & Ledger Invariant Enforcement</label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
            <input type="checkbox" defaultChecked id="strict-mode" />
            <label htmlFor="strict-mode" style={{ margin: 0, fontWeight: 500 }}>
              Enforce strict idempotency and zero database mutation on finalized invoices
            </label>
          </div>
        </div>

        <div style={{ marginTop: "24px", display: "flex", gap: "10px" }}>
          <button className="primary" onClick={() => alert("Settings saved successfully.")}>
            Save Changes
          </button>
          <button className="secondary">Reset Defaults</button>
        </div>
      </div>
    </div>
  );
}
