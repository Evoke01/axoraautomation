import {
  businessPresets,
  planCatalog,
  type BookingInput,
  type BookingStatus,
  type BusinessCreateResult,
  type BusinessType,
  type DashboardPayload,
  type LeadInput,
  type Plan,
  type PublicConfig,
} from "@business-automation/shared";
import { startTransition, useDeferredValue, useEffect, useEffectEvent, useMemo, useState, type FormEvent } from "react";
import { Link, NavLink, Route, Routes, useParams } from "react-router-dom";
import {
  createBooking,
  createBusiness,
  createLead,
  fetchDashboard,
  fetchPublicConfig,
  login,
  logout,
  updateBookingStatus,
} from "./api";

function toLocalDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function App() {
  return (
    <div className="shell">
      <header className="masthead">
        <Link to="/" className="brand">
          <span className="brand-mark">AX</span>
          <span>
            <strong>Axora Core</strong>
            <small>Lead-to-booking automation for salons and gyms</small>
          </span>
        </Link>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : undefined)}>Overview</NavLink>
          <NavLink to="/start" className={({ isActive }) => (isActive ? "active" : undefined)}>Get Started</NavLink>
          <NavLink to="/pricing" className={({ isActive }) => (isActive ? "active" : undefined)}>Pricing</NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/start" element={<StartPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/lead/:businessSlug" element={<LeadPage />} />
        <Route path="/book/:businessSlug" element={<BookingPage />} />
        <Route path="/admin/:businessSlug" element={<AdminPage />} />
      </Routes>
    </div>
  );
}

function LandingPage() {
  return (
    <main>
      <section className="hero hero-wide">
        <div className="hero-copy">
          <p className="eyebrow">Revenue-first business automation</p>
          <h1>Turn leads into booked visits and show the owner exactly what that is worth.</h1>
          <p className="lede">
            Axora gives salons and gyms a branded lead page, a booking page, automated follow-up, and a dashboard that speaks in conversion and no-show impact instead of raw records.
          </p>
          <div className="hero-actions">
            <Link to="/start" className="button primary">Get Started</Link>
            <Link to="/pricing" className="button ghost">See pricing</Link>
          </div>
          <div className="impact-strip">
            <div>
              <span>Leads</span>
              <strong>50</strong>
            </div>
            <div>
              <span>Bookings</span>
              <strong>20</strong>
            </div>
            <div>
              <span>Conversion</span>
              <strong>40%</strong>
            </div>
          </div>
        </div>

        <div className="hero-board">
          <div className="board-ribbon">How the funnel works</div>
          <ol className="funnel-list">
            <li>
              <strong>1. Capture the lead</strong>
              <p>Every inquiry lands in a real lead table, not a forgotten inbox.</p>
            </li>
            <li>
              <strong>2. Convert to a booking</strong>
              <p>When that person books, the system links the lead and updates conversion automatically.</p>
            </li>
            <li>
              <strong>3. Automate the follow-through</strong>
              <p>Confirmation, reminder, follow-up, and re-engagement stay attached to the booking event.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="preset-grid">
        <PresetCard type="salon" />
        <PresetCard type="gym" />
      </section>

      <section className="story-grid">
        <article>
          <h3>Business-scoped from day one</h3>
          <p>Each client gets a unique slug, unique passcode, and their own lead, booking, and admin paths.</p>
        </article>
        <article>
          <h3>Impact before operations</h3>
          <p>The dashboard puts bookings today, bookings this week, no-shows, and conversion rate above the raw table.</p>
        </article>
        <article>
          <h3>Built to wrap more sites</h3>
          <p>Salon and gym presets are the first layer. The backend stays reusable for future branded wrapper sites.</p>
        </article>
      </section>
    </main>
  );
}

function PresetCard({ type }: { type: BusinessType }) {
  const preset = businessPresets[type];
  return (
    <article className="preset-card">
      <p className="eyebrow">{type === "salon" ? "Salon preset" : "Gym preset"}</p>
      <h2>{preset.bookingHeadline}</h2>
      <p>{preset.dashboardCopy}</p>
      <ul className="feature-list">
        {preset.services.map((service) => (
          <li key={service}>{service}</li>
        ))}
      </ul>
    </article>
  );
}

function StartPage() {
  const [form, setForm] = useState({ name: "", type: "salon" as BusinessType });
  const [result, setResult] = useState<BusinessCreateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = await createBusiness(form);
      setResult(payload);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create business.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const example = result.business.settings.kpiExample;
    return (
      <main className="page page-narrow">
        <section className="page-header">
          <p className="eyebrow">Business created</p>
          <h1>{result.business.name} is ready to start capturing revenue.</h1>
          <p className="lede">
            Share the public links, keep the generated passcode safe, and start showing owners how inquiries convert into booked appointments.
          </p>
        </section>

        <section className="success-grid">
          <div className="surface">
            <div className="surface-header compact">
              <div>
                <h2>Launch links</h2>
                <p>These routes are scoped to the new business slug.</p>
              </div>
            </div>
            <LinkField label="Lead link" value={result.leadLink} />
            <LinkField label="Booking link" value={result.bookingLink} />
            <LinkField label="Admin link" value={result.adminLink} />
            <LinkField label="Generated passcode" value={result.generatedPasscode} />
            <div className="hero-actions">
              <a className="button primary" href={result.adminLink}>Open admin</a>
              <a className="button ghost" href={result.bookingLink}>Open booking page</a>
            </div>
          </div>

          <div className="surface">
            <div className="surface-header compact">
              <div>
                <h2>What the client will see</h2>
                <p>Lead capture and bookings now roll up into one revenue story.</p>
              </div>
            </div>
            <div className="example-metric">
              <span>Example funnel</span>
              <strong>{example.leads} leads {"->"} {example.bookings} bookings {"->"} {example.conversionLabel} conversion</strong>
            </div>
            <p className="surface-copy">{result.business.settings.dashboardCopy}</p>
            <p className="feedback muted">The passcode is shown once here. Store it before leaving this screen.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page page-narrow">
      <section className="page-header">
        <p className="eyebrow">Get started</p>
        <h1>Create a business, generate the slug, and hand over working links instantly.</h1>
        <p className="lede">No manual database setup. Enter the business name and category, and the system creates the lead page, booking page, admin route, and default automation settings.</p>
      </section>

      <form className="launch-form" onSubmit={handleSubmit}>
        <label>
          Business name
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Luma Salon" required />
        </label>

        <label>
          Business type
          <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as BusinessType })}>
            <option value="salon">Salon</option>
            <option value="gym">Gym</option>
          </select>
        </label>

        <button className="button primary submit-button" type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create business"}
        </button>
        {error ? <p className="feedback error">{error}</p> : null}
      </form>
    </main>
  );
}

function PricingPage() {
  return (
    <main className="page page-narrow">
      <section className="page-header">
        <p className="eyebrow">Pricing hooks</p>
        <h1>Price the system around captured revenue, not around generic software seats.</h1>
        <p className="lede">The product already exposes plan limits, locked features, and an upgrade path. Billing can come later.</p>
      </section>

      <section className="plans">
        {planCatalog.map((plan) => (
          <PlanCard key={plan.tier} plan={plan} />
        ))}
      </section>
    </main>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <article className={`plan ${plan.tier === "pro" ? "plan-accent" : ""}`}>
      <div>
        <p className="plan-tier">{plan.label}</p>
        <h2>{plan.priceLabel}</h2>
        <p className="plan-highlight">{plan.highlight}</p>
      </div>
      <ul className="feature-list">
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      {plan.lockedFeatures.length > 0 ? (
        <div className="locked">
          <strong>Premium unlocks</strong>
          <ul className="feature-list muted-list">
            {plan.lockedFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link className="button primary" to="/start">
        {plan.tier === "starter" ? "Launch Starter" : "Request Pro setup"}
      </Link>
    </article>
  );
}

function LeadPage() {
  const { businessSlug } = useParams();
  const { config, loading, error } = useBusinessConfig(businessSlug);
  const [form, setForm] = useState<LeadInput>({
    name: "",
    email: "",
    phone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessSlug) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setSubmitError(null);

    try {
      await createLead(businessSlug, form);
      setMessage("Lead captured. When this person books later, conversion will update automatically.");
      setForm({ name: "", email: "", phone: "" });
    } catch (errorValue) {
      setSubmitError(errorValue instanceof Error ? errorValue.message : "Could not capture lead.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <LoadingPanel label="Loading lead page..." />;
  }

  if (!config) {
    return <ErrorPanel title="Business unavailable" message={error ?? "This lead page is not active."} />;
  }

  return (
    <main className="page page-narrow">
      <section className="page-header">
        <p className="eyebrow">{config.business.type} lead funnel</p>
        <h1>{config.business.settings.leadHeadline}</h1>
        <p className="lede">{config.business.settings.leadDescription}</p>
      </section>

      <div className="split-panel">
        <form className="launch-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
          </label>
          <button className="button primary submit-button" type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Submit inquiry"}
          </button>
          {message ? <p className="feedback success">{message}</p> : null}
          {submitError ? <p className="feedback error">{submitError}</p> : null}
        </form>

        <aside className="surface">
          <div className="surface-header compact">
            <div>
              <h2>Next step</h2>
              <p>Leads are useful only if they can move to a real booking path.</p>
            </div>
          </div>
          <div className="example-metric">
            <span>Booking link</span>
            <strong>{config.business.bookingLink}</strong>
          </div>
          <p className="surface-copy">Once this lead books using the business booking page, the admin dashboard will count it toward conversion automatically.</p>
          <a className="button ghost" href={config.business.bookingLink}>Open booking page</a>
        </aside>
      </div>
    </main>
  );
}

function BookingPage() {
  const { businessSlug } = useParams();
  const { config, loading, error } = useBusinessConfig(businessSlug);
  const [form, setForm] = useState<BookingInput>({
    name: "",
    email: "",
    phone: "",
    service: "",
    scheduledAt: toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!config) {
      return;
    }

    setForm((current) => ({
      ...current,
      service: current.service || config.business.services[0] || "",
    }));
  }, [config]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessSlug) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setSubmitError(null);

    try {
      await createBooking(businessSlug, {
        ...form,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
      });
      setMessage("Booking saved. Confirmation sent and automation scheduled.");
      setForm((current) => ({
        ...current,
        name: "",
        email: "",
        phone: "",
      }));
    } catch (errorValue) {
      setSubmitError(errorValue instanceof Error ? errorValue.message : "Could not create booking.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <LoadingPanel label="Loading booking page..." />;
  }

  if (!config) {
    return <ErrorPanel title="Business unavailable" message={error ?? "This booking page is not active."} />;
  }

  return (
    <main className="page page-narrow">
      <section className="page-header">
        <p className="eyebrow">{config.business.type} booking page</p>
        <h1>{config.business.settings.bookingHeadline}</h1>
        <p className="lede">{config.business.settings.bookingDescription}</p>
      </section>

      <div className="split-panel">
        <form className="launch-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
          </label>
          <label>
            Service or membership
            <select value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value })}>
              {config.business.services.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </label>
          <label>
            Date and time
            <input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} required />
          </label>
          <button className="button primary submit-button" type="submit" disabled={submitting}>
            {submitting ? "Scheduling..." : "Confirm booking"}
          </button>
          {message ? <p className="feedback success">{message}</p> : null}
          {submitError ? <p className="feedback error">{submitError}</p> : null}
        </form>

        <aside className="surface">
          <div className="surface-header compact">
            <div>
              <h2>What happens next</h2>
              <p>This booking becomes an automation timeline automatically.</p>
            </div>
          </div>
          <ol className="timeline">
            <li>Immediate confirmation email</li>
            <li>Reminder before the scheduled time</li>
            <li>Follow-up after completion</li>
            <li>Re-engagement after the configured delay</li>
          </ol>
        </aside>
      </div>
    </main>
  );
}

function AdminPage() {
  const { businessSlug } = useParams();
  const { config, loading: configLoading, error: configError } = useBusinessConfig(businessSlug);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const loadDashboard = useEffectEvent(async () => {
    if (!businessSlug) {
      setDashboard(null);
      setLoading(false);
      setError("Business not found.");
      return;
    }

    setLoading(true);
    try {
      const payload = await fetchDashboard(businessSlug);
      setDashboard(payload);
      setError(null);
    } catch (loadError) {
      setDashboard(null);
      setError(loadError instanceof Error ? loadError.message : "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    void loadDashboard();
  }, [businessSlug, loadDashboard]);

  const filteredBookings = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return dashboard.bookings;
    }

    return dashboard.bookings.filter((booking) =>
      [booking.name, booking.email, booking.phone, booking.service, booking.status, booking.source].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [dashboard, deferredSearch]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessSlug) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await login(businessSlug, passcode);
      setPasscode("");
      await loadDashboard();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
      setLoading(false);
    }
  }

  async function handleStatusChange(bookingId: string, status: BookingStatus) {
    if (!businessSlug) {
      return;
    }

    await updateBookingStatus(businessSlug, bookingId, status);
    startTransition(() => {
      void loadDashboard();
    });
  }

  async function handleLogout() {
    if (!businessSlug) {
      return;
    }

    await logout(businessSlug);
    setDashboard(null);
    setError("Admin session closed.");
  }

  if (configLoading) {
    return <LoadingPanel label="Loading admin workspace..." />;
  }

  if (!config) {
    return <ErrorPanel title="Business unavailable" message={configError ?? "This admin route is not active."} />;
  }

  if (!dashboard) {
    const isUnauthorized = error === "Admin session required.";
    return (
      <main className="page page-narrow">
        <section className="page-header">
          <p className="eyebrow">Admin access</p>
          <h1>{config.business.name} dashboard</h1>
          <p className="lede">Use the generated business passcode to open the impact dashboard for this slug.</p>
        </section>
        <form className="launch-form" onSubmit={handleLogin}>
          <label>
            Business admin passcode
            <input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} required />
          </label>
          <button className="button primary submit-button" type="submit" disabled={loading}>
            {loading ? "Checking..." : "Enter dashboard"}
          </button>
          {error && !isUnauthorized ? <p className="feedback error">{error}</p> : null}
          {isUnauthorized ? <p className="feedback muted">Session not found. Log in to continue.</p> : null}
        </form>
      </main>
    );
  }

  const activePlan = dashboard.plans.find((plan) => plan.tier === dashboard.business.currentPlan) ?? dashboard.plans[0];
  const presetExample = dashboard.business.settings.kpiExample;

  return (
    <main className="dashboard-page">
      <section className="dashboard-top">
        <div>
          <p className="eyebrow">Impact dashboard</p>
          <h1>{dashboard.business.name}</h1>
          <p className="lede">{dashboard.business.settings.dashboardCopy}</p>
        </div>
        <div className="toolbar">
          <button className="button ghost" onClick={() => startTransition(() => void loadDashboard())}>Refresh</button>
          <button className="button ghost" onClick={handleLogout}>Logout</button>
        </div>
      </section>

      <section className="metrics metrics-four">
        <MetricCard label="Bookings today" value={String(dashboard.impact.bookingsToday)} note="Scheduled for today" />
        <MetricCard label="Bookings this week" value={String(dashboard.impact.bookingsThisWeek)} note="Scheduled this week" />
        <MetricCard label="No-shows" value={String(dashboard.impact.noShows)} note="Status marked no_show" />
        <MetricCard label="Conversion rate" value={dashboard.impact.conversionRateLabel} note="Booked leads / total leads" />
      </section>

      <section className="dashboard-grid">
        <div className="main-rail">
          <section className="surface money-surface">
            <div className="surface-header compact">
              <div>
                <h2>Why this matters</h2>
                <p>Show the business owner what the funnel is producing, not just which rows exist.</p>
              </div>
            </div>
            <div className="money-grid">
              <div className="money-card accent">
                <span>Current funnel</span>
                <strong>{dashboard.leadSummary.totalLeads} leads {"->"} {dashboard.leadSummary.convertedLeads} bookings</strong>
                <small>{dashboard.impact.conversionRateLabel} conversion</small>
              </div>
              <div className="money-card">
                <span>Example sales story</span>
                <strong>{presetExample.leads} leads {"->"} {presetExample.bookings} bookings</strong>
                <small>{presetExample.conversionLabel} conversion</small>
              </div>
              <div className="money-card">
                <span>Open leads</span>
                <strong>{dashboard.leadSummary.openLeads}</strong>
                <small>Still available to convert</small>
              </div>
            </div>
          </section>

          <section className="surface bookings-surface">
            <div className="surface-header">
              <div>
                <h2>Bookings</h2>
                <p>Operational detail lives below the KPI layer.</p>
              </div>
              <input
                className="search-input"
                placeholder="Search bookings"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Service</th>
                    <th>When</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>
                        <strong>{booking.name}</strong>
                        <span>{booking.email}</span>
                      </td>
                      <td>{booking.service}</td>
                      <td>{formatDate(booking.scheduledAt)}</td>
                      <td>
                        <span className={`status-pill status-${booking.source}`}>{booking.source}</span>
                      </td>
                      <td>
                        <span className={`status-pill status-${booking.status}`}>{booking.status.replace("_", " ")}</span>
                      </td>
                      <td>
                        <select value={booking.status} onChange={(event) => void handleStatusChange(booking.id, event.target.value as BookingStatus)}>
                          <option value="confirmed">confirmed</option>
                          <option value="completed">completed</option>
                          <option value="cancelled">cancelled</option>
                          <option value="no_show">no_show</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="side-rail">
          <section className="surface">
            <div className="surface-header compact">
              <div>
                <h2>Activity feed</h2>
                <p>Every message write stays visible, even in demo email mode.</p>
              </div>
            </div>
            <ul className="activity-list">
              {dashboard.activity.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{entry.kind.replace("_", " ")}</strong>
                    <p>{entry.subject}</p>
                  </div>
                  <div className="activity-meta">
                    <span className={`status-pill status-${entry.status}`}>{entry.status}</span>
                    <small>{entry.toEmail}</small>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="surface">
            <div className="surface-header compact">
              <div>
                <h2>Lead summary</h2>
                <p>Track what is still open in the funnel.</p>
              </div>
            </div>
            <ul className="feature-list muted-list">
              <li>Total leads: {dashboard.leadSummary.totalLeads}</li>
              <li>Converted leads: {dashboard.leadSummary.convertedLeads}</li>
              <li>Open leads: {dashboard.leadSummary.openLeads}</li>
            </ul>
          </section>

          <section className="surface plan-surface">
            <div className="surface-header compact">
              <div>
                <h2>Current plan</h2>
                <p>{activePlan.highlight}</p>
              </div>
            </div>
            <div className="example-metric">
              <span>{activePlan.label}</span>
              <strong>{activePlan.priceLabel}</strong>
            </div>
            <ul className="feature-list muted-list">
              {activePlan.lockedFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <a className="button primary" href={`mailto:${dashboard.business.supportEmail}?subject=${encodeURIComponent(`Upgrade ${dashboard.business.name} to Pro`)}`}>
              Upgrade to Pro
            </a>
          </section>
        </aside>
      </section>
    </main>
  );
}

function useBusinessConfig(businessSlug: string | undefined) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useEffectEvent(async () => {
    if (!businessSlug) {
      setConfig(null);
      setError("Business not found.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await fetchPublicConfig(businessSlug);
      setConfig(payload);
      setError(null);
    } catch (loadError) {
      setConfig(null);
      setError(loadError instanceof Error ? loadError.message : "Could not load business.");
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    void loadConfig();
  }, [businessSlug, loadConfig]);

  return { config, loading, error };
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function LinkField({ label, value }: { label: string; value: string }) {
  return (
    <label className="link-field">
      <span>{label}</span>
      <input readOnly value={value} />
    </label>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <main className="page page-narrow">
      <section className="surface loading-panel">
        <p className="eyebrow">Loading</p>
        <h2>{label}</h2>
      </section>
    </main>
  );
}

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <main className="page page-narrow">
      <section className="surface">
        <p className="eyebrow">Error</p>
        <h2>{title}</h2>
        <p className="surface-copy">{message}</p>
        <Link className="button ghost" to="/start">Create a business</Link>
      </section>
    </main>
  );
}

export default App;
