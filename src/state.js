// ── Shared application state ──────────────────────────────────────
export const pState = {
  page:           "login",
  theme:          localStorage.getItem("retailos-platform-theme") || "light",
  online:         navigator.onLine,
  data:           {
    clients: [], support: [], usage: [], invoices: [],
    rateLog: [], payments: [], credits: [], platformUsers: [],
  },
  modal:          null,
  filter:         "",
  selectedClient: null,
  clientData:     {},
  authenticated:  false,
  currentUser:    { role: "master_admin", username: "admin" },
  turnstileToken: null,
  loginLoading:   false,
  resetLoading:   false,
};

export let PCFG = {
  admin_password: "",
  admin_username: "admin",
};

export function setPCFG(data) {
  PCFG = { ...PCFG, ...data };
}

// ── Role-based nav ────────────────────────────────────────────────
const ALL_NAV = [
  { page: "overview", icon: "▦", label: "Overview"        },
  { page: "clients",  icon: "◉", label: "Clients"         },
  { page: "billing",  icon: "◑", label: "Billing"         },
  { page: "support",  icon: "◈", label: "Support Tickets" },
  { page: "settings", icon: "◐", label: "Settings"        },
];

export function getNav() {
  const role = pState.currentUser.role;
  if (role === "billing_person")    return ALL_NAV.filter(n => !["clients","support"].includes(n.page));
  if (role === "portfolio_manager") return ALL_NAV.filter(n => !["billing"].includes(n.page));
  return ALL_NAV;
}
