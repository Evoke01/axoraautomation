import { demoBusiness, planCatalog, serviceOptions, type BookingInput, type BookingStatus, type DashboardPayload, type Plan, type PublicConfig } from "@business-automation/shared";
import { startTransition, useDeferredValue, useEffect, useEffectEvent, useMemo, useState, type FormEvent } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { createBooking, fetchDashboard, fetchPublicConfig, login, logout, resetDemo, runDemo, updateBookingStatus } from "./api";

function toLocalDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function App() {
  const [publicConfig, setPublicConfig] = useState<PublicConfig>({
    business: {
      ...demoBusiness,
      services: [...demoBusiness.services],
      supportEmail: demoBusiness.supportEmail,
    },
    plans: planCatalog,
  });

  useEffect(() => {
    void fetchPublicConfig()
      .then(setPublicConfig)
      .catch(() => undefined);
  }, []);

  return (
    <div className="shell">
      <header className="masthead">
        <Link to="/" className="brand">
          <span className="brand-mark">DS</span>
          <span>
            <strong>{publicConfig.business.name}</strong>
            <small>Business automation MVP</small>
          </span>
        </Link>
        <nav className="nav">
          <NavLink to="/" className={({ isActive }) => (isActive ? "active" : undefined)}>Book</NavLink>
          <NavLink to="/pricing" className={({ isActive }) => (isActive ? "active" : undefined)}>Pricing</NavLink>
          <NavLink to="/admin" className={({ isActive }) => (isActive ? "active" : undefined)}>Admin</NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<HomePage publicConfig={publicConfig} />} />
        <Route path="/pricing" element={<PricingPage publicConfig={publicConfig} />} />
        <Route path="/admin" element={<AdminPage publicConfig={publicConfig} />} />
      </Routes>
    </div>
  );
}

function HomePage({ publicConfig }: { publicConfig: PublicConfig }) {
  const [form, setForm] = useState<BookingInput>({
    name: "",
    email: "",
    phone: "",
    service: serviceOptions[0],
    scheduledAt: toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await createBooking({
        ...form,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
      });
      setMessage("Booking saved. Confirmation sent and automation timeline scheduled.");
      setForm((current) => ({
        ...current,
        name: "",
        email: "",
        phone: "",
      }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create booking.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Hardcoded demo business, real event-based workflow</p>
          <h1>{publicConfig.business.name} runs bookings, reminders, follow-ups, and re-engagement from one lightweight core.</h1>
          <p className="lede">
            This MVP is intentionally lean: one booking form, one admin dashboard, one timer-based job engine, and one sales-ready demo flow in 30 seconds.
          </p>
          <div className="hero-actions">
            <Link to="/admin" className="button primary">Open admin demo</Link>
            <Link to="/pricing" className="button ghost">View pricing hooks</Link>
          </div>
          <ul className="hero-points">
            <li>Instant confirmation email on submit</li>
            <li>Reminder, follow-up, and re-engagement jobs tied to each booking</li>
            <li>Demo-safe mode that shows the full automation story fast</li>
          </ul>
        </div>

        <form className="booking-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <span className="dot" />
            <h2>Book a session</h2>
          </div>

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
            Service
            <select value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value as BookingInput["service"] })}>
              {publicConfig.business.services.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </label>

          <label>
            Date and time
            <input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} required />
          </label>

          <button className="button primary submit-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Scheduling..." : "Submit booking"}
          </button>

          {message ? <p className="feedback success">{message}</p> : null}
          {error ? <p className="feedback error">{error}</p> : null}
        </form>
      </section>

      <section className="story-grid">
        <article>
          <h3>Simple delayed jobs</h3>
          <p>No cron jobs. The scheduler keeps one active timer for the next job and reloads pending work from Postgres on startup.</p>
        </article>
        <article>
          <h3>Demo in 30 seconds</h3>
          <p>Sales can click one button and show confirmation, reminder, completion, follow-up, and re-engagement in a compressed sequence.</p>
        </article>
        <article>
          <h3>Wrapper-site ready</h3>
          <p>The MVP is single-business on purpose, but the API, plans, and styling boundaries are clean enough to wrap other salon or gym sites later.</p>
        </article>
      </section>
    </main>
  );
}

function PricingPage({ publicConfig }: { publicConfig: PublicConfig }) {
  return (
    <main className="page page-narrow">
      <section className="page-header">
        <p className="eyebrow">Pricing hooks</p>
        <h1>Monetizable from day one without pulling billing into the MVP.</h1>
        <p className="lede">Plans are config-driven, usage-aware, and already wired to a visible upgrade path.</p>
      </section>

      <section className="plans">
        {publicConfig.plans.map((plan) => (
          <PlanCard key={plan.tier} plan={plan} supportEmail={publicConfig.business.supportEmail} />
        ))}
      </section>
    </main>
  );
}

function PlanCard({ plan, supportEmail }: { plan: Plan; supportEmail: string }) {
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
          <strong>Locked until upgrade</strong>
          <ul className="feature-list muted-list">
            {plan.lockedFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <a className="button primary" href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Upgrade ${demoBusiness.name} to ${plan.label}`)}`}>
        {plan.tier === "starter" ? "Talk to sales" : "Request Pro rollout"}
      </a>
    </article>
  );
}

function AdminPage({ publicConfig }: { publicConfig: PublicConfig }) {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const loadDashboard = useEffectEvent(async () => {
    setLoading(true);
    try {
      const payload = await fetchDashboard();
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
  }, [loadDashboard]);

  const filteredBookings = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return dashboard.bookings;
    }

    return dashboard.bookings.filter((booking) =>
      [booking.name, booking.email, booking.phone, booking.service, booking.status].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [dashboard, deferredSearch]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(passcode);
      setPasscode("");
      await loadDashboard();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
      setLoading(false);
    }
  }

  async function handleStatusChange(id: string, status: BookingStatus) {
    await updateBookingStatus(id, status);
    startTransition(() => {
      void loadDashboard();
    });
  }

  async function handleReset() {
    await resetDemo();
    startTransition(() => {
      void loadDashboard();
    });
  }

  async function handleRunDemo() {
    await runDemo();
    startTransition(() => {
      void loadDashboard();
    });
  }

  async function handleLogout() {
    await logout();
    setDashboard(null);
    setError("Admin session closed.");
  }

  const isUnauthorized = error === "Admin session required.";

  if (!dashboard) {
    return (
      <main className="page page-narrow">
        <section className="page-header">
          <p className="eyebrow">Admin access</p>
          <h1>Passcode gate for the Demo Salon dashboard.</h1>
          <p className="lede">Use the env-configured admin passcode to unlock status changes, activity logs, demo controls, and pricing signals.</p>
        </section>
        <form className="login-panel" onSubmit={handleLogin}>
          <label>
            Admin passcode
            <input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} required />
          </label>
          <button className="button primary" type="submit" disabled={loading}>
            {loading ? "Checking..." : "Enter dashboard"}
          </button>
          {error && !isUnauthorized ? <p className="feedback error">{error}</p> : null}
          {isUnauthorized ? <p className="feedback muted">Session not found. Log in to continue.</p> : null}
          <p className="feedback muted">Default local passcode is set by `ADMIN_PASSCODE`.</p>
        </form>
      </main>
    );
  }

  const activePlan = publicConfig.plans.find((plan) => plan.tier === dashboard.business.currentPlan) ?? publicConfig.plans[0];

  return (
    <main className="dashboard-page">
      <section className="dashboard-top">
        <div>
          <p className="eyebrow">Operator workspace</p>
          <h1>{dashboard.business.name} dashboard</h1>
          <p className="lede">Live bookings, automation activity, sales demo controls, and upgrade pressure in one place.</p>
        </div>
        <div className="toolbar">
          <button className="button ghost" onClick={() => startTransition(() => void loadDashboard())}>Refresh</button>
          <button className="button ghost" onClick={handleLogout}>Logout</button>
        </div>
      </section>

      <section className="metrics">
        <MetricCard label="Bookings this month" value={`${dashboard.metrics.monthlyBookingsUsed}/${dashboard.metrics.monthlyBookingsLimit}`} note={`${activePlan.label} plan cap`} />
        <MetricCard label="Active automations" value={`${dashboard.metrics.activeAutomations}/${dashboard.metrics.automationLimit}`} note="Pending or running delayed jobs" />
        <MetricCard label="Current plan" value={activePlan.label} note={activePlan.highlight} />
      </section>

      <section className="dashboard-grid">
        <div className="surface bookings-surface">
          <div className="surface-header">
            <div>
              <h2>Bookings</h2>
              <p>Update status to trigger follow-up and re-engagement.</p>
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
                  <th>Scheduled</th>
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
                    <td>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.scheduledAt))}</td>
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
        </div>

        <aside className="side-rail">
          <section className="surface">
            <div className="surface-header compact">
              <div>
                <h2>Demo controls</h2>
                <p>Show the full automation journey in one sales call.</p>
              </div>
            </div>
            <div className="action-stack">
              <button className="button primary" onClick={handleRunDemo}>Run 30s demo</button>
              <button className="button ghost" onClick={handleReset}>Reset demo data</button>
            </div>
            <ol className="timeline">
              <li>0s: confirmation recorded</li>
              <li>10s: reminder sent</li>
              <li>15s: booking auto-completes</li>
              <li>20s: follow-up sent</li>
              <li>30s: re-engagement sent</li>
            </ol>
          </section>

          <section className="surface">
            <div className="surface-header compact">
              <div>
                <h2>Activity feed</h2>
                <p>Every email write is visible, even in demo mode.</p>
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

          <section className="surface plan-surface">
            <div className="surface-header compact">
              <div>
                <h2>Upgrade pressure</h2>
                <p>Monetization hooks stay visible inside the product.</p>
              </div>
            </div>
            <ul className="feature-list muted-list">
              {activePlan.lockedFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <a className="button primary" href={`mailto:${publicConfig.business.supportEmail}?subject=${encodeURIComponent(`Upgrade ${publicConfig.business.name} to Pro`)}`}>
              Upgrade to Pro
            </a>
          </section>
        </aside>
      </section>
    </main>
  );
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

export default App;
