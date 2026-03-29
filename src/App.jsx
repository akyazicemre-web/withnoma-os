import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase.js";
import { useWorkspace } from "./lib/workspace.js";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg:     "#F8F4EC",
  bg2:    "#F0EBE0",
  card:   "#FFFFFF",
  ink:    "#2C2418",
  ink2:   "#5C4A32",
  muted:  "#9A8870",
  border: "#E8E0D0",
  gold:   "#C89040",
  gold2:  "#A87030",
  goldBg: "rgba(200,144,64,0.08)",
  goldBd: "rgba(200,144,64,0.2)",
  green:  "#4A8C6A",
  greenBg:"rgba(74,140,106,0.1)",
  red:    "#C04040",
  redBg:  "rgba(192,64,64,0.08)",
  blue:   "#4070A0",
  blueBg: "rgba(64,112,160,0.08)",
  purple: "#7050A0",
  purpleBg:"rgba(112,80,160,0.08)",
  shadow: "0 1px 3px rgba(44,36,24,0.08), 0 4px 16px rgba(44,36,24,0.04)",
  shadowMd:"0 4px 24px rgba(44,36,24,0.1), 0 1px 4px rgba(44,36,24,0.06)",
  shadowLg:"0 8px 40px rgba(44,36,24,0.12)",
  r: "16px", rSm: "10px", rLg: "24px",
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;background:${T.bg}}
body{font-family:'DM Sans',sans-serif;color:${T.ink};-webkit-font-smoothing:antialiased;overscroll-behavior:none}
button,input,textarea,select{font-family:'DM Sans',sans-serif}
button{cursor:pointer;border:none;background:none;outline:none}
input,textarea,select{outline:none}
::-webkit-scrollbar{width:0;height:0}

@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes scaleIn{from{opacity:0;transform:scale(0.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}

.a0{animation:fadeUp 0.4s cubic-bezier(.16,1,.3,1) both}
.a1{animation:fadeUp 0.4s 0.06s cubic-bezier(.16,1,.3,1) both}
.a2{animation:fadeUp 0.4s 0.12s cubic-bezier(.16,1,.3,1) both}
.a3{animation:fadeUp 0.4s 0.18s cubic-bezier(.16,1,.3,1) both}
.a4{animation:fadeUp 0.4s 0.24s cubic-bezier(.16,1,.3,1) both}
.fi{animation:fadeIn 0.25s ease both}
.si{animation:scaleIn 0.3s cubic-bezier(.16,1,.3,1) both}
.su{animation:slideUp 0.35s cubic-bezier(.16,1,.3,1) both}

.press{transition:transform 0.15s;-webkit-tap-highlight-color:transparent}
.press:active{transform:scale(0.97)}
.hov{transition:all 0.2s cubic-bezier(.16,1,.3,1)}

.skeleton{background:linear-gradient(90deg,${T.border} 25%,${T.bg2} 50%,${T.border} 75%);background-size:400px 100%;animation:shimmer 1.4s ease-in-out infinite}

.scrollx{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.scrolly{overflow-y:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const today = () => new Date().toISOString().split("T")[0];
const fDate = d => d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—";
const daysLeft = d => { if (!d) return null; return Math.ceil((new Date(d) - new Date()) / 86400000); };
const isOverdue = (d, status) => { const dl = daysLeft(d); return dl !== null && dl < 0 && status !== "done" && status !== "validated"; };

const futureDate = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0]; };

// ─── STATUS CONFIGS ───────────────────────────────────────────────────────────
const TASK_STATUS = {
  todo:       { l: "À faire",    c: T.muted,  bg: "rgba(154,136,112,0.1)" },
  in_progress:{ l: "En cours",   c: T.blue,   bg: T.blueBg },
  blocked:    { l: "Bloqué",     c: T.red,    bg: T.redBg },
  done:       { l: "✓ Validé",   c: T.green,  bg: T.greenBg },
};
const TASK_PRIORITY = {
  urgent: { l: "Urgent", c: T.red,   bg: T.redBg },
  high:   { l: "Haute",  c: T.gold,  bg: T.goldBg },
  normal: { l: "Normale",c: T.muted, bg: "rgba(154,136,112,0.1)" },
  low:    { l: "Basse",  c: T.muted, bg: "rgba(154,136,112,0.06)" },
};
const PROJECT_PHASE = {
  planning:   { l: "Planning",   c: T.blue },
  production: { l: "Production", c: T.gold },
  delivery:   { l: "Livraison",  c: T.purple },
  completed:  { l: "Terminé",    c: T.green },
};
const PROJECT_RISK = {
  on_track: { l: "On track",  c: T.green },
  at_risk:  { l: "À risque",  c: T.gold },
  blocked:  { l: "Bloqué",    c: T.red },
};
const LEAD_STATUS = {
  new:       { l: "Nouveau",    c: T.muted },
  contacted: { l: "Contacté",   c: T.blue },
  proposal:  { l: "Devis",      c: T.gold },
  won:       { l: "🎉 Gagné",   c: T.green },
  lost:      { l: "Perdu",      c: T.red },
};
const DELIV_STATUS = {
  pending:    { l: "En attente",  c: T.muted,  bg: "rgba(154,136,112,0.1)" },
  in_progress:{ l: "En cours",    c: T.blue,   bg: T.blueBg },
  delivered:  { l: "Livré",       c: T.gold,   bg: T.goldBg },
  validated:  { l: "✓ Validé",    c: T.green,  bg: T.greenBg },
};

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
const DEMO = {
  clients: [
    {
      id: "c1", name: "Monte Cristo Marrakech", sector: "Restaurant · Bar · Club",
      color: "#C89040", status: "active", pilote: "Cemre",
      contact: "Hassan Benali", phone: "+212 6 00 11 22 33", email: "contact@montecristo.ma",
      whatsapp: "https://wa.me/212600112233",
      notes: "Client très réactif. Budget extensible si ROI prouvé. Préfère les validations le matin.",
      since: "2026-01-15",
    },
    {
      id: "c2", name: "AYÏNA Hair Luxury", sector: "Salon · Cosmétique capillaire",
      color: "#7050A0", status: "active", pilote: "Cemre",
      contact: "Yasmine Idrissi", phone: "+212 6 55 44 33 22", email: "yasmine@ayina.ma",
      notes: "Très attachée à l'esthétique. Valide vite les visuels.",
      since: "2026-02-01",
    },
  ],
  projects: [
    {
      id: "p1", client_id: "c1", name: "Social Media Avril", type: "client",
      phase: "production", risk: "on_track", progress: 67,
      next_action: "Finaliser tournage Behind the Scene DJ",
      deadline: futureDate(12), status: "active",
    },
    {
      id: "p2", client_id: "c2", name: "Lancement identité AYÏNA", type: "client",
      phase: "production", risk: "at_risk", progress: 45,
      next_action: "Valider shooting lancement",
      deadline: futureDate(8), status: "active",
    },
    {
      id: "p3", client_id: null, name: "Site WITH NOMA", type: "internal",
      phase: "planning", risk: "on_track", progress: 20,
      next_action: "Définir arborescence",
      deadline: futureDate(30), status: "active",
    },
  ],
  tasks: [
    { id: "t1", project_id: "p1", client_id: "c1", name: "Charte visuelle Stories", status: "done",       priority: "high",   assignee: "Sara",   deadline: futureDate(-3), notes: "" },
    { id: "t2", project_id: "p1", client_id: "c1", name: "Tournage Behind the Scene DJ", status: "in_progress", priority: "urgent", assignee: "Sara",   deadline: futureDate(5),  notes: "Vendredi 21h" },
    { id: "t3", project_id: "p1", client_id: "c1", name: "Brief Table du Jeudi",  status: "in_progress", priority: "high",   assignee: "Karim",  deadline: futureDate(8),  notes: "" },
    { id: "t4", project_id: "p1", client_id: "c1", name: "Rapport Mars",          status: "review",      priority: "normal", assignee: "Ambrine", deadline: futureDate(2),  notes: "+34% engagement" },
    { id: "t5", project_id: "p1", client_id: "c1", name: "Sélection DJs",         status: "todo",        priority: "normal", assignee: "Karim",  deadline: futureDate(12), notes: "" },
    { id: "t6", project_id: "p2", client_id: "c2", name: "Finalisation logo",     status: "done",        priority: "high",   assignee: "Cemre",  deadline: futureDate(-5), notes: "" },
    { id: "t7", project_id: "p2", client_id: "c2", name: "Shooting lancement",    status: "in_progress", priority: "urgent", assignee: "Sara",   deadline: futureDate(3),  notes: "" },
    { id: "t8", project_id: "p2", client_id: "c2", name: "Setup WhatsApp Business",status: "todo",       priority: "normal", assignee: "Karim",  deadline: futureDate(10), notes: "" },
  ],
  deliverables: [
    { id: "d1", project_id: "p1", name: "Charte visuelle complète",  status: "validated",  deadline: futureDate(-3) },
    { id: "d2", project_id: "p1", name: "Calendrier éditorial Avril",status: "validated",  deadline: futureDate(-1) },
    { id: "d3", project_id: "p1", name: "Vidéo Behind the Scene",    status: "in_progress",deadline: futureDate(5) },
    { id: "d4", project_id: "p1", name: "Rapport mensuel Mars",      status: "delivered",  deadline: futureDate(2) },
    { id: "d5", project_id: "p2", name: "Logo pack complet",         status: "validated",  deadline: futureDate(-5) },
    { id: "d6", project_id: "p2", name: "Photos shooting lancement", status: "in_progress",deadline: futureDate(3) },
  ],
  leads: [
    { id: "l1", name: "Dar Yacout",     company: "Restaurant gastronomique", contact: "Omar Tazi",     value: "4500", status: "proposal",  pilote: "Cemre",   next_date: futureDate(3),  notes: "RDV confirmé" },
    { id: "l2", name: "Atelier Nomade", company: "Artisanat / Boutique",     contact: "Leila Fassi",   value: "2000", status: "contacted", pilote: "Ambrine", next_date: futureDate(6),  notes: "" },
    { id: "l3", name: "Riad Sable & Or",company: "Hôtellerie",              contact: "Pierre Mathieu",value: "6000", status: "new",       pilote: "Cemre",   next_date: futureDate(14), notes: "" },
    { id: "l4", name: "Maison Rokia",   company: "Cuisine fusion",           contact: "Rokia B.",      value: "3000", status: "proposal",  pilote: "Ambrine", next_date: futureDate(4),  notes: "Devis envoyé" },
  ],
  vault: [
    { id: "v1", client_id: "c1", platform: "Instagram", login: "@montecristo_mrk", password: "MC2024secure!", url: "instagram.com/montecristo_mrk", notes: "" },
    { id: "v2", client_id: "c1", platform: "Google Business", login: "contact@montecristo.ma", password: "GBiz2024!", url: "business.google.com", notes: "" },
    { id: "v3", client_id: "c2", platform: "Instagram", login: "@ayina.hair", password: "AYINA2024!", url: "instagram.com/ayina.hair", notes: "" },
    { id: "v4", client_id: "c2", platform: "TikTok", login: "@ayinahair", password: "TikTok2024!", url: "tiktok.com/@ayinahair", notes: "" },
  ],
  files: [
    { id: "f1", project_id: "p1", client_id: "c1", name: "Brief stratégique Q2 2026.pdf", size: "2.4 MB", type: "document", date: futureDate(-10) },
    { id: "f2", project_id: "p1", client_id: "c1", name: "Charte visuelle Monte Cristo.canva", size: "8.1 MB", type: "template", date: futureDate(-5) },
    { id: "f3", project_id: "p2", client_id: "c2", name: "Logo AYÏNA — Pack complet.zip", size: "12 MB", type: "creative_asset", date: futureDate(-7) },
  ],
  calendar: [
    { id: "ev1", title: "RDV Monte Cristo — Brief", date: futureDate(2),  time: "10:00", type: "rdv",      client_id: "c1" },
    { id: "ev2", title: "Shooting AYÏNA",           date: futureDate(3),  time: "14:00", type: "production",client_id: "c2" },
    { id: "ev3", title: "Point hebdo équipe",       date: futureDate(1),  time: "10:00", type: "internal",  client_id: null },
    { id: "ev4", title: "Dar Yacout — Prospection", date: futureDate(3),  time: "11:00", type: "rdv",      client_id: null },
  ],
  team: [
    { id: "u1", name: "Cemre",   role: "owner",   color: "#C89040", email: "cemre@withnoma.com" },
    { id: "u2", name: "Ambrine", role: "manager", color: "#A87030", email: "ambrine@adragency.com" },
    { id: "u3", name: "Sara",    role: "employee",color: "#4A8C6A", email: "sara@adr-noma.com" },
    { id: "u4", name: "Karim",   role: "employee",color: "#4070A0", email: "karim@adr-noma.com" },
  ],
};

// ─── ATOMS ───────────────────────────────────────────────────────────────────
const Pl = ({ v, s = {} }) => <span style={{ fontFamily: "'Playfair Display',serif", ...s }}>{v}</span>;
const Mn = ({ v, s = {} }) => <span style={{ fontFamily: "'DM Mono',monospace", ...s }}>{v}</span>;

const Badge = ({ label, color = T.muted, bg = "rgba(154,136,112,0.1)", size = "sm" }) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    padding: size === "sm" ? "2px 8px" : "4px 12px",
    borderRadius: 20,
    background: bg, color,
    fontFamily: "'DM Mono',monospace",
    fontSize: size === "sm" ? 10 : 11,
    fontWeight: 500,
    whiteSpace: "nowrap",
    letterSpacing: "0.02em",
  }}>{label}</span>
);

const Avatar = ({ name, color, size = 32 }) => {
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${color}dd, ${color}88)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, color: "#fff",
      border: `2px solid ${color}33`,
    }}>{initials}</div>
  );
};

const Dot = ({ color, size = 8 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}66` }} />
);

const ProgressBar = ({ value, color = T.gold, height = 4 }) => (
  <div style={{ height, background: T.border, borderRadius: height, overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${Math.min(100, value)}%`, background: color, borderRadius: height, transition: "width 0.8s cubic-bezier(.16,1,.3,1)" }} />
  </div>
);

const Card = ({ children, style = {}, onClick, className = "" }) => (
  <div onClick={onClick} className={`press ${className}`} style={{
    background: T.card, borderRadius: T.r, border: `1px solid ${T.border}`,
    boxShadow: T.shadow, cursor: onClick ? "pointer" : "default",
    transition: "box-shadow 0.2s, transform 0.15s",
    ...style,
  }}
    onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = T.shadowMd; }}
    onMouseLeave={e => { if (onClick) e.currentTarget.style.boxShadow = T.shadow; }}
  >{children}</div>
);

const Btn = ({ label, onClick, v = "primary", sm, style: ex = {}, disabled, icon }) => {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: sm ? "8px 16px" : "12px 22px",
    borderRadius: T.rSm, fontSize: sm ? 12 : 13, fontWeight: 600,
    transition: "all 0.18s", letterSpacing: "0.01em",
    opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer",
    ...ex,
  };
  if (v === "primary") return <button onClick={!disabled ? onClick : undefined} style={{ ...base, background: T.gold, color: "#fff", boxShadow: `0 2px 12px ${T.gold}44` }}>{icon}{label}</button>;
  if (v === "secondary") return <button onClick={onClick} style={{ ...base, background: T.bg2, color: T.ink2, border: `1px solid ${T.border}` }}>{icon}{label}</button>;
  if (v === "ghost") return <button onClick={onClick} style={{ ...base, background: "transparent", color: T.muted }}>{icon}{label}</button>;
  if (v === "danger") return <button onClick={onClick} style={{ ...base, background: T.redBg, color: T.red, border: `1px solid ${T.red}22` }}>{icon}{label}</button>;
  if (v === "success") return <button onClick={onClick} style={{ ...base, background: T.greenBg, color: T.green, border: `1px solid ${T.green}22` }}>{icon}{label}</button>;
  return <button onClick={onClick} style={{ ...base, background: T.gold, color: "#fff" }}>{icon}{label}</button>;
};

const Input = ({ label, value, onChange, placeholder, type = "text", multiline }) => {
  const st = {
    background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rSm,
    color: T.ink, fontSize: 13, padding: "11px 14px", width: "100%",
    transition: "border-color 0.15s", resize: multiline ? "vertical" : "none",
    minHeight: multiline ? 80 : undefined, lineHeight: 1.6,
  };
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <Mn v={label} s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 6 }} />}
      {multiline
        ? <textarea value={value} onChange={onChange} placeholder={placeholder} style={st} onFocus={e => e.target.style.borderColor = T.gold} onBlur={e => e.target.style.borderColor = T.border} />
        : <input type={type} value={value} onChange={onChange} placeholder={placeholder} style={st} onFocus={e => e.target.style.borderColor = T.gold} onBlur={e => e.target.style.borderColor = T.border} />
      }
    </div>
  );
};

const Select = ({ label, value, onChange, options }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <Mn v={label} s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 6 }} />}
    <select value={value} onChange={onChange} style={{
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.rSm,
      color: T.ink, fontSize: 13, padding: "11px 14px", width: "100%", appearance: "none",
    }} onFocus={e => e.target.style.borderColor = T.gold} onBlur={e => e.target.style.borderColor = T.border}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Modal = ({ title, subtitle, onClose, children, width = 500 }) => (
  <div className="fi" onClick={e => e.target === e.currentTarget && onClose()} style={{
    position: "fixed", inset: 0, background: "rgba(44,36,24,0.4)", backdropFilter: "blur(8px)",
    display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000, padding: "0",
  }}>
    <div className="su" style={{
      background: T.card, borderRadius: "24px 24px 0 0", width: "100%", maxWidth: width,
      maxHeight: "92vh", overflow: "auto", boxShadow: T.shadowLg,
    }}>
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <Pl v={title} s={{ fontSize: 18, fontWeight: 600, color: T.ink, display: "block" }} />
          {subtitle && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} style={{ color: T.muted, fontSize: 22, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}>&times;</button>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  </div>
);

const EmptyState = ({ icon, title, sub, action }) => (
  <div style={{ textAlign: "center", padding: "48px 24px" }}>
    <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontSize: 15, fontWeight: 600, color: T.ink2, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>{sub}</div>
    {action}
  </div>
);

// ─── INTELLIGENCE ENGINE ──────────────────────────────────────────────────────
function getAlerts(data) {
  const alerts = [];
  data.tasks.forEach(t => {
    if (isOverdue(t.deadline, t.status)) alerts.push({ type: "overdue", priority: "urgent", label: `"${t.name}" en retard`, sub: `${Math.abs(daysLeft(t.deadline))}j de retard`, nav: "tasks", data: t });
    if (t.priority === "urgent" && t.status !== "done") alerts.push({ type: "urgent", priority: "urgent", label: t.name, sub: "Priorité urgente", nav: "tasks", data: t });
  });
  data.projects.forEach(p => {
    if (p.risk === "blocked") alerts.push({ type: "blocked", priority: "high", label: `"${p.name}" bloqué`, sub: "Action requise", nav: "projects", data: p });
    if (p.risk === "at_risk") alerts.push({ type: "at_risk", priority: "high", label: `"${p.name}" à risque`, sub: p.next_action, nav: "projects", data: p });
  });
  return [...new Map(alerts.map(a => [a.label, a])).values()].slice(0, 5);
}

function getSuggestions(data) {
  const s = [];
  data.projects.forEach(p => {
    const hasTasks = data.tasks.some(t => t.project_id === p.id && t.status !== "done");
    if (!hasTasks && p.status === "active") s.push({ icon: "⚠", label: `"${p.name}" n'a pas de tâches actives`, action: "Ajouter une tâche" });
  });
  data.clients.forEach(c => {
    const hasActive = data.projects.some(p => p.client_id === c.id && p.status === "active");
    if (!hasActive) s.push({ icon: "💤", label: `${c.name} — aucun projet actif`, action: "Créer un projet" });
  });
  return s.slice(0, 3);
}

const makeLeadForm = (team = []) => ({
  name: "",
  company: "",
  contact: "",
  value: "",
  status: "new",
  pilote_id: team[0]?.id || "",
  next_date: "",
  notes: "",
});

const makeProjectForm = () => ({
  name: "",
  deadline: "",
  budget: "",
  brief: "",
});

const makeTaskForm = (team = []) => ({
  name: "",
  status: "todo",
  priority: "normal",
  assignee_id: team[0]?.id || "",
  deadline: "",
});

const makeDeliverableForm = () => ({
  name: "",
  status: "pending",
  deadline: "",
  file_url: "",
  visible_client: false,
});

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────
function HomeScreen({ data, user, setNav, openProject }) {
  const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 };
  const urgentTasks = [...data.tasks]
    .filter((task) => task.status !== "done")
    .sort((left, right) => {
      const leftLate = isOverdue(left.deadline, left.status) ? 0 : 1;
      const rightLate = isOverdue(right.deadline, right.status) ? 0 : 1;
      if (leftLate !== rightLate) return leftLate - rightLate;

      const leftPriority = priorityRank[left.priority] ?? 99;
      const rightPriority = priorityRank[right.priority] ?? 99;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;

      const leftDate = left.deadline ? new Date(left.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDate = right.deadline ? new Date(right.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate;
    })
    .slice(0, 4);
  const activeProjects = data.projects.filter((project) => project.status === "active").slice(0, 4);
  const upcoming = data.calendar.slice(0, 4);
  const suggestions = getSuggestions(data);
  const hour = new Date().getHours();
  const greeting = hour < 18 ? "Bonjour" : "Bonsoir";

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingBottom: 100 }}>
      <div style={{ padding: "56px 20px 0", background: T.bg }}>
        <div className="a0" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <Mn v="WITH NOMA OS" s={{ fontSize: 10, color: T.gold, letterSpacing: "0.2em", display: "block", marginBottom: 6 }} />
            <Pl v={`${greeting}, ${user.name}`} s={{ fontSize: 26, fontWeight: 600, color: T.ink, display: "block", lineHeight: 1.2 }} />
            <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
          <Avatar name={user.name} color={user.color || T.gold} size={40} />
        </div>

        {urgentTasks.length > 0 && (
          <div className="a1" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.red, animation: "pulse 2s infinite" }} />
              <Mn v="À faire maintenant" s={{ fontSize: 10, color: T.red, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {urgentTasks.map((task) => {
                const priority = TASK_PRIORITY[task.priority];
                const dayDelta = daysLeft(task.deadline);
                const late = isOverdue(task.deadline, task.status);
                const member = data.team.find((teamMember) => teamMember.id === task.assignee_id || teamMember.name === task.assignee);
                return (
                  <Card key={task.id} onClick={() => openProject(task.project_id)} style={{ padding: "14px 16px", borderLeft: `3px solid ${late ? T.red : T.gold}` }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Dot color={late ? T.red : T.gold} size={8} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.name}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                          <Badge label={priority.l} color={priority.c} bg={priority.bg} />
                          {task.deadline && <Mn v={late ? `⚠ ${Math.abs(dayDelta)}j retard` : dayDelta === 0 ? "Aujourd'hui" : `J-${dayDelta}`} s={{ fontSize: 10, color: late ? T.red : T.muted }} />}
                        </div>
                      </div>
                      <Avatar name={task.assignee} color={member?.color || T.muted} size={24} />
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "0 20px" }}>
        <div className="a2" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Mn v="Projets actifs" s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.14em" }} />
            <button onClick={() => setNav("projects")} style={{ fontSize: 12, color: T.gold, fontWeight: 600 }}>Voir tout →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeProjects.map((project) => {
              const phase = PROJECT_PHASE[project.phase];
              const risk = PROJECT_RISK[project.risk];
              return (
                <Card key={project.id} onClick={() => openProject(project.id)} style={{ padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 3 }}>{project.name}</div>
                      {project.client && <div style={{ fontSize: 11, color: T.muted }}>{project.client.name}</div>}
                    </div>
                    <Badge label={risk.l} color={risk.c} bg={`${risk.c}15`} />
                  </div>
                  <ProgressBar value={project.progress} color={risk.c === T.red ? T.red : T.gold} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: T.muted, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: phase.c, fontWeight: 600 }}>{phase.l}</span>
                      {project.deadline && <span> · J-{daysLeft(project.deadline)}</span>}
                    </div>
                    <Mn v={`${project.progress}%`} s={{ fontSize: 11, color: T.gold, fontWeight: 600 }} />
                  </div>
                  {project.next_action && (
                    <div style={{ marginTop: 10, padding: "8px 10px", background: T.goldBg, borderRadius: T.rSm, fontSize: 11, color: T.gold, fontWeight: 500 }}>
                      → {project.next_action}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {upcoming.length > 0 && (
          <div className="a3" style={{ marginBottom: 24 }}>
            <Mn v="À venir cette semaine" s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.14em", display: "block", marginBottom: 12 }} />
            <Card style={{ overflow: "hidden" }}>
              {upcoming.map((item, index) => (
                <div key={item.id} style={{ padding: "13px 16px", borderBottom: index < upcoming.length - 1 ? `1px solid ${T.border}` : "none", display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: T.rSm, background: T.goldBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Mn v={new Date(item.date).getDate()} s={{ fontSize: 14, fontWeight: 700, color: T.gold, lineHeight: 1 }} />
                    <Mn v={new Date(item.date).toLocaleDateString("fr-FR", { month: "short" })} s={{ fontSize: 8, color: T.muted }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                    {item.time && <Mn v={item.time} s={{ fontSize: 10, color: T.muted }} />}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        <div className="a3" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Mn v="Pipeline" s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.14em" }} />
            <button onClick={() => setNav("pipeline")} style={{ fontSize: 12, color: T.gold, fontWeight: 600 }}>Voir tout →</button>
          </div>
          <div style={{ display: "flex", gap: 8, overflow: "auto", paddingBottom: 4 }}>
            {data.leads.filter((lead) => lead.status !== "lost").slice(0, 4).map((lead) => {
              const status = LEAD_STATUS[lead.status];
              return (
                <Card key={lead.id} onClick={() => setNav("pipeline")} style={{ padding: "14px", minWidth: 160, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, marginBottom: 4 }}>{lead.name}</div>
                  <Badge label={status.l} color={status.c} bg={`${status.c}15`} />
                  <div style={{ marginTop: 8 }}>
                    <Mn v={`${parseFloat(lead.value || 0).toLocaleString("fr-FR")} MAD`} s={{ fontSize: 12, color: T.gold, fontWeight: 600 }} />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {suggestions.length > 0 && (
          <div className="a4">
            <Mn v="Suggestions" s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.14em", display: "block", marginBottom: 12 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {suggestions.map((suggestion, index) => (
                <div key={index} style={{ display: "flex", gap: 10, padding: "12px 14px", background: T.bg2, borderRadius: T.r, border: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 18 }}>{suggestion.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: T.ink2, marginBottom: 2 }}>{suggestion.label}</div>
                    <div style={{ fontSize: 11, color: T.gold, fontWeight: 600 }}>{suggestion.action}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PIPELINE SCREEN ─────────────────────────────────────────────────────────
function PipelineScreen({ data, actions, openClient }) {
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(makeLeadForm(data.team));
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!form.pilote_id && data.team.length > 0) {
      setForm(current => ({ ...current, pilote_id: data.team[0].id }));
    }
  }, [data.team, form.pilote_id]);

  const openCreate = () => {
    setEdit(null);
    setActionError("");
    setForm(makeLeadForm(data.team));
    setModal(true);
  };

  const openEdit = (lead) => {
    setEdit(lead);
    setActionError("");
    setForm({
      name: lead.name || "",
      company: lead.company || "",
      contact: lead.contact || "",
      value: lead.value || "",
      status: lead.status || "new",
      pilote_id: lead.pilote_id || data.team[0]?.id || "",
      next_date: lead.next_date || "",
      notes: lead.notes || "",
    });
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setActionError("Le nom du lead est requis.");
      return;
    }

    setSaving(true);
    setActionError("");

    try {
      if (edit) {
        await actions.updateLead(edit.id, form, edit.client_status || "prospect");
      } else {
        await actions.createLead(form);
      }
      setModal(false);
      setEdit(null);
    } catch (error) {
      setActionError(error.message || "Impossible d'enregistrer le lead.");
    } finally {
      setSaving(false);
    }
  };

  const convertToClient = async (lead) => {
    setSaving(true);
    setActionError("");

    try {
      await actions.convertLeadToClient(lead.id);
      openClient(lead.id);
    } catch (error) {
      setActionError(error.message || "Impossible de convertir ce lead en client.");
    } finally {
      setSaving(false);
    }
  };

  const removeLead = async () => {
    if (!edit) {
      return;
    }

    setSaving(true);
    setActionError("");

    try {
      await actions.deleteLead(edit.id);
      setModal(false);
      setEdit(null);
    } catch (error) {
      setActionError(error.message || "Impossible de supprimer ce lead.");
    } finally {
      setSaving(false);
    }
  };

  const totalValue = data.leads.filter(l => l.status !== "lost").reduce((s, l) => s + parseFloat(l.value || 0), 0);
  const wonValue = data.leads.filter(l => l.status === "won").reduce((s, l) => s + parseFloat(l.value || 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingBottom: 100 }}>
      <div style={{ padding: "56px 20px 0" }}>
        <div className="a0" style={{ marginBottom: 24 }}>
          <Mn v="Commercial" s={{ fontSize: 10, color: T.gold, letterSpacing: "0.2em", display: "block", marginBottom: 6 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <Pl v="Pipeline" s={{ fontSize: 28, fontWeight: 600, color: T.ink }} />
            <Btn label="+ Lead" sm onClick={openCreate} />
          </div>
        </div>

        {actionError && (
          <div className="a1" style={{ padding: "12px 14px", background: T.redBg, border: `1px solid ${T.red}22`, borderRadius: T.rSm, fontSize: 12, color: T.red, marginBottom: 16 }}>
            {actionError}
          </div>
        )}

        {/* Stats */}
        <div className="a1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          {[
            { l: "Pipeline total", v: `${totalValue.toLocaleString("fr-FR")} MAD`, c: T.gold },
            { l: "Gagné", v: `${wonValue.toLocaleString("fr-FR")} MAD`, c: T.green },
          ].map(k => (
            <Card key={k.l} style={{ padding: "16px" }}>
              <Mn v={k.l} s={{ fontSize: 10, color: T.muted, display: "block", marginBottom: 6 }} />
              <Pl v={k.v} s={{ fontSize: 18, fontWeight: 600, color: k.c }} />
            </Card>
          ))}
        </div>

        {/* Kanban */}
        {Object.entries(LEAD_STATUS).map(([statusId, statusDef]) => {
          const leads = data.leads.filter(l => l.status === statusId);
          if (leads.length === 0 && statusId === "lost") return null;
          return (
            <div key={statusId} className="a2" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                <Dot color={statusDef.c} size={7} />
                <Mn v={statusDef.l} s={{ fontSize: 11, color: statusDef.c, fontWeight: 600, letterSpacing: "0.06em" }} />
                <span style={{ fontSize: 11, color: T.muted }}>({leads.length})</span>
              </div>
              {leads.length === 0 ? (
                <div style={{ padding: "14px", textAlign: "center", background: T.bg2, borderRadius: T.r, border: `1px dashed ${T.border}` }}>
                  <span style={{ fontSize: 12, color: T.muted }}>Aucun lead</span>
                </div>
              ) : (
                leads.map(l => (
                  <Card key={l.id} onClick={() => openEdit(l)} style={{ padding: "16px", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 2 }}>{l.name}</div>
                        <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>{l.company} · {l.contact}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Pl v={`${parseFloat(l.value || 0).toLocaleString("fr-FR")} MAD`} s={{ fontSize: 13, fontWeight: 600, color: T.gold }} />
                          {l.next_date && <Mn v={`RDV ${fDate(l.next_date)}`} s={{ fontSize: 10, color: T.muted }} />}
                        </div>
                      </div>
                      <Avatar name={l.pilote} color={data.team.find(m => m.id === l.pilote_id || m.name === l.pilote)?.color || T.gold} size={28} />
                    </div>
                    {l.status !== "won" && l.status !== "lost" && (
                      <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                        <button disabled={saving} onClick={e => { e.stopPropagation(); void convertToClient(l); }} style={{ fontSize: 11, color: T.green, fontWeight: 600, background: T.greenBg, padding: "6px 12px", borderRadius: 20, border: `1px solid ${T.green}22`, opacity: saving ? 0.5 : 1 }}>
                          → Convertir en client
                        </button>
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>
          );
        })}
      </div>

      {modal && (
        <Modal title={edit ? "Modifier lead" : "Nouveau lead"} onClose={() => { setModal(false); setEdit(null); }}>
          {actionError && <div style={{ fontSize: 12, color: T.red, marginBottom: 12 }}>{actionError}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Input label="Nom" value={form.name} onChange={e => sf("name", e.target.value)} placeholder="Dar Yacout" />
            <Input label="Entreprise" value={form.company} onChange={e => sf("company", e.target.value)} placeholder="Secteur" />
            <Input label="Contact" value={form.contact} onChange={e => sf("contact", e.target.value)} placeholder="Nom contact" />
            <Input label="Budget estimé (MAD)" value={form.value} onChange={e => sf("value", e.target.value)} placeholder="3000" />
            <Select label="Statut" value={form.status} onChange={e => sf("status", e.target.value)} options={Object.entries(LEAD_STATUS).map(([k, v]) => ({ value: k, label: v.l }))} />
            <Select label="Pilote" value={form.pilote_id} onChange={e => sf("pilote_id", e.target.value)} options={data.team.map(member => ({ value: member.id, label: member.name }))} />
          </div>
          <Input label="Prochain RDV" value={form.next_date} onChange={e => sf("next_date", e.target.value)} type="date" />
          <Input label="Notes" value={form.notes} onChange={e => sf("notes", e.target.value)} multiline placeholder="Contexte, source..." />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            {edit && <Btn label="Supprimer" v="danger" sm onClick={() => void removeLead()} disabled={saving} />}
            <Btn label="Annuler" v="ghost" sm onClick={() => { setModal(false); setEdit(null); }} />
            <Btn label={saving ? "En cours…" : edit ? "Enregistrer" : "Créer"} sm onClick={() => void save()} disabled={saving} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── CLIENTS SCREEN ──────────────────────────────────────────────────────────
function ClientsScreen({ data, actions, selectedClientId, onClientSelected, openProject }) {
  const [sel, setSel] = useState(selectedClientId || null);
  const [tab, setTab] = useState("overview");
  const [vaultReveal, setVaultReveal] = useState({});
  const [modal, setModal] = useState(false);
  const [projectForm, setProjectForm] = useState(makeProjectForm());
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  const client = sel ? data.clients.find(c => c.id === sel) : null;
  const clientProjects = client ? data.projects.filter(p => p.client_id === client.id) : [];
  const clientFiles = client ? data.files.filter(f => f.client_id === client.id) : [];
  const clientVault = client ? data.vault.filter(v => v.client_id === client.id) : [];
  const clientTasks = client ? data.tasks.filter(t => t.client_id === client.id && t.status !== "done") : [];

  const fileIcon = t => ({ document: "📄", template: "🎨", creative_asset: "✨", image: "🖼", video: "🎬", link: "🔗" })[t] || "📄";
  const platformIcon = p => ({ Instagram: "📸", Facebook: "👤", TikTok: "🎵", LinkedIn: "💼", Google_Business: "🗺", Tripadvisor: "⭐", email: "✉️", domain: "🌐", CMS: "⚙️", Snapchat: "👻", WhatsApp_Business: "💬" })[p] || "🔑";

  useEffect(() => {
    if (selectedClientId) {
      setSel(selectedClientId);
    }
  }, [selectedClientId]);

  const openClient = (clientId) => {
    setSel(clientId);
    onClientSelected?.(clientId);
  };

  const resetProjectModal = () => {
    setProjectForm(makeProjectForm());
    setActionError("");
    setModal(true);
  };

  const openFile = (file) => {
    if (file.file_url) {
      window.open(file.file_url, "_blank", "noopener,noreferrer");
    }
  };

  const saveProject = async () => {
    if (!client || !projectForm.name.trim()) {
      setActionError("Le nom du projet est requis.");
      return;
    }

    setSaving(true);
    setActionError("");

    try {
      const createdProject = await actions.createProject(client.id, projectForm);
      setModal(false);
      setProjectForm(makeProjectForm());
      if (createdProject?.id) {
        openProject(createdProject.id);
      }
    } catch (error) {
      setActionError(error.message || "Impossible de créer ce projet.");
    } finally {
      setSaving(false);
    }
  };

  if (client) {
    const tabs = ["overview", "projects", "files", "vault", "notes"];
    const tabLabels = { overview: "Vue d'ensemble", projects: "Projets", files: "Fichiers", vault: "Accès", notes: "Notes" };
    return (
      <div style={{ minHeight: "100vh", background: T.bg, paddingBottom: 100 }}>
        {/* Header */}
        <div style={{ padding: "56px 20px 0", background: T.card, borderBottom: `1px solid ${T.border}` }}>
          <div className="a0" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <button onClick={() => { setSel(null); onClientSelected?.(null); setTab("overview"); }} style={{ color: T.muted, fontSize: 20, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
            <div style={{ width: 44, height: 44, borderRadius: T.r, background: `${client.color}18`, border: `1.5px solid ${client.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{client.name[0]}</div>
            <div style={{ flex: 1 }}>
              <Pl v={client.name} s={{ fontSize: 18, fontWeight: 600, color: T.ink, display: "block" }} />
              <div style={{ fontSize: 12, color: T.muted }}>{client.sector}</div>
            </div>
          </div>
          <div className="scrollx" style={{ display: "flex", gap: 4, paddingBottom: 1 }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: "9px 14px", borderRadius: "10px 10px 0 0", fontSize: 12, fontWeight: tab === t ? 600 : 400, color: tab === t ? T.gold : T.muted, borderBottom: tab === t ? `2px solid ${T.gold}` : "2px solid transparent", whiteSpace: "nowrap", background: "transparent", transition: "all 0.15s" }}>{tabLabels[t]}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: "20px 20px 0" }}>
          {actionError && (
            <div className="fi" style={{ padding: "12px 14px", background: T.redBg, border: `1px solid ${T.red}22`, borderRadius: T.rSm, fontSize: 12, color: T.red, marginBottom: 14 }}>
              {actionError}
            </div>
          )}
          {tab === "overview" && (
            <div className="fi">
              <Card style={{ padding: "20px", marginBottom: 14 }}>
                <Mn v="Contact" s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 12 }} />
                {[
                  { icon: "👤", label: client.contact },
                  { icon: "✉️", label: client.email },
                  { icon: "📞", label: client.phone },
                ].filter(r => r.label).map(r => (
                  <div key={r.label} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 16 }}>{r.icon}</span>
                    <span style={{ fontSize: 13, color: T.ink2 }}>{r.label}</span>
                  </div>
                ))}
                {client.whatsapp && (
                  <a href={client.whatsapp} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: T.green, fontWeight: 600, background: T.greenBg, padding: "8px 14px", borderRadius: 20, textDecoration: "none" }}>
                    💬 Ouvrir WhatsApp
                  </a>
                )}
              </Card>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                {[
                  { l: "Projets", v: clientProjects.length, c: T.gold },
                  { l: "Tâches", v: clientTasks.length, c: T.blue },
                  { l: "Fichiers", v: clientFiles.length, c: T.purple },
                ].map(k => (
                  <Card key={k.l} style={{ padding: "14px", textAlign: "center" }}>
                    <Pl v={k.v} s={{ fontSize: 24, fontWeight: 600, color: k.c, display: "block" }} />
                    <Mn v={k.l} s={{ fontSize: 10, color: T.muted }} />
                  </Card>
                ))}
              </div>

              {clientTasks.length > 0 && (
                <Card style={{ padding: "18px" }}>
                  <Mn v="Tâches en cours" s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 12 }} />
                  {clientTasks.slice(0, 4).map(task => (
                    <div key={task.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.name}</div>
                        <Mn v={task.assignee || "Non assigné"} s={{ fontSize: 10, color: T.muted }} />
                      </div>
                      {task.deadline && <Mn v={fDate(task.deadline)} s={{ fontSize: 10, color: T.gold }} />}
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}

          {tab === "projects" && (
            <div className="fi">
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <Btn label="+ Projet" sm onClick={resetProjectModal} />
              </div>
              {clientProjects.length === 0 ? <EmptyState icon="📁" title="Aucun projet" sub="Ce client n'a pas encore de projet." action={<Btn label="+ Créer un projet" sm onClick={resetProjectModal} />} /> : (
                clientProjects.map(p => {
                  const ph = PROJECT_PHASE[p.phase]; const rk = PROJECT_RISK[p.risk];
                  return (
                    <Card key={p.id} onClick={() => openProject(p.id)} style={{ padding: "16px", marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                        <Pl v={p.name} s={{ fontSize: 15, fontWeight: 600, color: T.ink }} />
                        <Badge label={rk.l} color={rk.c} bg={`${rk.c}15`} />
                      </div>
                      <ProgressBar value={p.progress} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: ph.c, fontWeight: 600 }}>{ph.l}</span>
                        <Mn v={`${p.progress}%`} s={{ fontSize: 11, color: T.gold }} />
                      </div>
                      {p.next_action && <div style={{ marginTop: 8, fontSize: 11, color: T.gold, background: T.goldBg, padding: "6px 10px", borderRadius: T.rSm }}>→ {p.next_action}</div>}
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {tab === "files" && (
            <div className="fi">
              {clientFiles.length === 0 ? <EmptyState icon="📎" title="Aucun fichier" sub="Aucun fichier partagé pour ce client." /> : (
                clientFiles.map(f => (
                  <Card key={f.id} onClick={() => openFile(f)} style={{ padding: "14px", marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: T.rSm, background: T.goldBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{fileIcon(f.type)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                      <Mn v={`${f.size} · ${fDate(f.date)}`} s={{ fontSize: 10, color: T.muted }} />
                    </div>
                    <button onClick={(event) => { event.stopPropagation(); openFile(f); }} disabled={!f.file_url} style={{ fontSize: 16, color: T.gold, opacity: f.file_url ? 1 : 0.35 }}>↓</button>
                  </Card>
                ))
              )}
            </div>
          )}

          {tab === "vault" && (
            <div className="fi">
              <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px", background: T.redBg, borderRadius: T.rSm, marginBottom: 16, border: `1px solid ${T.red}22` }}>
                <span style={{ fontSize: 14 }}>🔒</span>
                <span style={{ fontSize: 11, color: T.red }}>Accès confidentiels — usage interne uniquement</span>
              </div>
              {clientVault.length === 0 ? <EmptyState icon="🔑" title="Aucun accès" sub="Aucun identifiant enregistré pour ce client." /> : (
                clientVault.map(v => (
                  <Card key={v.id} style={{ padding: "16px", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontSize: 22 }}>{platformIcon(v.platform)}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{v.platform}</div>
                        {v.url && <div style={{ fontSize: 11, color: T.muted }}>{v.url}</div>}
                      </div>
                    </div>
                    <div style={{ background: T.bg, borderRadius: T.rSm, padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <Mn v="Login" s={{ fontSize: 10, color: T.muted }} />
                        <span style={{ fontSize: 12, color: T.ink2 }}>{v.login}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Mn v="Password" s={{ fontSize: 10, color: T.muted }} />
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: T.ink2, fontFamily: "monospace" }}>
                            {vaultReveal[v.id] ? v.password : "••••••••"}
                          </span>
                          <button onClick={() => setVaultReveal(r => ({ ...r, [v.id]: !r[v.id] }))} style={{ fontSize: 10, color: T.gold, fontWeight: 600, background: T.goldBg, padding: "3px 8px", borderRadius: 6 }}>
                            {vaultReveal[v.id] ? "Cacher" : "Voir"}
                          </button>
                          <button onClick={() => navigator.clipboard?.writeText(v.password)} style={{ fontSize: 10, color: T.blue, fontWeight: 600, background: T.blueBg, padding: "3px 8px", borderRadius: 6 }}>Copier</button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {tab === "notes" && (
            <div className="fi">
              <Card style={{ padding: "20px" }}>
                <Mn v="Notes internes" s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 12 }} />
                <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.8, whiteSpace: "pre-line" }}>{client.notes || "Aucune note."}</div>
              </Card>
            </div>
          )}
          {modal && (
            <Modal title="Nouveau projet" subtitle={`Client · ${client.name}`} onClose={() => setModal(false)}>
              {actionError && <div style={{ fontSize: 12, color: T.red, marginBottom: 12 }}>{actionError}</div>}
              <Input label="Nom du projet" value={projectForm.name} onChange={(event) => setProjectForm(current => ({ ...current, name: event.target.value }))} placeholder="Social Media Avril" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                <Input label="Échéance" value={projectForm.deadline} onChange={(event) => setProjectForm(current => ({ ...current, deadline: event.target.value }))} type="date" />
                <Input label="Budget (MAD)" value={projectForm.budget} onChange={(event) => setProjectForm(current => ({ ...current, budget: event.target.value }))} placeholder="4500" />
              </div>
              <Input label="Brief" value={projectForm.brief} onChange={(event) => setProjectForm(current => ({ ...current, brief: event.target.value }))} multiline placeholder="Objectif, livrables, contexte client…" />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Btn label="Annuler" v="ghost" sm onClick={() => setModal(false)} />
                <Btn label={saving ? "Création…" : "Créer le projet"} sm onClick={() => void saveProject()} disabled={saving} />
              </div>
            </Modal>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingBottom: 100 }}>
      <div style={{ padding: "56px 20px 0" }}>
        <div className="a0" style={{ marginBottom: 24 }}>
          <Mn v="Gestion" s={{ fontSize: 10, color: T.gold, letterSpacing: "0.2em", display: "block", marginBottom: 6 }} />
          <Pl v="Clients" s={{ fontSize: 28, fontWeight: 600, color: T.ink }} />
        </div>
        {data.clients.length === 0 ? (
          <EmptyState icon="◉" title="Aucun client actif" sub="Convertissez un lead pour créer votre premier client." />
        ) : (
          <div className="a1" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.clients.map(c => {
              const projects = data.projects.filter(p => p.client_id === c.id && p.status === "active");
              const tasks = data.tasks.filter(t => t.client_id === c.id && t.status !== "done");
              return (
                <Card key={c.id} onClick={() => openClient(c.id)} style={{ padding: "18px" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ width: 46, height: 46, borderRadius: T.r, background: `${c.color}18`, border: `1.5px solid ${c.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{c.name[0]}</div>
                    <div style={{ flex: 1 }}>
                      <Pl v={c.name} s={{ fontSize: 16, fontWeight: 600, color: T.ink, display: "block", marginBottom: 2 }} />
                      <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>{c.sector}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Badge label={`${projects.length} projet${projects.length > 1 ? "s" : ""}`} color={T.gold} bg={T.goldBg} />
                        {tasks.length > 0 && <Badge label={`${tasks.length} tâche${tasks.length > 1 ? "s" : ""}`} color={T.blue} bg={T.blueBg} />}
                      </div>
                    </div>
                    <span style={{ fontSize: 16, color: T.muted }}>›</span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PROJECTS SCREEN ─────────────────────────────────────────────────────────
function ProjectsScreen({ data, actions, selectedProjectId, onProjectSelected }) {
  const [sel, setSel] = useState(selectedProjectId || null);
  const [tab, setTab] = useState("tasks");
  const [taskModal, setTaskModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [deliverableModal, setDeliverableModal] = useState(false);
  const [tf, setTf] = useState(makeTaskForm(data.team));
  const [deliverableForm, setDeliverableForm] = useState(makeDeliverableForm());
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const stf = (k, v) => setTf(p => ({ ...p, [k]: v }));
  const sdf = (k, v) => setDeliverableForm(p => ({ ...p, [k]: v }));

  const project = sel ? data.projects.find(p => p.id === sel) : null;

  useEffect(() => {
    if (selectedProjectId) {
      setSel(selectedProjectId);
      setTab("tasks");
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (!tf.assignee_id && data.team.length > 0) {
      setTf(current => ({ ...current, assignee_id: data.team[0].id }));
    }
  }, [data.team, tf.assignee_id]);

  const openTaskEditor = (task = null) => {
    setActionError("");
    setEditTask(task);
    setTf(task ? {
      name: task.name || "",
      status: task.status || "todo",
      priority: task.priority || "normal",
      assignee_id: task.assignee_id || data.team[0]?.id || "",
      deadline: task.deadline || "",
    } : makeTaskForm(data.team));
    setTaskModal(true);
  };

  const saveTask = async () => {
    if (!project || !tf.name.trim()) {
      setActionError("Le nom de la tâche est requis.");
      return;
    }

    setSaving(true);
    setActionError("");

    try {
      await actions.saveTask(project.id, project.client_id, tf, editTask?.id || null);
      setTaskModal(false);
      setEditTask(null);
    } catch (error) {
      setActionError(error.message || "Impossible d'enregistrer la tâche.");
    } finally {
      setSaving(false);
    }
  };

  const removeTask = async () => {
    if (!editTask || !project) {
      return;
    }

    setSaving(true);
    setActionError("");

    try {
      await actions.deleteTask(editTask.id, project.id);
      setTaskModal(false);
      setEditTask(null);
    } catch (error) {
      setActionError(error.message || "Impossible de supprimer cette tâche.");
    } finally {
      setSaving(false);
    }
  };

  const cycleStatus = async (task) => {
    setSaving(true);
    setActionError("");

    try {
      await actions.cycleTaskStatus(task);
    } catch (error) {
      setActionError(error.message || "Impossible de mettre à jour le statut.");
    } finally {
      setSaving(false);
    }
  };

  const saveDeliverable = async () => {
    if (!project || !deliverableForm.name.trim()) {
      setActionError("Le nom du livrable est requis.");
      return;
    }

    setSaving(true);
    setActionError("");

    try {
      await actions.saveDeliverable(project.id, project.client_id, deliverableForm);
      setDeliverableModal(false);
      setDeliverableForm(makeDeliverableForm());
    } catch (error) {
      setActionError(error.message || "Impossible d'ajouter ce livrable.");
    } finally {
      setSaving(false);
    }
  };

  const openFile = (file) => {
    if (file.file_url) {
      window.open(file.file_url, "_blank", "noopener,noreferrer");
    }
  };

  if (project) {
    const pTasks = data.tasks.filter(t => t.project_id === project.id);
    const pDelivs = data.deliverables.filter(d => d.project_id === project.id);
    const pFiles = data.files.filter(f => f.project_id === project.id);
    const client = data.clients.find(c => c.id === project.client_id);
    const ph = PROJECT_PHASE[project.phase]; const rk = PROJECT_RISK[project.risk];
    const done = pTasks.filter(t => t.status === "done").length;

    return (
      <div style={{ minHeight: "100vh", background: T.bg, paddingBottom: 100 }}>
        <div style={{ padding: "56px 20px 0", background: T.card, borderBottom: `1px solid ${T.border}` }}>
          <div className="a0" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <button onClick={() => { setSel(null); onProjectSelected?.(null); setTab("tasks"); }} style={{ color: T.muted, fontSize: 20, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                <Pl v={project.name} s={{ fontSize: 18, fontWeight: 600, color: T.ink }} />
                <Badge label={rk.l} color={rk.c} bg={`${rk.c}15`} />
              </div>
              {client && <div style={{ fontSize: 12, color: T.muted }}>{client.name} · <span style={{ color: ph.c }}>{ph.l}</span></div>}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <Mn v={`${done}/${pTasks.length} tâches`} s={{ fontSize: 10, color: T.muted }} />
              <Mn v={`${project.progress}%`} s={{ fontSize: 10, color: T.gold, fontWeight: 600 }} />
            </div>
            <ProgressBar value={project.progress} />
          </div>
          {project.next_action && (
            <div style={{ marginBottom: 12, padding: "8px 12px", background: T.goldBg, borderRadius: T.rSm, fontSize: 12, color: T.gold, fontWeight: 500 }}>→ {project.next_action}</div>
          )}
          <div className="scrollx" style={{ display: "flex", gap: 4 }}>
            {["tasks", "deliverables", "files"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: "9px 14px", borderRadius: "10px 10px 0 0", fontSize: 12, fontWeight: tab === t ? 600 : 400, color: tab === t ? T.gold : T.muted, borderBottom: tab === t ? `2px solid ${T.gold}` : "2px solid transparent", whiteSpace: "nowrap", background: "transparent" }}>
                {{ tasks: "Tâches", deliverables: "Livrables", files: "Fichiers" }[t]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: "16px 20px 0" }}>
          {actionError && (
            <div className="fi" style={{ padding: "12px 14px", background: T.redBg, border: `1px solid ${T.red}22`, borderRadius: T.rSm, fontSize: 12, color: T.red, marginBottom: 12 }}>
              {actionError}
            </div>
          )}
          {tab === "tasks" && (
            <div className="fi">
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <Btn label="+ Tâche" sm onClick={() => openTaskEditor()} />
              </div>
              {pTasks.length === 0 ? <EmptyState icon="✓" title="Aucune tâche" sub="Créez la première tâche de ce projet." /> : (
                pTasks.map(t => {
                  const st = TASK_STATUS[t.status]; const pr = TASK_PRIORITY[t.priority];
                  const d = daysLeft(t.deadline); const late = isOverdue(t.deadline, t.status);
                  return (
                    <div key={t.id} style={{ display: "flex", gap: 10, padding: "13px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
                      <button onClick={() => void cycleStatus(t)} style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${st.c}`, background: t.status === "done" ? st.c : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff", fontSize: 11 }}>
                        {t.status === "done" ? "✓" : ""}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: t.status === "done" ? T.muted : T.ink, textDecoration: t.status === "done" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                          <Badge label={pr.l} color={pr.c} bg={pr.bg} />
                          <Badge label={st.l} color={st.c} bg={st.bg} />
                          {t.deadline && <Mn v={late ? `⚠ ${Math.abs(d)}j` : d === 0 ? "Auj." : `J-${d}`} s={{ fontSize: 10, color: late ? T.red : T.muted }} />}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        <Avatar name={t.assignee} color={data.team.find(m => m.id === t.assignee_id || m.name === t.assignee)?.color || T.muted} size={22} />
                        <button onClick={() => openTaskEditor(t)} style={{ color: T.muted, fontSize: 14, width: 22, height: 22 }}>✎</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === "deliverables" && (
            <div className="fi">
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <Btn label="+ Livrable" sm onClick={() => { setActionError(""); setDeliverableForm(makeDeliverableForm()); setDeliverableModal(true); }} />
              </div>
              {pDelivs.length === 0 ? <EmptyState icon="📦" title="Aucun livrable" sub="Aucun livrable défini pour ce projet." /> : (
                pDelivs.map(d => {
                  const st = DELIV_STATUS[d.status];
                  return (
                    <Card key={d.id} style={{ padding: "16px", marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: T.ink, marginBottom: 6 }}>{d.name}</div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <Badge label={st.l} color={st.c} bg={st.bg} />
                            {d.deadline && <Mn v={fDate(d.deadline)} s={{ fontSize: 10, color: T.muted }} />}
                          </div>
                        </div>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${st.c}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                          {{ pending: "⏳", in_progress: "🔄", delivered: "📬", validated: "✅" }[d.status]}
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {tab === "files" && (
            <div className="fi">
              {pFiles.length === 0 ? <EmptyState icon="📎" title="Aucun fichier" sub="Aucun fichier pour ce projet." /> : (
                pFiles.map(f => (
                  <Card key={f.id} onClick={() => openFile(f)} style={{ padding: "14px", marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: T.rSm, background: T.goldBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                      {{ document: "📄", template: "🎨", creative_asset: "✨" }[f.type] || "📄"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                      <Mn v={`${f.size} · ${fDate(f.date)}`} s={{ fontSize: 10, color: T.muted }} />
                    </div>
                    <button onClick={(event) => { event.stopPropagation(); openFile(f); }} disabled={!f.file_url} style={{ fontSize: 16, color: T.gold, opacity: f.file_url ? 1 : 0.35 }}>↓</button>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>

        {taskModal && (
          <Modal title={editTask ? "Modifier tâche" : "Nouvelle tâche"} onClose={() => { setTaskModal(false); setEditTask(null); }}>
            {actionError && <div style={{ fontSize: 12, color: T.red, marginBottom: 12 }}>{actionError}</div>}
            <Input label="Nom" value={tf.name} onChange={e => stf("name", e.target.value)} placeholder="Nom de la tâche" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              <Select label="Statut" value={tf.status} onChange={e => stf("status", e.target.value)} options={Object.entries(TASK_STATUS).map(([k, v]) => ({ value: k, label: v.l }))} />
              <Select label="Priorité" value={tf.priority} onChange={e => stf("priority", e.target.value)} options={Object.entries(TASK_PRIORITY).map(([k, v]) => ({ value: k, label: v.l }))} />
              <Select label="Assigné" value={tf.assignee_id} onChange={e => stf("assignee_id", e.target.value)} options={data.team.map(m => ({ value: m.id, label: m.name }))} />
              <Input label="Deadline" value={tf.deadline} onChange={e => stf("deadline", e.target.value)} type="date" />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              {editTask && <Btn label="Supprimer" v="danger" sm onClick={() => void removeTask()} disabled={saving} />}
              <Btn label="Annuler" v="ghost" sm onClick={() => { setTaskModal(false); setEditTask(null); }} />
              <Btn label={saving ? "En cours…" : editTask ? "Enregistrer" : "Créer"} sm onClick={() => void saveTask()} disabled={saving} />
            </div>
          </Modal>
        )}

        {deliverableModal && (
          <Modal title="Nouveau livrable" subtitle={project.name} onClose={() => setDeliverableModal(false)}>
            {actionError && <div style={{ fontSize: 12, color: T.red, marginBottom: 12 }}>{actionError}</div>}
            <Input label="Nom" value={deliverableForm.name} onChange={e => sdf("name", e.target.value)} placeholder="Rapport mensuel Avril" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              <Select label="Statut" value={deliverableForm.status} onChange={e => sdf("status", e.target.value)} options={Object.entries(DELIV_STATUS).map(([key, current]) => ({ value: key, label: current.l }))} />
              <Input label="Échéance" value={deliverableForm.deadline} onChange={e => sdf("deadline", e.target.value)} type="date" />
            </div>
            <Input label="Lien du fichier" value={deliverableForm.file_url} onChange={e => sdf("file_url", e.target.value)} placeholder="https://…" />
            <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, fontSize: 13, color: T.ink2 }}>
              <input type="checkbox" checked={deliverableForm.visible_client} onChange={e => sdf("visible_client", e.target.checked)} />
              Visible dans l'espace client
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn label="Annuler" v="ghost" sm onClick={() => setDeliverableModal(false)} />
              <Btn label={saving ? "En cours…" : "Ajouter le livrable"} sm onClick={() => void saveDeliverable()} disabled={saving} />
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingBottom: 100 }}>
      <div style={{ padding: "56px 20px 0" }}>
        <div className="a0" style={{ marginBottom: 24 }}>
          <Mn v="Production" s={{ fontSize: 10, color: T.gold, letterSpacing: "0.2em", display: "block", marginBottom: 6 }} />
          <Pl v="Projets" s={{ fontSize: 28, fontWeight: 600, color: T.ink }} />
        </div>
        {["client", "internal"].map(type => {
          const projects = data.projects.filter(p => p.type === type && p.status === "active");
          if (projects.length === 0) return null;
          return (
            <div key={type} className="a1" style={{ marginBottom: 24 }}>
              <Mn v={type === "client" ? "Clients" : "Internes"} s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.14em", display: "block", marginBottom: 12 }} />
              {projects.map(p => {
                const client = data.clients.find(c => c.id === p.client_id);
                const ph = PROJECT_PHASE[p.phase]; const rk = PROJECT_RISK[p.risk];
                const tasks = data.tasks.filter(t => t.project_id === p.id);
                const done = tasks.filter(t => t.status === "done").length;
                return (
                  <Card key={p.id} onClick={() => { setSel(p.id); onProjectSelected?.(p.id); }} style={{ padding: "18px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ flex: 1, marginRight: 10 }}>
                        <Pl v={p.name} s={{ fontSize: 15, fontWeight: 600, color: T.ink, display: "block", marginBottom: 3 }} />
                        {client && <div style={{ fontSize: 12, color: T.muted }}>{client.name}</div>}
                      </div>
                      <Badge label={rk.l} color={rk.c} bg={`${rk.c}15`} />
                    </div>
                    <ProgressBar value={p.progress} color={rk.c === T.red ? T.red : T.gold} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontSize: 11, color: ph.c, fontWeight: 600 }}>{ph.l}</span>
                        <Mn v={`${done}/${tasks.length} tâches`} s={{ fontSize: 11, color: T.muted }} />
                      </div>
                      {p.deadline && <Mn v={`J-${daysLeft(p.deadline)}`} s={{ fontSize: 11, color: T.muted }} />}
                    </div>
                    {p.next_action && <div style={{ marginTop: 10, padding: "7px 10px", background: T.goldBg, borderRadius: T.rSm, fontSize: 11, color: T.gold }}>→ {p.next_action}</div>}
                  </Card>
                );
              })}
            </div>
          );
        })}
        {data.projects.filter(p => p.status === "active").length === 0 && (
          <EmptyState icon="◇" title="Aucun projet actif" sub="Créez un projet depuis une fiche client pour démarrer le flux." />
        )}
      </div>
    </div>
  );
}

// ─── CALENDAR SCREEN ─────────────────────────────────────────────────────────
function CalendarScreen({ data }) {
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
  });
  const fmt = d => d.toISOString().split("T")[0];
  const isToday = d => fmt(d) === fmt(now);
  const allEvents = data.calendar.map(e => ({ ...e, kind: "event", date: e.date }));
  const typeColor = { rdv: T.gold, production: T.purple, internal: T.green, deadline: T.red, event: T.blue };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingBottom: 100 }}>
      <div style={{ padding: "56px 20px 0" }}>
        <div className="a0" style={{ marginBottom: 20 }}>
          <Mn v="Planning" s={{ fontSize: 10, color: T.gold, letterSpacing: "0.2em", display: "block", marginBottom: 6 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Pl v={weekStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} s={{ fontSize: 22, fontWeight: 600, color: T.ink, textTransform: "capitalize" }} />
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setOffset(o => o - 1)} style={{ width: 32, height: 32, borderRadius: T.rSm, background: T.bg2, border: `1px solid ${T.border}`, color: T.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
              <button onClick={() => setOffset(0)} style={{ padding: "0 12px", height: 32, borderRadius: T.rSm, background: T.bg2, border: `1px solid ${T.border}`, color: T.muted, fontSize: 11, fontWeight: 600 }}>Auj.</button>
              <button onClick={() => setOffset(o => o + 1)} style={{ width: 32, height: 32, borderRadius: T.rSm, background: T.bg2, border: `1px solid ${T.border}`, color: T.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>→</button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 20 }}>
          {days.map(day => {
            const isT = isToday(day);
            const dayStr = fmt(day);
            const evs = allEvents.filter(e => e.date === dayStr);
            return (
              <div key={dayStr}>
                <div style={{ textAlign: "center", marginBottom: 6 }}>
                  <Mn v={day.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 2).toUpperCase()} s={{ fontSize: 9, color: T.muted, display: "block", marginBottom: 3 }} />
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: isT ? T.gold : "transparent", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 12, fontWeight: isT ? 700 : 400, color: isT ? "#fff" : T.ink }}>{day.getDate()}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minHeight: 60 }}>
                  {evs.slice(0, 3).map((ev, i) => (
                    <div key={i} style={{ background: `${typeColor[ev.type] || T.gold}18`, borderLeft: `2px solid ${typeColor[ev.type] || T.gold}`, borderRadius: "0 4px 4px 0", padding: "3px 5px" }}>
                      <div style={{ fontSize: 9, color: typeColor[ev.type] || T.gold, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{ev.title || ev.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* List view */}
        <Mn v="Cette semaine" s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.14em", display: "block", marginBottom: 12 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {days.flatMap(day => {
            const dayStr = fmt(day);
            const evs = allEvents.filter(e => e.date === dayStr);
            return evs.map(ev => (
              <Card key={ev.id} style={{ padding: "14px", borderLeft: `3px solid ${typeColor[ev.type] || T.gold}` }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ textAlign: "center", width: 36 }}>
                    <Mn v={day.getDate()} s={{ fontSize: 16, fontWeight: 700, color: T.gold, display: "block", lineHeight: 1 }} />
                    <Mn v={day.toLocaleDateString("fr-FR", { weekday: "short" })} s={{ fontSize: 9, color: T.muted }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{ev.title || ev.name}</div>
                    {ev.time && <Mn v={ev.time} s={{ fontSize: 11, color: T.muted }} />}
                  </div>
                </div>
              </Card>
            ));
          })}
        </div>
      </div>
    </div>
  );
}

// ─── INBOX SCREEN ─────────────────────────────────────────────────────────────
function InboxScreen({ data }) {
  const activities = [
    ...data.tasks.filter(t => t.status === "blocked").map(t => ({ type: "blocked", icon: "⛔", label: `"${t.name}" bloquée`, sub: `Action requise pour ${t.assignee || "l'équipe"}`, date: t.deadline, c: T.red })),
    ...data.deliverables.filter(d => d.status === "delivered").map(d => ({ type: "delivered", icon: "📬", label: `"${d.name}" livré`, sub: "En attente de validation", date: d.deadline, c: T.gold })),
    ...data.tasks.filter(t => isOverdue(t.deadline, t.status)).map(t => ({ type: "overdue", icon: "⚠️", label: `"${t.name}" en retard`, sub: `${Math.abs(daysLeft(t.deadline))}j de retard`, date: t.deadline, c: T.red })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return (
    <div style={{ minHeight: "100vh", background: T.bg, paddingBottom: 100 }}>
      <div style={{ padding: "56px 20px 0" }}>
        <div className="a0" style={{ marginBottom: 24 }}>
          <Mn v="Activité" s={{ fontSize: 10, color: T.gold, letterSpacing: "0.2em", display: "block", marginBottom: 6 }} />
          <Pl v="Inbox" s={{ fontSize: 28, fontWeight: 600, color: T.ink }} />
        </div>
        {activities.length === 0 ? <EmptyState icon="✉️" title="Tout est à jour !" sub="Aucune notification en attente." /> : (
          <div className="a1" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activities.map((a, i) => (
              <Card key={i} style={{ padding: "14px 16px", borderLeft: `3px solid ${a.c}` }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 20 }}>{a.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{a.sub}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BOTTOM NAV ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "home",     icon: "⌂",  label: "Accueil" },
  { id: "pipeline", icon: "◈",  label: "Pipeline" },
  { id: "clients",  icon: "◉",  label: "Clients" },
  { id: "projects", icon: "◇",  label: "Projets" },
  { id: "calendar", icon: "▦",  label: "Agenda" },
  { id: "inbox",    icon: "✉",  label: "Inbox" },
];

function BottomNav({ active, setActive }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: T.card, borderTop: `1px solid ${T.border}`, paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
      <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 0 4px" }}>
        {NAV_ITEMS.map(item => {
          const isA = active === item.id;
          return (
            <button key={item.id} onClick={() => setActive(item.id)} className="press" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 8px", minWidth: 52, background: "transparent", transition: "all 0.2s" }}>
              <div style={{ width: 36, height: 28, borderRadius: 10, background: isA ? T.goldBg : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                <span style={{ fontSize: 16, color: isA ? T.gold : T.muted, transition: "color 0.2s" }}>{item.icon}</span>
              </div>
              <Mn v={item.label} s={{ fontSize: 9, color: isA ? T.gold : T.muted, fontWeight: isA ? 600 : 400, letterSpacing: "0.02em", transition: "color 0.2s" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── CLIENT PORTAL ────────────────────────────────────────────────────────────
const C_NAV = [
  { id: "home",     icon: "⌂", label: "Accueil" },
  { id: "projects", icon: "◇", label: "Projets" },
  { id: "files",    icon: "📎", label: "Fichiers" },
  { id: "messages", icon: "✉", label: "Messages" },
];

function ClientPortal({ session, clientId, data }) {
  const [nav, setNav] = useState("home");
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState("");
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [msgs]);

  const client = data.clients.find(c => c.id === clientId) || data.clients[0];
  const projects = client ? data.projects.filter(p => p.client_id === client.id) : [];
  const files = client ? data.files.filter(f => f.client_id === client.id) : [];
  const openFile = (file) => {
    if (file.file_url) {
      window.open(file.file_url, "_blank", "noopener,noreferrer");
    }
  };

  if (!client) {
    return (
      <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: T.bg, position: "relative" }}>
        <style>{CSS}</style>
        <div style={{ paddingTop: 120 }}>
          <EmptyState icon="◉" title="Aucun espace client" sub="Aucun client n'est lié à ce compte pour le moment." />
        </div>
      </div>
    );
  }

  const send = () => {
    if (!txt.trim()) return;
    setMsgs(m => [...m, { id: uid(), from: "Vous", text: txt, time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), isTeam: false }]);
    setTxt("");
  };

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: T.bg, fontFamily: "'DM Sans',sans-serif", color: T.ink, position: "relative" }}>
      {nav === "home" && (
        <div style={{ padding: "56px 20px 100px" }} className="fi">
          <div className="a0" style={{ marginBottom: 28 }}>
            <Mn v="ADR × WITH NOMA" s={{ fontSize: 10, color: T.gold, letterSpacing: "0.2em", display: "block", marginBottom: 6 }} />
            <Pl v={`Bonjour, ${client.contact.split(" ")[0]} 👋`} s={{ fontSize: 24, fontWeight: 600, color: T.ink }} />
          </div>
          <div className="a1" style={{ marginBottom: 24 }}>
            {projects.map(p => {
              const ph = PROJECT_PHASE[p.phase];
              return (
                <Card key={p.id} style={{ padding: "20px", marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <Pl v={p.name} s={{ fontSize: 16, fontWeight: 600, color: T.ink }} />
                    <Mn v={`${p.progress}%`} s={{ fontSize: 14, fontWeight: 700, color: T.gold }} />
                  </div>
                  <ProgressBar value={p.progress} />
                  <div style={{ marginTop: 8, fontSize: 12, color: ph.c, fontWeight: 600 }}>{ph.l}</div>
                  {p.next_action && (
                    <div style={{ marginTop: 10, padding: "8px 10px", background: T.goldBg, borderRadius: T.rSm, fontSize: 12, color: T.gold }}>→ {p.next_action}</div>
                  )}
                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {[
                      { l: "Tâches", v: data.tasks.filter(t => t.project_id === p.id).length },
                      { l: "Livrables", v: data.deliverables.filter(d => d.project_id === p.id && d.status === "validated").length },
                      { l: "Fichiers", v: data.files.filter(f => f.project_id === p.id).length },
                    ].map(k => (
                      <div key={k.l} style={{ textAlign: "center", background: T.bg, borderRadius: T.rSm, padding: "10px 6px" }}>
                        <Pl v={k.v} s={{ fontSize: 20, fontWeight: 600, color: T.gold, display: "block" }} />
                        <Mn v={k.l} s={{ fontSize: 9, color: T.muted }} />
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
          <div className="a2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {C_NAV.filter(n => n.id !== "home").map(n => (
              <button key={n.id} onClick={() => setNav(n.id)} className="press" style={{ padding: "16px", background: T.card, borderRadius: T.r, border: `1px solid ${T.border}`, textAlign: "left", boxShadow: T.shadow }}>
                <span style={{ fontSize: 22, display: "block", marginBottom: 8 }}>{n.icon}</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{n.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {nav === "projects" && (
        <div style={{ padding: "56px 20px 100px" }} className="fi">
          <div className="a0" style={{ marginBottom: 20 }}>
            <Mn v="Vos projets" s={{ fontSize: 10, color: T.gold, letterSpacing: "0.2em", display: "block", marginBottom: 6 }} />
            <Pl v="Livrables & Tâches" s={{ fontSize: 24, fontWeight: 600, color: T.ink }} />
          </div>
          {projects.map(p => {
            const tasks = data.tasks.filter(t => t.project_id === p.id);
            const delivs = data.deliverables.filter(d => d.project_id === p.id);
            return (
              <div key={p.id} className="a1" style={{ marginBottom: 24 }}>
                <Pl v={p.name} s={{ fontSize: 16, fontWeight: 600, color: T.ink, display: "block", marginBottom: 12 }} />
                <Mn v="Livrables" s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 8 }} />
                {delivs.map(d => {
                  const st = DELIV_STATUS[d.status];
                  return (
                    <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 13, color: T.ink }}>{d.name}</div>
                      <Badge label={st.l} color={st.c} bg={st.bg} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {nav === "files" && (
        <div style={{ padding: "56px 20px 100px" }} className="fi">
          <div className="a0" style={{ marginBottom: 20 }}>
            <Pl v="Fichiers partagés" s={{ fontSize: 24, fontWeight: 600, color: T.ink }} />
          </div>
          {files.length === 0 ? <EmptyState icon="📎" title="Aucun fichier" sub="Aucun document partagé pour le moment." /> : files.map(f => (
            <Card key={f.id} onClick={() => openFile(f)} style={{ padding: "14px", marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }} className="a1">
              <div style={{ width: 40, height: 40, borderRadius: T.rSm, background: T.goldBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                {{ document: "📄", template: "🎨", creative_asset: "✨" }[f.type] || "📄"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{f.name}</div>
                <Mn v={`${f.size} · ${fDate(f.date)}`} s={{ fontSize: 10, color: T.muted }} />
              </div>
              <button onClick={(event) => { event.stopPropagation(); openFile(f); }} disabled={!f.file_url} style={{ color: T.gold, fontSize: 18, opacity: f.file_url ? 1 : 0.35 }}>↓</button>
            </Card>
          ))}
        </div>
      )}

      {nav === "messages" && (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.bg }}>
          <div style={{ padding: "56px 20px 16px", background: T.card, borderBottom: `1px solid ${T.border}` }}>
            <Pl v="Messages" s={{ fontSize: 22, fontWeight: 600, color: T.ink }} />
            <div style={{ fontSize: 12, color: T.muted }}>ADR × WITH NOMA</div>
          </div>
          <div ref={ref} style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            {msgs.map(m => {
              const right = !m.isTeam;
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: right ? "row-reverse" : "row", gap: 8, marginBottom: 12, alignItems: "flex-end" }}>
                  <Avatar name={m.from} color={m.isTeam ? T.gold : T.blue} size={26} />
                  <div style={{ maxWidth: "70%" }}>
                    <Mn v={m.from} s={{ fontSize: 9, color: T.muted, display: "block", marginBottom: 3, textAlign: right ? "right" : "left" }} />
                    <div style={{ background: right ? T.gold : T.card, color: right ? "#fff" : T.ink, padding: "10px 14px", borderRadius: right ? "14px 4px 14px 14px" : "4px 14px 14px 14px", fontSize: 13, lineHeight: 1.6, border: right ? "none" : `1px solid ${T.border}`, boxShadow: T.shadow }}>{m.text}</div>
                    <Mn v={m.time} s={{ fontSize: 9, color: T.muted, display: "block", marginTop: 3, textAlign: right ? "right" : "left" }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "10px 20px", paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))", background: T.card, borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
            <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Votre message…" style={{ flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r, padding: "11px 16px", fontSize: 13, color: T.ink }} />
            <button onClick={send} style={{ width: 44, height: 44, borderRadius: "50%", background: T.gold, color: "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>↑</button>
          </div>
        </div>
      )}

      {nav !== "messages" && (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: T.card, borderTop: `1px solid ${T.border}`, paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
          <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 0 4px" }}>
            {C_NAV.map(item => {
              const isA = nav === item.id;
              return (
                <button key={item.id} onClick={() => setNav(item.id)} className="press" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 12px" }}>
                  <span style={{ fontSize: 18, color: isA ? T.gold : T.muted }}>{item.icon}</span>
                  <Mn v={item.label} s={{ fontSize: 9, color: isA ? T.gold : T.muted, fontWeight: isA ? 600 : 400 }} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !pass) { setErr("Renseignez votre email et mot de passe."); return; }
    setLoading(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pass });
    if (error) { setErr("Identifiants incorrects."); setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div className="a0" style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: T.gold, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: `0 8px 24px ${T.gold}44` }}>
            <Pl v="N" s={{ fontSize: 26, fontWeight: 700, color: "#fff" }} />
          </div>
          <Pl v="WITH NOMA OS" s={{ fontSize: 22, fontWeight: 600, color: T.ink, display: "block", marginBottom: 6 }} />
          <div style={{ fontSize: 13, color: T.muted }}>Votre espace de travail</div>
        </div>
        <div className="a1">
          <div style={{ marginBottom: 14 }}>
            <Mn v="Email" s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 7 }} />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="votre@email.com" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, color: T.ink, fontSize: 14, padding: "14px 18px", width: "100%", boxShadow: T.shadow }} onFocus={e => e.target.style.borderColor = T.gold} onBlur={e => e.target.style.borderColor = T.border} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <Mn v="Mot de passe" s={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.12em", display: "block", marginBottom: 7 }} />
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="••••••••" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.r, color: T.ink, fontSize: 14, padding: "14px 18px", width: "100%", boxShadow: T.shadow }} onFocus={e => e.target.style.borderColor = T.gold} onBlur={e => e.target.style.borderColor = T.border} />
          </div>
          {err && <div style={{ fontSize: 12, color: T.red, marginBottom: 14, textAlign: "center" }}>{err}</div>}
          <button onClick={submit} disabled={loading} style={{ width: "100%", background: T.gold, color: "#fff", padding: "15px", borderRadius: T.r, fontSize: 15, fontWeight: 600, fontFamily: "'Playfair Display',serif", boxShadow: `0 4px 20px ${T.gold}44`, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.01em" }}>
            {loading ? "Connexion…" : "Se connecter →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(undefined);
  const [nav, setNav] = useState("home");
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const { profile, data, loading, error, reload, actions } = useWorkspace(session);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setSession(session || null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setNav("home");
      setSelectedProjectId(null);
      setSelectedClientId(null);
    }
  }, [session]);

  const logout = async () => { await supabase.auth.signOut(); setSession(null); };
  const openProject = useCallback((projectId) => {
    if (!projectId) return;
    setSelectedProjectId(projectId);
    setNav("projects");
  }, []);
  const openClient = useCallback((clientId) => {
    if (!clientId) return;
    setSelectedClientId(clientId);
    setNav("clients");
  }, []);
  const hasWorkspaceData = Boolean(data.clients.length || data.projects.length || data.tasks.length || data.leads.length || data.deliverables.length);

  if (session === undefined || (session && loading && !hasWorkspaceData)) return (
    <>
      <style>{CSS}</style>
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: T.gold, margin: "0 auto 16px", animation: "spin 1.5s linear infinite", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Pl v="N" s={{ fontSize: 22, fontWeight: 700, color: "#fff" }} />
          </div>
          <div style={{ fontSize: 12, color: T.muted, fontFamily: "'DM Mono',monospace" }}>Chargement…</div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      {session === null && <LoginScreen />}
      {session && (() => {
        const role = profile?.role || session.user.user_metadata?.role || "manager";
        const clientId = profile?.client_id || session.user.user_metadata?.client_id;
        const name = profile?.full_name || session.user.user_metadata?.name || session.user.email?.split("@")[0] || "Utilisateur";
        const color = data.team.find(member => member.id === session.user.id)?.color || session.user.user_metadata?.color || T.gold;
        const user = { id: session.user.id, name, role, color, email: session.user.email };

        if (role === "client") return <ClientPortal session={session} clientId={clientId} data={data} />;

        return (
          <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: T.bg, position: "relative" }}>
            {error && (
              <div style={{ position: "sticky", top: 0, zIndex: 60, padding: "12px 20px", background: T.redBg, borderBottom: `1px solid ${T.red}22`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.red }}>{error}</span>
                <Btn label="Réessayer" sm v="danger" onClick={() => void reload()} />
              </div>
            )}
            <div key={nav} className="fi">
              {nav === "home"     && <HomeScreen     data={data} user={user} setNav={setNav} openProject={openProject} />}
              {nav === "pipeline" && <PipelineScreen data={data} actions={actions} openClient={openClient} />}
              {nav === "clients"  && <ClientsScreen  data={data} actions={actions} selectedClientId={selectedClientId} onClientSelected={setSelectedClientId} openProject={openProject} />}
              {nav === "projects" && <ProjectsScreen data={data} actions={actions} selectedProjectId={selectedProjectId} onProjectSelected={setSelectedProjectId} />}
              {nav === "calendar" && <CalendarScreen data={data} />}
              {nav === "inbox"    && <InboxScreen    data={data} />}
            </div>
            <BottomNav active={nav} setActive={setNav} />
            <button onClick={logout} style={{ position: "fixed", top: 20, right: 20, fontSize: 11, color: T.muted, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: "5px 10px", zIndex: 50 }}>⎋ Exit</button>
          </div>
        );
      })()}
    </>
  );
}
