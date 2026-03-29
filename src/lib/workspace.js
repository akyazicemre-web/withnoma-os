import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

const LEAD_PREFIX = "__lead__:";
const DELIVERABLE_PREFIX = "deliverable:";
const TEAM_COLORS = ["#C89040", "#A87030", "#4A8C6A", "#4070A0", "#7050A0", "#C04040"];

export const EMPTY_DATA = {
  leads: [],
  clients: [],
  projects: [],
  tasks: [],
  deliverables: [],
  files: [],
  calendar: [],
  team: [],
  vault: [],
};

const TASK_STATUS_FROM_DB = {
  a_faire: "todo",
  en_cours: "in_progress",
  bloque: "blocked",
  termine: "done",
};

const TASK_STATUS_TO_DB = {
  todo: "a_faire",
  in_progress: "en_cours",
  blocked: "bloque",
  done: "termine",
};

const TASK_PRIORITY_FROM_DB = {
  basse: "low",
  normale: "normal",
  haute: "high",
  critique: "urgent",
};

const TASK_PRIORITY_TO_DB = {
  low: "basse",
  normal: "normale",
  high: "haute",
  urgent: "critique",
};

function hashSeed(seed) {
  return [...String(seed ?? "noma")].reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function colorFromSeed(seed) {
  return TEAM_COLORS[hashSeed(seed) % TEAM_COLORS.length];
}

function safeJsonParse(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isLeadRow(row) {
  return typeof row?.mission_type === "string" && row.mission_type.startsWith(LEAD_PREFIX);
}

function getLeadStage(row) {
  return isLeadRow(row) ? row.mission_type.slice(LEAD_PREFIX.length) : null;
}

function readLeadMeta(row) {
  const parsed = safeJsonParse(row?.notes);

  if (parsed?.__kind === "lead") {
    return {
      value: parsed.value ?? 0,
      owner_id: parsed.owner_id ?? null,
      next_date: parsed.next_date ?? row?.start_date ?? "",
      notes: parsed.notes ?? "",
    };
  }

  return {
    value: 0,
    owner_id: null,
    next_date: row?.start_date ?? "",
    notes: row?.notes ?? "",
  };
}

function serializeLeadMeta(form) {
  return JSON.stringify({
    __kind: "lead",
    value: Number(form.value || 0),
    owner_id: form.pilote_id || null,
    next_date: form.next_date || null,
    notes: form.notes || "",
  });
}

function buildLeadPayload(form, currentStatus = "prospect") {
  return {
    name: form.name.trim(),
    status: currentStatus,
    mission_type: `${LEAD_PREFIX}${form.status}`,
    sector: form.company?.trim() || null,
    contact_name: form.contact?.trim() || null,
    start_date: form.next_date || null,
    notes: serializeLeadMeta(form),
    updated_at: new Date().toISOString(),
  };
}

function parseDeliverableMeta(document) {
  if (!document?.type || !document.type.startsWith(DELIVERABLE_PREFIX)) {
    return null;
  }

  const [, status = "pending", dueDate = ""] = document.type.split(":");

  return {
    status,
    dueDate: dueDate || null,
  };
}

function buildDeliverableType(status, dueDate) {
  return `${DELIVERABLE_PREFIX}${status || "pending"}:${dueDate || ""}`;
}

function phaseFromProjectStatus(status) {
  switch (status) {
    case "en_cours":
      return "production";
    case "en_revue":
      return "delivery";
    case "termine":
      return "completed";
    default:
      return "planning";
  }
}

async function ensureProfile(user) {
  const { data: existing, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (existing) {
    return existing;
  }

  const payload = {
    id: user.id,
    full_name:
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Utilisateur",
    role: user.user_metadata?.role || "manager",
    client_id: user.user_metadata?.client_id || null,
    avatar_url: user.user_metadata?.avatar_url || null,
  };

  const { error: insertError } = await supabase.from("profiles").insert(payload);

  if (insertError) {
    throw insertError;
  }

  return payload;
}

function buildWorkspace(raw) {
  const team = (raw.profiles ?? []).map((profile) => ({
    id: profile.id,
    name: profile.full_name || "Utilisateur",
    role: profile.role || "employee",
    color: colorFromSeed(profile.id || profile.full_name),
    email: profile.email || "",
  }));

  const teamById = new Map(team.map((member) => [member.id, member]));

  const leads = (raw.clients ?? [])
    .filter(isLeadRow)
    .map((row) => {
      const meta = readLeadMeta(row);
      const owner = meta.owner_id ? teamById.get(meta.owner_id) : null;

      return {
        id: row.id,
        name: row.name,
        company: row.sector || "",
        contact: row.contact_name || "",
        value: String(meta.value || 0),
        status: getLeadStage(row) || "new",
        pilote: owner?.name || "Non assigné",
        pilote_id: owner?.id || null,
        next_date: meta.next_date || "",
        notes: meta.notes || "",
        client_status: row.status,
      };
    });

  const clients = (raw.clients ?? [])
    .filter((row) => !isLeadRow(row) || row.status === "actif")
    .map((row) => {
      const meta = isLeadRow(row) ? readLeadMeta(row) : null;

      return {
        id: row.id,
        name: row.name,
        sector: row.sector || row.mission_type || "",
        color: colorFromSeed(row.id || row.name),
        status:
          row.status === "actif" ? "active" : row.status === "inactif" ? "inactive" : "prospect",
        pilote: meta?.owner_id ? teamById.get(meta.owner_id)?.name || "Équipe" : "Équipe",
        contact: row.contact_name || "",
        phone: row.contact_phone || "",
        email: row.contact_email || "",
        whatsapp: row.contact_phone ? `https://wa.me/${row.contact_phone.replace(/[^\d]/g, "")}` : "",
        notes: meta?.notes || row.notes || "",
        since: row.start_date || row.created_at?.slice(0, 10) || "",
      };
    });

  const projectRows = raw.projects ?? [];
  const rawTasks = raw.tasks ?? [];
  const rawDocuments = raw.documents ?? [];
  const clientById = new Map(clients.map((client) => [client.id, client]));

  const tasks = rawTasks.map((task) => {
    const member = task.assigned_to ? teamById.get(task.assigned_to) : null;
    const project = projectRows.find((projectRow) => projectRow.id === task.project_id);

    return {
      id: task.id,
      project_id: task.project_id,
      client_id: project?.client_id || null,
      name: task.title,
      status: TASK_STATUS_FROM_DB[task.status] || "todo",
      priority: TASK_PRIORITY_FROM_DB[task.priority] || "normal",
      assignee: member?.name || "Non assigné",
      assignee_id: member?.id || null,
      deadline: task.due_date,
      notes: "",
    };
  });

  const tasksByProject = new Map();
  tasks.forEach((task) => {
    const current = tasksByProject.get(task.project_id) || [];
    current.push(task);
    tasksByProject.set(task.project_id, current);
  });

  const deliverables = rawDocuments
    .map((document) => {
      const meta = parseDeliverableMeta(document);
      if (!meta) {
        return null;
      }

      return {
        id: document.id,
        project_id: document.project_id,
        client_id: document.client_id,
        name: document.name,
        status: meta.status,
        deadline: meta.dueDate,
        visible_client: document.visible_client,
        file_url: document.file_url,
        created_at: document.created_at,
      };
    })
    .filter(Boolean);

  const files = rawDocuments
    .filter((document) => !parseDeliverableMeta(document))
    .map((document) => ({
      id: document.id,
      project_id: document.project_id,
      client_id: document.client_id,
      name: document.name,
      size: "",
      type: document.type || "document",
      date: document.created_at?.slice(0, 10) || "",
      file_url: document.file_url,
      visible_client: document.visible_client,
    }));

  const deliverablesByProject = new Map();
  deliverables.forEach((deliverable) => {
    const current = deliverablesByProject.get(deliverable.project_id) || [];
    current.push(deliverable);
    deliverablesByProject.set(deliverable.project_id, current);
  });

  const projects = projectRows.map((project) => {
    const projectTasks = tasksByProject.get(project.id) || [];
    const blocked = projectTasks.some((task) => task.status === "blocked");
    const overdue =
      Boolean(project.delivery_date) &&
      project.status !== "termine" &&
      new Date(project.delivery_date) < new Date(new Date().toISOString().slice(0, 10));
    const doneCount = projectTasks.filter((task) => task.status === "done").length;
    const derivedProgress = projectTasks.length > 0 ? Math.round((doneCount / projectTasks.length) * 100) : 0;

    return {
      id: project.id,
      client_id: project.client_id,
      name: project.name,
      type: project.client_id ? "client" : "internal",
      phase: phaseFromProjectStatus(project.status),
      risk: blocked ? "blocked" : overdue ? "at_risk" : "on_track",
      progress: Number.isFinite(project.progress) ? project.progress : derivedProgress,
      next_action:
        projectTasks.find((task) => task.status !== "done")?.name ||
        project.brief ||
        "",
      deadline: project.delivery_date,
      status: project.status === "termine" ? "completed" : "active",
      brief: project.brief || "",
      budget: project.budget || null,
      client: project.client_id ? clientById.get(project.client_id) || null : null,
      deliverables: deliverablesByProject.get(project.id) || [],
    };
  });

  const calendar = [
    ...tasks
      .filter((task) => task.deadline && task.status !== "done")
      .map((task) => ({
        id: `task-${task.id}`,
        title: task.name,
        date: task.deadline,
        time: "",
        type: "deadline",
        client_id: task.client_id,
      })),
    ...deliverables
      .filter((deliverable) => deliverable.deadline && deliverable.status !== "validated")
      .map((deliverable) => ({
        id: `deliverable-${deliverable.id}`,
        title: deliverable.name,
        date: deliverable.deadline,
        time: "",
        type: "production",
        client_id: deliverable.client_id,
      })),
    ...leads
      .filter((lead) => lead.next_date)
      .map((lead) => ({
        id: `lead-${lead.id}`,
        title: `${lead.name} — suivi`,
        date: lead.next_date,
        time: "",
        type: "rdv",
        client_id: null,
      })),
  ].sort((left, right) => new Date(left.date) - new Date(right.date));

  return {
    leads,
    clients,
    projects,
    tasks,
    deliverables,
    files,
    calendar,
    team,
    vault: [],
  };
}

export function useWorkspace(session) {
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!session?.user) {
      setProfile(null);
      setData(EMPTY_DATA);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const ensuredProfile = await ensureProfile(session.user);

      const [profilesRes, clientsRes, projectsRes, tasksRes, documentsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name", { ascending: true }),
        supabase.from("clients").select("*").order("updated_at", { ascending: false }),
        supabase.from("projects").select("*").order("updated_at", { ascending: false }),
        supabase.from("tasks").select("*").order("due_date", { ascending: true }),
        supabase.from("documents").select("*").order("created_at", { ascending: false }),
      ]);

      const errors = [
        profilesRes.error,
        clientsRes.error,
        projectsRes.error,
        tasksRes.error,
        documentsRes.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        throw errors[0];
      }

      setProfile(ensuredProfile);
      setData(
        buildWorkspace({
          profiles: profilesRes.data || [],
          clients: clientsRes.data || [],
          projects: projectsRes.data || [],
          tasks: tasksRes.data || [],
          documents: documentsRes.data || [],
        })
      );
    } catch (currentError) {
      setError(currentError.message || "Impossible de charger les données du workspace.");
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const syncProjectProgress = useCallback(async (projectId) => {
    if (!projectId) {
      return;
    }

    const { data: projectTasks, error } = await supabase
      .from("tasks")
      .select("status")
      .eq("project_id", projectId);

    if (error) {
      throw error;
    }

    const progress =
      projectTasks && projectTasks.length > 0
        ? Math.round(
            (projectTasks.filter((task) => task.status === "termine").length / projectTasks.length) * 100
          )
        : 0;

    const { error: updateError } = await supabase
      .from("projects")
      .update({ progress, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    if (updateError) {
      throw updateError;
    }
  }, []);

  const createLead = useCallback(
    async (form) => {
      const { error: insertError } = await supabase
        .from("clients")
        .insert(buildLeadPayload(form, "prospect"));

      if (insertError) {
        throw insertError;
      }

      await reload();
    },
    [reload]
  );

  const updateLead = useCallback(
    async (leadId, form, currentStatus = "prospect") => {
      const { error: updateError } = await supabase
        .from("clients")
        .update(buildLeadPayload(form, currentStatus))
        .eq("id", leadId);

      if (updateError) {
        throw updateError;
      }

      await reload();
    },
    [reload]
  );

  const deleteLead = useCallback(
    async (leadId) => {
      const { error: deleteError } = await supabase.from("clients").delete().eq("id", leadId);

      if (deleteError) {
        throw deleteError;
      }

      await reload();
    },
    [reload]
  );

  const convertLeadToClient = useCallback(
    async (leadId) => {
      const { data: row, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", leadId)
        .single();

      if (error) {
        throw error;
      }

      const { error: updateError } = await supabase
        .from("clients")
        .update({
          status: "actif",
          mission_type: `${LEAD_PREFIX}won`,
          start_date: row.start_date || new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId);

      if (updateError) {
        throw updateError;
      }

      await reload();
    },
    [reload]
  );

  const createProject = useCallback(
    async (clientId, form) => {
      const payload = {
        name: form.name.trim(),
        client_id: clientId || null,
        status: "en_attente",
        delivery_date: form.deadline || null,
        budget: form.budget ? Number(form.budget) : null,
        brief: form.brief || null,
        progress: 0,
        updated_at: new Date().toISOString(),
      };

      const { data: createdProject, error: insertError } = await supabase
        .from("projects")
        .insert(payload)
        .select("*")
        .single();

      if (insertError) {
        throw insertError;
      }

      await reload();
      return createdProject;
    },
    [reload]
  );

  const saveTask = useCallback(
    async (projectId, clientId, form, taskId = null) => {
      const payload = {
        title: form.name.trim(),
        project_id: projectId,
        assigned_to: form.assignee_id || null,
        status: TASK_STATUS_TO_DB[form.status] || "a_faire",
        priority: TASK_PRIORITY_TO_DB[form.priority] || "normale",
        due_date: form.deadline || null,
        updated_at: new Date().toISOString(),
      };

      const query = taskId
        ? supabase.from("tasks").update(payload).eq("id", taskId)
        : supabase.from("tasks").insert(payload);

      const { error } = await query;

      if (error) {
        throw error;
      }

      await syncProjectProgress(projectId);
      await reload();
    },
    [reload, syncProjectProgress]
  );

  const deleteTask = useCallback(
    async (taskId, projectId) => {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);

      if (error) {
        throw error;
      }

      await syncProjectProgress(projectId);
      await reload();
    },
    [reload, syncProjectProgress]
  );

  const cycleTaskStatus = useCallback(
    async (task) => {
      const order = ["todo", "in_progress", "blocked", "done"];
      const nextStatus = order[(order.indexOf(task.status) + 1) % order.length];

      const { error } = await supabase
        .from("tasks")
        .update({
          status: TASK_STATUS_TO_DB[nextStatus],
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      if (error) {
        throw error;
      }

      await syncProjectProgress(task.project_id);
      await reload();
    },
    [reload, syncProjectProgress]
  );

  const saveDeliverable = useCallback(
    async (projectId, clientId, form) => {
      const { error } = await supabase.from("documents").insert({
        name: form.name.trim(),
        project_id: projectId,
        client_id: clientId || null,
        type: buildDeliverableType(form.status, form.deadline),
        file_url: form.file_url || null,
        visible_client: Boolean(form.visible_client),
        uploaded_by: profile?.id || session?.user?.id || null,
      });

      if (error) {
        throw error;
      }

      await reload();
    },
    [profile?.id, reload, session?.user?.id]
  );

  return {
    profile,
    data,
    loading,
    error,
    reload,
    actions: {
      createLead,
      updateLead,
      deleteLead,
      convertLeadToClient,
      createProject,
      saveTask,
      deleteTask,
      cycleTaskStatus,
      saveDeliverable,
    },
  };
}
