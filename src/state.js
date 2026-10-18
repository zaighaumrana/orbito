// ── Shared application state ──────────────────────────────────────
export const pState = {
  page:           "login",
  theme:          localStorage.getItem("retailos-platform-theme") || "light",
  online:         navigator.onLine,
  data:           {
    clients: [], support: [], usage: [], invoices: [],
    rateLog: [], payments: [], credits: [], platformUsers: [],
  },
  supportView:    null,
  supportRequest: 0,
  modal:          null,
  filter:         "",
  clientView:     'current',
  teamTab:        'Active',
  selectedClient: null,
  clientData:     {},
  authenticated:  false,
  dataReady:      false,
  dataError:      null,
  currentUser:    { role: null, username: "" },
  authorityGeneration: 0,
  clientSelectionGeneration: 0,
  clientRequestGeneration: 0,
  turnstileToken: null,
  loginLoading:   false,
  loginAttempt:   null,
  resetLoading:   false,
};

export let PCFG = {
  admin_username: "admin",
};

export function setPCFG(data) {
  PCFG = { ...PCFG, ...data };
}

// Late responses must not repopulate private data after logout/revocation.
export function clearSensitiveState() {
  pState.authorityGeneration++;
  pState.clientSelectionGeneration++;
  pState.clientRequestGeneration++;
  pState.authenticated=false;
  pState.currentUser={role:null,username:""};
  pState.selectedClient=null;pState.clientData={};pState.modal=null;
  pState.filter='';pState.recoveryEmail=null;pState.setupMessage='';
  for(const key of Object.keys(pState.data))pState.data[key]=Array.isArray(pState.data[key])?[]:{};
  pState.turnstileToken=null;pState.passwordFlow=null;
  pState.reauthLoading=false;pState.passwordSaving=false;
  pState.diagnosticAttempt=null;pState.resetAttempt=null;pState.resetLoading=false;
  pState.loginAttempt=null;pState.loginLoading=false;pState.authRouting=false;
  pState.dataReady=false;pState.dataError=null;pState.clientView='current';
  pState.teamTab='Active';pState.supportView=null;pState.supportRequest=(pState.supportRequest||0)+1;
  PCFG={admin_username:""};
}

// A live role edit keeps the same verified Auth session while invalidating every
// cached dataset, view, modal and pending continuation owned by its previous role.
export function refreshRoleState(identity) {
  const user={...pState.currentUser,...identity};
  clearSensitiveState();pState.currentUser=user;pState.authenticated=true;pState.page='overview';
  pState.onRoleChange?.();
}

// ── Role-based nav ────────────────────────────────────────────────
const ALL_NAV = [
  { page: "overview", icon: "▦", label: "Overview"        },
  { page: "clients",  icon: "◉", label: "Clients"         },
  { page: "billing",  icon: "◑", label: "Billing"         },
  { page: "support",  icon: "◈", label: "Support Tickets" },
  { page: "team",     icon: "♧", label: "Team"            },
  { page: "settings", icon: "◐", label: "Settings"        },
];

export function getNav() {
  const role = pState.currentUser.role;
  if (role === "billing_person")    return ALL_NAV.filter(n => !["clients","support","team"].includes(n.page));
  if (role === "portfolio_manager") return ALL_NAV.filter(n => !["billing","team"].includes(n.page));
  return role === "master_admin" ? ALL_NAV : [];
}
