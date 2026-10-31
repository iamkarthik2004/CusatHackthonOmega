import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, BarChart3, Bell, BookOpen, CheckCircle2, ChevronRight, CircleDollarSign, CreditCard, FileText, LayoutDashboard, LockKeyhole, LogOut, Mail, Menu, Palette, Plus, Receipt, Send, Settings, ShieldCheck, Sparkles, UserRound, Users, X } from "lucide-react";
import { formatMoney } from "@tally/shared";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const api = "http://localhost:4000";
type Dashboard = { metrics: { mrr: number; activeSubscriptions: number; outstanding: number; collected: number }; trend: { month: string; value: number }[]; attention: { label: string; tone: string }[]; renewals?: { id: string; customer: string; plan: string; nextBilling: string; amount: number }[] };
type Quotation = { id: string; number: string; status: string; validUntil: string; customer: string; plan: string; totalPaise: number };
type User = { id: string; email: string; role: string };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [active, setActive] = useState("Overview");
  const [mobile, setMobile] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    fetch(`${api}/api/auth/me`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((session) => setUser(session))
      .catch(() => undefined)
      .finally(() => setCheckingSession(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    if (user.role !== "CUSTOMER") {
      fetch(`${api}/api/dashboard`).then((r) => r.json()).then(setDashboard).catch(() => undefined);
      fetch(`${api}/api/quotations`, { credentials: "include" }).then((r) => r.ok ? r.json() : []).then(setQuotations).catch(() => undefined);
    }
  }, [user, refreshKey]);
  if (checkingSession) return <div className="auth-loading"><div className="brand-mark">T</div><span>Opening your workspace…</span></div>;
  if (!user) return <AuthPage onAuthenticated={setUser} />;
  const isCustomer = user.role === "CUSTOMER";
  const nav = isCustomer
    ? [{ label: "Overview", icon: LayoutDashboard }, { label: "Plans", icon: CircleDollarSign }, { label: "Quotations", icon: Send }, { label: "My Subscriptions", icon: Receipt }, { label: "My Invoices", icon: FileText }, { label: "My Payments", icon: CreditCard }, { label: "Tax & GST", icon: CircleDollarSign }, { label: "GST Reports", icon: BarChart3 }, { label: "Account Integrity", icon: ShieldCheck }, { label: "Change Simulator", icon: Sparkles }]
    : [{ label: "Overview", icon: LayoutDashboard }, { label: "Customers", icon: Users }, { label: "Staff", icon: UserRound }, { label: "Products", icon: Sparkles }, { label: "Plans", icon: CircleDollarSign }, { label: "Quotations", icon: Send }, { label: "Subscriptions", icon: Receipt }, { label: "Invoices", icon: FileText }, { label: "Payments", icon: CreditCard }, { label: "Taxes & GST", icon: CircleDollarSign }, { label: "Discounts", icon: Sparkles }, { label: "Billing Center", icon: Activity }, { label: "Reconciliation", icon: ArrowUpRight }, { label: "Reports", icon: BarChart3 }, { label: "Integrity Lab", icon: ShieldCheck }, { label: "Simulator", icon: Sparkles }, { label: "Audit Logs", icon: ShieldCheck }, { label: "Customer Portal", icon: Users }];
  return <div className="app">
    <aside className={mobile ? "sidebar open" : "sidebar"}><div className="brand"><div className="brand-mark">T</div><div><strong>Tally</strong><span>{isCustomer ? "Customer portal" : "by Brightloop"}</span></div><button className="close" onClick={() => setMobile(false)}><X size={18}/></button></div><div className="workspace"><span className="workspace-dot"/> {isCustomer ? "Personal account" : "Brightloop Software"} <ChevronRight size={14}/></div><nav>{nav.map(({ label, icon: Icon }) => <button key={label} className={active === label ? "nav-item active" : "nav-item"} onClick={() => { setActive(label); setMobile(false); }}><Icon size={18}/>{label}{label === "Invoices" && <span className="nav-count">2</span>}</button>)}</nav><div className="sidebar-bottom"><button className={active === "Settings" ? "nav-item active" : "nav-item"} onClick={() => { setActive("Settings"); setMobile(false); }}><Settings size={18}/>Settings</button><button className="nav-item" onClick={async () => { await fetch(`${api}/api/auth/logout`, { method: "POST", credentials: "include" }); setUser(null); }}><LogOut size={18}/>Sign out</button><div className="profile"><div className="avatar">{user.email.slice(0, 2).toUpperCase()}</div><div><strong>{user.email}</strong><span>{isCustomer ? "Customer" : user.role}</span></div><ChevronRight size={15}/></div></div></aside>
    <main className="main"><header><button className="mobile-menu" onClick={() => setMobile(true)}><Menu/></button><div><p className="eyebrow">{isCustomer ? "Your account" : "Friday, 31 October 2026"}</p><h1>{active}</h1></div><div className="header-actions"><button className="icon-btn"><Bell size={18}/><i/></button>{!isCustomer && <button className="primary" onClick={() => setShowCreate(true)}><Plus size={16}/> Create</button>}</div></header>{active === "Overview" ? (isCustomer ? <CustomerOverview user={user}/> : <Overview dashboard={dashboard}/>) : active === "My Subscriptions" ? <CustomerSubscriptionsPage/> : active === "My Invoices" ? <CustomerInvoicesPage/> : active === "My Payments" ? <CustomerPaymentsPage/> : isCustomer && ["Plans", "Quotations", "Tax & GST", "GST Reports", "Account Integrity", "Change Simulator"].includes(active) ? <CustomerToolsPage title={active}/> : active === "Quotations" ? <Quotations key={refreshKey} quotations={quotations} onCreate={() => setShowCreate(true)}/> : active === "Settings" ? <SettingsPage user={user}/> : <ManagementPage key={refreshKey} title={active} onCreate={() => setShowCreate(true)} customerView={isCustomer}/>}</main>{showCreate && !isCustomer && <CreateDialog onClose={() => setShowCreate(false)} onNavigate={(destination) => { setActive(destination); setRefreshKey((current) => current + 1); setShowCreate(false); }}/>}</div>;
}

function AuthPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("demo.admin@brightloop.local");
  const [password, setPassword] = useState("TallyDemo!2026");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${api}/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to authenticate");
      onAuthenticated(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to authenticate");
    } finally {
      setLoading(false);
    }
  }
  return <div className="auth-page"><div className="auth-brand"><div className="brand-mark">T</div><div><strong>Tally</strong><span>by Brightloop Software</span></div></div><div className="auth-card"><div className="auth-heading"><span className="label">Financial operations</span><h1>{mode === "login" ? "Welcome back." : "Create your workspace."}</h1><p>{mode === "login" ? "Sign in to see what your books are telling you." : "Start managing subscriptions with confidence."}</p></div><div className="auth-tabs"><button className={mode === "login" ? "auth-tab active" : "auth-tab"} onClick={() => { setMode("login"); setError(""); }}>Sign in</button><button className={mode === "register" ? "auth-tab active" : "auth-tab"} onClick={() => { setMode("register"); setError(""); }}>Create account</button></div><form onSubmit={submit}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" minLength={9} required /></label>{mode === "register" && <small className="password-help">Use 9+ characters with uppercase, lowercase, and a special character.</small>}{error && <div className="auth-error">{error}</div>}<button className="primary auth-submit" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Sign in to Tally" : "Create account"} <ArrowUpRight size={15}/></button></form><div className="auth-note"><ShieldCheck size={16}/><span>Secure sessions. Your financial data stays private.</span></div></div><p className="auth-footer">© 2026 Brightloop Software · The books prove themselves.</p></div>;
}
function Quotations({ quotations, onCreate }: { quotations: Quotation[]; onCreate: () => void }) {
  return <div className="content"><section className="page-intro"><div><span className="label">Sales workflow</span><h2>Quotations</h2><p>Build clear offers, preserve every price snapshot, and turn acceptance into a confirmed subscription.</p></div><button className="primary" onClick={onCreate}><Plus size={16}/> New quotation</button></section><div className="card table-card"><div className="table-heading"><div><h3>Recent quotations</h3><span>{quotations.length} records</span></div><button className="secondary" onClick={() => onCreate()}>Manage templates <ChevronRight size={14}/></button></div>{quotations.length ? <div className="quotation-table">{quotations.map((quotation) => <div className="quotation-row" key={quotation.id}><div><strong>{quotation.number}</strong><span>{quotation.customer}</span></div><div><strong>{quotation.plan}</strong><span>Valid until {quotation.validUntil}</span></div><div className="quotation-total"><strong>{formatMoney(quotation.totalPaise)}</strong><span>Total</span></div><span className={`status-pill ${quotation.status.toLowerCase()}`}>{quotation.status}</span><ChevronRight size={16}/></div>)}</div> : <div className="table-empty"><Send size={20}/><strong>No quotations yet</strong><span>Create your first customer offer to start the quotation-to-subscription workflow.</span><button className="text-button" onClick={onCreate}>Create quotation <ArrowUpRight size={15}/></button></div>}</div></div>;
}

function Overview({ dashboard }: { dashboard: Dashboard | null }) {
  const metrics = dashboard?.metrics;
  return <div className="content"><section className="hero"><div><span className="hero-kicker"><Sparkles size={14}/> Financial command center</span><h2>The books prove themselves.</h2><p>Clear signals for your subscription business, grounded in every record.</p></div><button className="secondary">Run billing preview <ArrowUpRight size={15}/></button></section>
    <section className="metrics">{[
      ["Monthly recurring revenue", metrics ? formatMoney(metrics.mrr) : "—", "+8.4% this month", CircleDollarSign],
      ["Active subscriptions", metrics?.activeSubscriptions.toString() ?? "—", "+3 since last month", Activity],
      ["Outstanding invoices", metrics ? formatMoney(metrics.outstanding) : "—", "2 need attention", FileText],
      ["Collected this month", metrics ? formatMoney(metrics.collected) : "—", "92.4% collection rate", CreditCard]
    ].map(([label, value, note, Icon]) => <div className="metric" key={label as string}><div className="metric-top"><span>{label as string}</span><Icon size={17}/></div><strong>{value as string}</strong><small className={(note as string).includes("attention") ? "warning" : ""}>{note as string}</small></div>)}</section>
    <section className="grid-two"><div className="card chart-card"><div className="card-heading"><div><span className="label">Revenue trend</span><h3>MRR movement</h3></div><button className="period">Last 12 months <ChevronRight size={14}/></button></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={dashboard?.trend ?? []}><defs><linearGradient id="red" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#d71920" stopOpacity=".22"/><stop offset="100%" stopColor="#d71920" stopOpacity="0"/></linearGradient></defs><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#85888d", fontSize: 11 }}/><YAxis hide/><Tooltip contentStyle={{ border: "1px solid #e8e9eb", borderRadius: 8 }} formatter={(value) => [`₹${value}L`, "MRR"]}/><Area type="monotone" dataKey="value" stroke="#d71920" strokeWidth={2.5} fill="url(#red)" /></AreaChart></ResponsiveContainer></div></div><div className="card"><div className="card-heading"><div><span className="label">Action queue</span><h3>Needs your attention</h3></div><button className="more">View all</button></div><div className="attention">{(dashboard?.attention ?? []).map((item) => <div className="attention-row" key={item.label}><span className={`attention-icon ${item.tone}`}><Bell size={15}/></span><span>{item.label}</span><ChevronRight size={15}/></div>)}</div><div className="integrity"><CheckCircle2 size={17}/><div><strong>Integrity: 3/3 hold</strong><span>All financial invariants are balanced</span></div><ArrowUpRight size={15}/></div></div></section>
    <section className="grid-two lower"><div className="card"><div className="card-heading"><div><span className="label">Upcoming</span><h3>Renewals</h3></div><button className="more">See calendar</button></div>{(dashboard?.renewals ?? []).map((row) => <div className="list-row" key={row.id}><div className="company-avatar">{row.customer[0]}</div><div className="row-main"><strong>{row.customer}</strong><span>{row.plan}</span></div><div className="row-date"><strong>{formatMoney(Number(row.amount))}</strong><span>{row.nextBilling}</span></div></div>)}{!dashboard?.renewals?.length && <div className="table-empty"><span>No upcoming renewals found.</span></div>}</div><div className="card quote-card"><BookOpen size={22}/><h3>Make every number explainable</h3><p>Trace revenue from your dashboard to the subscription, invoice, and payment that created it.</p><button className="text-button">Explore the audit trail <ArrowUpRight size={15}/></button></div></section>
  </div>;
}
function CustomerOverview({ user }: { user: User }) {
  const [subscriptions, setSubscriptions] = useState<Record<string, unknown>[]>([]);
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    Promise.all([
      fetch(`${api}/api/portal/subscriptions`, { credentials: "include" }).then((response) => response.ok ? response.json() : []),
      fetch(`${api}/api/portal/payments`, { credentials: "include" }).then((response) => response.ok ? response.json() : []),
      fetch(`${api}/api/invoices`, { credentials: "include" }).then((response) => response.ok ? response.json() : [])
    ]).then(([subscriptionRows, paymentRows, invoiceRows]) => {
      setSubscriptions(Array.isArray(subscriptionRows) ? subscriptionRows : []);
      setPayments(Array.isArray(paymentRows) ? paymentRows : []);
      setInvoices(Array.isArray(invoiceRows) ? invoiceRows : []);
    }).catch(() => undefined);
  }, []);
  const activeSubscription = subscriptions[0];
  const monthlySpend = subscriptions.reduce((total, subscription) => total + Number(subscription.amountPaise ?? 0), 0);
  const outstanding = invoices.filter((invoice) => invoice.status !== "PAID" && invoice.status !== "CANCELLED").reduce((total, invoice) => total + Number(invoice.total ?? 0) - Number(invoice.paidPaise ?? 0), 0);
  return <div className="content customer-content"><section className="customer-welcome"><div className="customer-welcome-icon"><UserRound size={22}/></div><div><span className="label">Personal account</span><h2>Welcome back.</h2><p>Here is a clear view of your subscriptions and payments.</p></div></section><section className="customer-summary"><div className="customer-summary-card"><span className="label">Monthly services</span><strong>{formatMoney(monthlySpend)}</strong><small>{subscriptions.length} active subscriptions</small></div><div className="customer-summary-card"><span className="label">Next billing</span><strong>{activeSubscription?.nextBilling ? new Date(String(activeSubscription.nextBilling)).toLocaleDateString("en-IN") : "—"}</strong><small>{activeSubscription ? "Scheduled renewal" : "No upcoming billing"}</small></div><div className="customer-summary-card"><span className="label">Outstanding</span><strong>{formatMoney(outstanding)}</strong><small>{outstanding ? "Payment required" : "Everything is paid"}</small></div></section><section className="customer-services card"><div className="card-heading"><div><span className="label">Your services</span><h3>Active subscriptions</h3></div><span className="customer-service-count">{subscriptions.length} services</span></div>{subscriptions.map((subscription) => <div className="customer-service-row" key={String(subscription.id)}><div className="service-logo">{String(subscription.plan ?? "?").slice(0, 1)}</div><div className="row-main"><strong>{String(subscription.plan ?? "Subscription")}</strong><span>{String(subscription.interval ?? "monthly").toUpperCase()} billing</span></div><div className="row-date"><strong>{formatMoney(Number(subscription.amountPaise ?? 0))}</strong><span>Next: {subscription.nextBilling ? new Date(String(subscription.nextBilling)).toLocaleDateString("en-IN") : "—"}</span></div></div>)}</section><section className="customer-help card"><div className="customer-help-icon"><Mail size={20}/></div><div><h3>Need help with your account?</h3><p>Contact Brightloop support for billing questions or subscription changes.</p></div><a href="mailto:support@brightloop.local" className="secondary">Contact support</a></section><p className="customer-account-note">Signed in as {user.email}</p></div>;
}

type PortalSubscription = { id: string; number: string; status: string; plan: string; amountPaise: number; interval: string; nextBilling: string; expiresOn?: string };
type PortalInvoice = { id: string; number: string; customer: string; dueDate: string; total: number; status: string; paidPaise: number };
type PortalPayment = { id: string; amountPaise: number; method: string; reference?: string; receivedOn: string };

function CustomerSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<PortalSubscription[]>([]);
  const [selected, setSelected] = useState<PortalSubscription | null>(null);
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [requestAction, setRequestAction] = useState("UPGRADE");
  const [requestAmount, setRequestAmount] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  useEffect(() => {
    fetch(`${api}/api/portal/subscriptions`, { credentials: "include" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load subscriptions");
      setSubscriptions(payload);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load subscriptions"));
  }, []);
  async function openSubscription(subscription: PortalSubscription) {
    setSelected(subscription);
    setEvents([]);
    const response = await fetch(`${api}/api/subscriptions/${subscription.id}/events`, { credentials: "include" });
    if (response.ok) setEvents(await response.json());
  }
  async function submitChangeRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setRequestMessage("");
    const response = await fetch(`${api}/api/portal/subscriptions/${selected.id}/change-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: requestAction, newAmountPaise: Math.round(Number(requestAmount) * 100), effectiveOn: new Date().toISOString().slice(0, 10), daysRemaining: 15, daysInPeriod: 30 })
    });
    const payload = await response.json().catch(() => ({}));
    setRequestMessage(response.ok ? "Request sent to Brightloop for review." : (payload.error ?? "Unable to submit request."));
  }
  return <div className="content"><section className="page-intro"><div><span className="label">Customer portal</span><h2>My subscriptions</h2><p>Review your plans, renewal dates, and subscription history.</p></div></section>{error ? <div className="table-empty card"><strong>Unable to load subscriptions</strong><span>{error}</span></div> : <div className="portal-list card">{subscriptions.map((subscription) => <button className="portal-row" key={subscription.id} onClick={() => openSubscription(subscription)}><div className="service-logo">{subscription.plan.slice(0, 1)}</div><div className="row-main"><strong>{subscription.plan}</strong><span>{subscription.number} · {subscription.status}</span></div><div className="row-date"><strong>{formatMoney(Number(subscription.amountPaise))}</strong><span>Next: {new Date(subscription.nextBilling).toLocaleDateString("en-IN")}</span></div><ChevronRight size={16}/></button>)}{!subscriptions.length && <div className="table-empty"><strong>No subscriptions</strong><span>Your active plans will appear here.</span></div>}</div>}{selected && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div className="create-dialog"><div className="dialog-heading"><div><span className="label">Subscription timeline</span><h2>{selected.plan}</h2><p>{selected.number} · {selected.status}</p></div><button className="icon-btn" onClick={() => setSelected(null)}><X size={18}/></button></div><div className="subscription-detail"><div><span>Amount</span><strong>{formatMoney(Number(selected.amountPaise))} / {selected.interval}</strong></div><div><span>Next billing</span><strong>{new Date(selected.nextBilling).toLocaleDateString("en-IN")}</strong></div></div><div className="timeline">{events.length ? events.map((event) => <div className="timeline-item" key={String(event.id)}><span className="timeline-dot"/><div><strong>{String(event.eventType)}</strong><span>{new Date(String(event.occurredAt)).toLocaleString("en-IN")}</span></div></div>) : <div className="table-empty"><span>No lifecycle events recorded yet.</span></div>}</div><form className="change-request" onSubmit={submitChangeRequest}><span className="label">Request a plan change</span><div className="change-request-fields"><select value={requestAction} onChange={(event) => setRequestAction(event.target.value)}><option value="UPGRADE">Upgrade</option><option value="DOWNGRADE">Downgrade</option><option value="SEAT_CHANGE">Change quantity</option></select>  <input type="number" min="0" step="0.01" placeholder="New amount (₹)" value={requestAmount} onChange={(event) => setRequestAmount(event.target.value)} required/><button className="primary">Send request</button></div>{requestMessage && <small className="portal-note">{requestMessage}</small>}</form></div></div>}</div>;
}

type CustomerPlan = { id: string; name: string; description: string; amountPaise: number; interval: string; minimumQuantity: number };
type CustomerQuotation = Quotation & { subtotalPaise: number; taxPaise: number; discountPaise: number };
type GstReport = { totals: { taxablePaise: number; taxPaise: number; invoiceCount: number }; months: { month: string; taxablePaise: number; taxPaise: number; invoiceCount: number }[] };

function CustomerToolsPage({ title }: { title: string }) {
  const [plans, setPlans] = useState<CustomerPlan[]>([]);
  const [quotations, setQuotations] = useState<CustomerQuotation[]>([]);
  const [report, setReport] = useState<GstReport | null>(null);
  const [integrity, setIntegrity] = useState<{ status: string; checks: { name: string; passed: boolean; failures: number }[] } | null>(null);
  const [subscriptions, setSubscriptions] = useState<PortalSubscription[]>([]);
  const [selectedSubscription, setSelectedSubscription] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [simulator, setSimulator] = useState<Record<string, number> | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const load = async () => {
      if (title === "Plans") {
        const response = await fetch(`${api}/api/portal/plans`, { credentials: "include" });
        setPlans(response.ok ? await response.json() : []);
      } else if (title === "Quotations") {
        const response = await fetch(`${api}/api/quotations`, { credentials: "include" });
        setQuotations(response.ok ? await response.json() : []);
      } else if (title === "Tax & GST" || title === "GST Reports") {
        const response = await fetch(`${api}/api/portal/reports/gst`, { credentials: "include" });
        setReport(response.ok ? await response.json() : null);
      } else if (title === "Account Integrity") {
        const response = await fetch(`${api}/api/portal/integrity`, { credentials: "include" });
        setIntegrity(response.ok ? await response.json() : null);
      } else if (title === "Change Simulator") {
        const response = await fetch(`${api}/api/portal/subscriptions`, { credentials: "include" });
        const rows = response.ok ? await response.json() : [];
        setSubscriptions(rows);
        if (rows[0]) {
          setSelectedSubscription(rows[0].id);
          setNewAmount(String(Number(rows[0].amountPaise) / 100));
        }
      }
    };
    void load();
  }, [title]);
  async function createSubscription(planId: string) {
    setMessage("");
    const response = await fetch(`${api}/api/subscriptions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ planId, startsOn: new Date().toISOString().slice(0, 10) })
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Subscription request created and is awaiting confirmation." : (payload.error ?? "Unable to request this plan."));
  }
  async function acceptQuotation(id: string) {
    const response = await fetch(`${api}/api/portal/quotations/${id}/accept`, { method: "POST", credentials: "include" });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Quotation accepted. Your subscription is now confirmed." : (payload.error ?? "Unable to accept quotation."));
    if (response.ok) setQuotations((current) => current.map((quotation) => quotation.id === id ? { ...quotation, status: "CONFIRMED" } : quotation));
  }
  async function previewProration(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(`${api}/api/portal/simulator/proration`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ subscriptionId: selectedSubscription, newAmountPaise: Math.round(Number(newAmount) * 100), daysRemaining: 15, daysInPeriod: 30 })
    });
    const payload = await response.json().catch(() => ({}));
    setSimulator(response.ok ? payload : null);
    setMessage(response.ok ? "Preview calculated using the current subscription." : (payload.error ?? "Unable to calculate preview."));
  }
  const heading = title === "Plans" ? "Available plans" : title === "Quotations" ? "My quotations" : title === "Tax & GST" ? "Tax & GST" : title === "GST Reports" ? "My GST reports" : title === "Account Integrity" ? "Account integrity" : "Change simulator";
  return <div className="content"><section className="page-intro"><div><span className="label">Customer portal</span><h2>{heading}</h2><p>{title === "Plans" ? "Explore currently available plans. Starting a plan creates a request for review." : title === "Quotations" ? "Review offers prepared for your account and accept a valid quotation." : title === "Tax & GST" ? "See the tax collected on your own invoices without exposing workspace tax configuration." : title === "GST Reports" ? "Review your personal taxable value and GST totals by invoice month." : title === "Account Integrity" ? "Run safe checks over your own invoices, payments, and subscriptions." : "Preview a plan change before sending a request to Brightloop."}</p></div></section>{message && <div className="portal-note card">{message}</div>}{title === "Plans" && <div className="portal-list card">{plans.map((plan) => <div className="portal-row" key={plan.id}><div className="service-logo">{plan.name.slice(0, 1)}</div><div className="row-main"><strong>{plan.name}</strong><span>{plan.description || `${plan.interval} billing`} · Minimum {plan.minimumQuantity}</span></div><div className="row-date"><strong>{formatMoney(Number(plan.amountPaise))}</strong><span>{plan.interval}</span></div><button className="secondary small-button" onClick={() => void createSubscription(plan.id)}>Request</button></div>)}{!plans.length && <div className="table-empty"><strong>No plans available</strong></div>}</div>}{title === "Quotations" && <div className="portal-list card">{quotations.map((quotation) => <div className="portal-row" key={quotation.id}><div className="invoice-icon"><FileText size={16}/></div><div className="row-main"><strong>{quotation.number}</strong><span>{quotation.plan} · Valid until {new Date(quotation.validUntil).toLocaleDateString("en-IN")}</span></div><div className="row-date"><strong>{formatMoney(Number(quotation.totalPaise))}</strong><span>{quotation.status}</span></div>{quotation.status === "QUOTATION" && <button className="secondary small-button" onClick={() => void acceptQuotation(quotation.id)}>Accept</button>}</div>)}{!quotations.length && <div className="table-empty"><strong>No quotations</strong></div>}</div>}{(title === "Tax & GST" || title === "GST Reports") && report && <div className="customer-summary"><div className="customer-summary-card"><span className="label">Taxable value</span><strong>{formatMoney(report.totals.taxablePaise)}</strong><small>{report.totals.invoiceCount} invoices</small></div><div className="customer-summary-card"><span className="label">GST total</span><strong>{formatMoney(report.totals.taxPaise)}</strong><small>Tax recorded on your invoices</small></div><div className="customer-summary-card"><span className="label">After tax</span><strong>{formatMoney(report.totals.taxablePaise + report.totals.taxPaise)}</strong><small>Personal invoice total</small></div></div>}{(title === "Tax & GST" || title === "GST Reports") && report && <div className="portal-list card">{report.months.map((month) => <div className="portal-row" key={month.month}><div className="row-main"><strong>{month.month}</strong><span>{month.invoiceCount} invoices</span></div><div className="row-date"><strong>{formatMoney(month.taxPaise)}</strong><span>GST · Taxable {formatMoney(month.taxablePaise)}</span></div></div>)}</div>}{title === "Account Integrity" && integrity && <div className="card"><div className="integrity"><CheckCircle2 size={17}/><div><strong>{integrity.status === "PASS" ? "All personal checks passed" : "Review recommended"}</strong><span>Only your account records were checked.</span></div></div><div className="portal-list">{integrity.checks.map((check) => <div className="portal-row" key={check.name}><div className="row-main"><strong>{check.name.replace(/_/g, " ")}</strong><span>{check.failures ? `${check.failures} issue(s)` : "No issues found"}</span></div><span className={`status-pill ${check.passed ? "confirmed" : "quotation"}`}>{check.passed ? "Passed" : "Review"}</span></div>)}</div></div>}{title === "Change Simulator" && <div className="card"><form className="change-request" onSubmit={previewProration}><div className="change-request-fields"><select value={selectedSubscription} onChange={(event) => setSelectedSubscription(event.target.value)}>{subscriptions.map((subscription) => <option key={subscription.id} value={subscription.id}>{subscription.plan} · {formatMoney(Number(subscription.amountPaise))}</option>)}</select>  <input type="number" min="0" step="0.01" value={newAmount} onChange={(event) => setNewAmount(event.target.value)} placeholder="New amount (₹)" required/><button className="primary">Preview</button></div></form>{simulator && <div className="subscription-detail"><div><span>Current amount</span><strong>{formatMoney(Number(simulator.oldAmountPaise))}</strong></div><div><span>Prorated change</span><strong>{formatMoney(Number(simulator.prorationPaise))}</strong></div></div>}</div>}</div>;
}

function CustomerInvoicesPage() {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${api}/api/invoices`, { credentials: "include" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load invoices");
      setInvoices(payload);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load invoices"));
  }, []);
  return <div className="content"><section className="page-intro"><div><span className="label">Customer portal</span><h2>My invoices</h2><p>View invoice status, balances, due dates, and download invoice PDFs.</p></div></section>{error ? <div className="table-empty card"><strong>Unable to load invoices</strong><span>{error}</span></div> : <div className="portal-list card">{invoices.map((invoice) => <div className="portal-row" key={invoice.id}><div className="invoice-icon"><FileText size={17}/></div><div className="row-main"><strong>{invoice.number}</strong><span>Due {new Date(invoice.dueDate).toLocaleDateString("en-IN")} · {invoice.status}</span></div><div className="row-date"><strong>{formatMoney(Number(invoice.total))}</strong><span>Paid {formatMoney(Number(invoice.paidPaise))}</span></div><a className="secondary small-button" href={`${api}/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">PDF</a></div>)}{!invoices.length && <div className="table-empty"><strong>No invoices</strong><span>Your invoices will appear here.</span></div>}</div>}</div>;
}

function CustomerPaymentsPage() {
  const [payments, setPayments] = useState<PortalPayment[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${api}/api/portal/payments`, { credentials: "include" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load payments");
      setPayments(payload);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load payments"));
  }, []);
  return <div className="content"><section className="page-intro"><div><span className="label">Customer portal</span><h2>My payments</h2><p>Review your completed payments and references.</p></div></section>{error ? <div className="table-empty card"><strong>Unable to load payments</strong><span>{error}</span></div> : <div className="portal-list card">{payments.map((payment) => <div className="portal-row" key={payment.id}><div className="payment-icon"><CreditCard size={17}/></div><div className="row-main"><strong>{payment.method.replace("_", " ")}</strong><span>{payment.reference ?? "Payment"} · {new Date(payment.receivedOn).toLocaleDateString("en-IN")}</span></div><div className="row-date"><strong>{formatMoney(Number(payment.amountPaise))}</strong><span>Completed</span></div></div>)}{!payments.length && <div className="table-empty"><strong>No payments</strong><span>Your payment history will appear here.</span></div>}</div>}</div>;
}

function ManagementPage({ title, onCreate, customerView = false }: { title: string; onCreate: () => void; customerView?: boolean }) {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const endpoint = title === "Taxes & GST" ? "/api/taxes" : title === "Discounts" ? "/api/discounts" : title === "Reports" ? "/api/reports/waterfall" : title === "Integrity Lab" ? "/api/integrity/runs" : title === "Audit Logs" ? "/api/audit-log" : title === "Invoices" || title === "My Invoices" ? "/api/invoices" : title === "Customers" ? "/api/customers?limit=50" : title === "Staff" ? "/api/staff" : title === "Products" ? "/api/catalog/products" : title === "Plans" ? "/api/catalog/plans" : title === "Subscriptions" ? (customerView ? "/api/portal/subscriptions" : "/api/subscriptions") : title === "My Subscriptions" ? "/api/portal/subscriptions" : title === "My Payments" ? "/api/portal/payments" : title === "Payments" ? "" : title === "Billing Center" ? "/api/email-outbox" : title === "Customer Portal" ? "/api/portal/subscriptions" : "";
  useEffect(() => {
    if (!endpoint) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRecords([]);
    fetch(`${api}${endpoint}`, { credentials: "include", signal: controller.signal }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof payload.error === "string" ? payload.error : `Request failed with HTTP ${response.status}`;
        throw new Error(detail);
      }
      setRecords(Array.isArray(payload) ? payload : [payload]);
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Unable to load records");
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [endpoint]);
  return <div className="content"><section className="page-intro"><div><span className="label">Financial operations</span><h2>{title}</h2><p>Trace every action to persisted records and preserve financial correctness.</p></div><button className="primary" onClick={onCreate}><Plus size={16}/> Create</button></section><div className="card table-card">{loading ? <div className="table-empty"><Sparkles size={20}/><strong>Loading workspace</strong><span>Reading the latest records from PostgreSQL.</span></div> : error ? <div className="table-empty"><Sparkles size={20}/><strong>Unable to load workspace</strong><span>{error}</span></div> : records.length ? <div className="data-list">{records.slice(0, 50).map((record, index) => { const primary = String(record.name ?? record.email ?? record.number ?? record.action ?? record.scenario ?? record.eventType ?? `Record ${index + 1}`); const secondary = String(record.role ?? record.status ?? record.actor ?? record.explanation ?? record.customer ?? record.plan ?? "Financial record"); return <div className="data-row" key={String(record.id ?? index)}><div><strong>{primary}</strong><span>{secondary}</span></div><strong>{record.totalPaise !== undefined ? formatMoney(Number(record.totalPaise)) : record.amountPaise !== undefined ? formatMoney(Number(record.amountPaise)) : ""}</strong><ChevronRight size={16}/></div>; })}</div> : <div className="table-empty"><Sparkles size={20}/><strong>No records yet</strong><span>This workspace is connected, but it has no records yet.</span></div>}</div></div>;
}

function SettingsPage({ user }: { user: User }) {
  const [section, setSection] = useState("Profile");
  const [emailUpdates, setEmailUpdates] = useState(true);
  const customer = user.role === "CUSTOMER";
  return <div className="content settings-content"><section className="settings-hero"><div><span className="label">{customer ? "Account preferences" : "Workspace administration"}</span><h2>Settings</h2><p>{customer ? "Manage your account preferences and notification choices." : "Keep your workspace identity, security, and preferences organized."}</p></div><div className="settings-hero-mark"><Settings size={24}/></div></section><div className="settings-layout"><nav className="settings-nav">{["Profile", "Security", "Notifications", ...(customer ? [] : ["Workspace"])].map((item) => <button key={item} className={section === item ? "settings-nav-item active" : "settings-nav-item"} onClick={() => setSection(item)}>{item === "Profile" ? <UserRound size={16}/> : item === "Security" ? <LockKeyhole size={16}/> : item === "Notifications" ? <Bell size={16}/> : <Palette size={16}/>}<span>{item}</span><ChevronRight size={14}/></button>)}</nav><div className="settings-panel">{section === "Profile" && <><div className="settings-panel-heading"><div className="large-avatar">{user.email.slice(0, 2).toUpperCase()}</div><div><span className="label">Your profile</span><h3>{user.email}</h3><p>{customer ? "Customer account" : `${user.role} workspace member`}</p></div></div><div className="settings-fields"><label>Email address<input value={user.email} readOnly /></label><label>Account type<input value={customer ? "Customer" : user.role} readOnly /></label></div><div className="settings-info"><CheckCircle2 size={17}/><span>Your account is active and securely signed in.</span></div></>}{section === "Security" && <><div className="settings-panel-heading"><div className="settings-section-icon"><LockKeyhole size={20}/></div><div><span className="label">Account security</span><h3>Your sign-in is protected</h3><p>Passwords are securely hashed and sessions use HTTP-only cookies.</p></div></div><div className="settings-row"><div><strong>Current session</strong><span>Active on this browser</span></div><span className="status-pill paid">Secure</span></div></>}{section === "Notifications" && <><div className="settings-panel-heading"><div className="settings-section-icon"><Bell size={20}/></div><div><span className="label">Notifications</span><h3>Choose what reaches you</h3><p>Keep important account updates close without unnecessary noise.</p></div></div><div className="settings-row"><div><strong>Account and billing updates</strong><span>Receive important updates about your account.</span></div><button className={emailUpdates ? "toggle on" : "toggle"} onClick={() => setEmailUpdates((current) => !current)}><span/></button></div></>}{section === "Workspace" && <><div className="settings-panel-heading"><div className="settings-section-icon"><Palette size={20}/></div><div><span className="label">Workspace identity</span><h3>Brightloop Software</h3><p>Organization-level settings are managed by workspace administrators.</p></div></div><div className="settings-fields"><label>Workspace name<input value="Brightloop Software" readOnly /></label><label>Application environment<input value="Local development" readOnly /></label></div></>}</div></div></div>;
}

type CreateTarget = "Quotation" | "Subscription" | "Product" | "Plan" | "Payment" | "Tax" | "Discount" | "Staff";
type CreateDialogProps = { onClose: () => void; onNavigate: (destination: string) => void };
const createOptions: { label: CreateTarget; description: string; icon: typeof Send }[] = [
  { label: "Quotation", description: "Create a customer offer", icon: Send },
  { label: "Subscription", description: "Start a new subscription", icon: Receipt },
  { label: "Product", description: "Add a catalog product", icon: Sparkles },
  { label: "Plan", description: "Configure a billing plan", icon: CircleDollarSign },
  { label: "Payment", description: "Record a payment", icon: CreditCard },
  { label: "Tax", description: "Add a GST rule", icon: CircleDollarSign },
  { label: "Discount", description: "Add a discount rule", icon: Sparkles },
  { label: "Staff", description: "Invite an operational user", icon: UserRound }
];

function CreateDialog({ onClose, onNavigate }: CreateDialogProps) {
  const [target, setTarget] = useState<CreateTarget | null>(null);
  const [values, setValues] = useState<Record<string, string>>({ effectiveFrom: new Date().toISOString().slice(0, 10), startsOn: new Date().toISOString().slice(0, 10), receivedOn: new Date().toISOString().slice(0, 10), validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) });
  const [customers, setCustomers] = useState<Record<string, string>[]>([]);
  const [plans, setPlans] = useState<Record<string, string>[]>([]);
  const [products, setProducts] = useState<Record<string, string>[]>([]);
  const [invoices, setInvoices] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!target) return;
    const load = async () => {
      try {
        const endpoints = await Promise.all([
          fetch(`${api}/api/customers`, { credentials: "include" }),
          fetch(`${api}/api/catalog/plans`, { credentials: "include" }),
          fetch(`${api}/api/catalog/products`, { credentials: "include" }),
          fetch(`${api}/api/invoices`, { credentials: "include" })
        ]);
        const payloads = await Promise.all(endpoints.map(async (response) => response.ok ? response.json() : []));
        setCustomers(Array.isArray(payloads[0]) ? payloads[0] : []);
        setPlans(Array.isArray(payloads[1]) ? payloads[1] : []);
        setProducts(Array.isArray(payloads[2]) ? payloads[2] : []);
        setInvoices(Array.isArray(payloads[3]) ? payloads[3] : []);
      } catch {
        setError("Unable to load available customers, plans, products, or invoices.");
      }
    };
    void load();
  }, [target]);
  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const field = (key: string, label: string, type = "text", required = true) => <label className="form-field">{label}<input type={type} value={values[key] ?? ""} onChange={(event) => setValue(key, event.target.value)} required={required} /></label>;
  const selectField = (key: string, label: string, options: Record<string, string>[], valueKey: string, labelKey: string) => <label className="form-field">{label}<select value={values[key] ?? ""} onChange={(event) => setValue(key, event.target.value)} required><option value="">Select {label.toLowerCase()}</option>{options.map((option) => <option key={option[valueKey]} value={option[valueKey]}>{option[labelKey] ?? option.name ?? option.number ?? option.id}</option>)}</select></label>;
  const destination = target === "Tax" ? "Taxes & GST" : target === "Discount" ? "Discounts" : `${target}s`;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;
    setError("");
    setLoading(true);
    const number = (key: string) => Number(values[key] ?? 0);
    const rupees = (key: string) => Math.round(number(key) * 100);
    const payloads: Record<CreateTarget, { endpoint: string; body: Record<string, unknown> }> = {
      Product: { endpoint: "/api/catalog/products", body: { name: values.name, description: values.description ?? "", productType: values.productType, salesPricePaise: rupees("salesPrice"), costPricePaise: rupees("costPrice") } },
      Plan: { endpoint: "/api/catalog/plans", body: { name: values.name, description: values.description ?? "", amountPaise: rupees("amount"), interval: values.interval, minimumQuantity: number("minimumQuantity") || 1, availableFrom: values.availableFrom } },
      Tax: { endpoint: "/api/taxes", body: { name: values.name, taxType: values.taxType, rateBps: number("rateBps"), jurisdiction: values.jurisdiction, stateCode: values.stateCode || undefined, effectiveFrom: values.effectiveFrom } },
      Discount: { endpoint: "/api/discounts", body: { name: values.name, description: values.description ?? "", kind: values.kind, value: number("value"), minimumPurchasePaise: rupees("minimumPurchase"), minimumQuantity: number("minimumQuantity") || 1, startsOn: values.startsOn } },
      Staff: { endpoint: "/api/staff", body: { email: values.email, password: values.password, role: values.role || "STAFF" } },
      Subscription: { endpoint: "/api/subscriptions", body: { customerId: values.customerId || undefined, planId: values.planId, startsOn: values.startsOn, expiresOn: values.expiresOn || undefined } },
      Payment: { endpoint: "/api/payments", body: { customerId: values.customerId, invoiceId: values.invoiceId, amountPaise: rupees("amount"), method: values.method, reference: values.reference || undefined, receivedOn: values.receivedOn, notes: values.notes ?? "" } },
      Quotation: { endpoint: "/api/quotations", body: { customerId: values.customerId, planId: values.planId, validUntil: values.validUntil, discountPaise: rupees("discount"), taxRateBps: number("taxRateBps"), lines: [{ productId: values.productId, description: values.description || values.lineDescription, quantity: number("quantity") || 1, unitPricePaise: rupees("unitPrice") }] } }
    };
    try {
      const response = await fetch(`${api}${payloads[target].endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payloads[target].body) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Your session expired. Sign in again and retry.");
      if (!response.ok) throw new Error(result.error ?? "Unable to create this record.");
      onNavigate(destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create this record.");
    } finally {
      setLoading(false);
    }
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="create-dialog"><div className="dialog-heading"><div><span className="label">Quick action</span><h2>{target ? `Create ${target.toLowerCase()}` : "What would you like to create?"}</h2></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{!target ? <div className="create-options">{createOptions.map(({ label, description, icon: Icon }) => <button key={label} onClick={() => { setTarget(label); setError(""); }}><span className="create-icon"><Icon size={18}/></span><span><strong>{label}</strong><small>{description}</small></span><ChevronRight size={15}/></button>)}</div> : <form className="create-form" onSubmit={submit}>{target === "Staff" && <>{field("email", "Staff email", "email")}{field("password", "Temporary password", "password")}{field("role", "Role (STAFF or ADMIN)")}</>  }{target === "Product" && <>{field("name", "Product name")}{field("productType", "Product type")}{field("salesPrice", "Sales price (₹)", "number")}{field("costPrice", "Cost price (₹)", "number", false)}</>}{target === "Plan" && <>{field("name", "Plan name")}{field("amount", "Amount (₹)", "number")}{field("interval", "Interval")}{field("availableFrom", "Available from", "date")}{field("minimumQuantity", "Minimum quantity", "number")}</>}{target === "Tax" && <>{field("name", "Tax name")}{field("taxType", "Tax type (PERCENTAGE, CGST, SGST, IGST, EXEMPT)")}{field("rateBps", "Rate (basis points)", "number")}{field("jurisdiction", "Jurisdiction")}{field("effectiveFrom", "Effective from", "date")}</>}{target === "Discount" && <>{field("name", "Discount name")}{field("kind", "Kind (fixed or percentage)")}{field("value", "Value")}{field("minimumPurchase", "Minimum purchase (₹)", "number", false)}{field("startsOn", "Starts on", "date")}</>}{target === "Subscription" && <>{selectField("customerId", "Customer", customers, "id", "name")}{selectField("planId", "Plan", plans, "id", "name")}{field("startsOn", "Starts on", "date")}</>}{target === "Payment" && <>{selectField("customerId", "Customer", customers, "id", "name")}{selectField("invoiceId", "Invoice", invoices, "id", "number")}{field("amount", "Amount (₹)", "number")}{field("method", "Method (cash, bank_transfer, upi, card, cheque, other)")}{field("receivedOn", "Received on", "date")}</>}{target === "Quotation" && <>{selectField("customerId", "Customer", customers, "id", "name")}{selectField("planId", "Plan", plans, "id", "name")}{selectField("productId", "Product", products, "id", "name")}{field("lineDescription", "Line description")}{field("unitPrice", "Unit price (₹)", "number")}{field("quantity", "Quantity", "number")}{field("discount", "Discount (₹)", "number", false)}{field("validUntil", "Valid until", "date")}</>}{error && <div className="auth-error">{error}</div>}<div className="dialog-actions"><button type="button" className="secondary" onClick={() => setTarget(null)}>Back</button><button type="submit" className="primary" disabled={loading}>{loading ? "Saving…" : "Create record"}</button></div></form>}</div></div>;
}
