"use client";

import React, { useEffect, useState } from "react";
import { useAuthStore, useChatStore } from "@/lib/store";
import { getStageBadge } from "@/lib/utils";
import { cachedFetch, invalidateApiCache, getCachedData } from "@/lib/apiCache";
import {
  FolderKanban,
  Plus,
  ExternalLink,
  Send,
  Building,
  AlertCircle,
  Pencil,
  Trash2,
  AlertTriangle,
  X,
  Loader2,
  FolderTree,
  MessageSquare,
} from "lucide-react";

export default function ProjectsPage() {
  const { user } = useAuthStore();
  const cachedProjects = getCachedData<{ projects: any[] }>("/api/projects")?.projects;
  const cachedClients = getCachedData<{ clients: any[] }>("/api/clients")?.clients;
  const [projects, setProjects] = useState<any[]>(() => cachedProjects || []);
  const [clients, setClients] = useState<any[]>(() => cachedClients || []);
  const [loading, setLoading] = useState(() => !cachedProjects);
  const [error, setError] = useState<string | null>(null);

  // New Project Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClientId, setNewClientId] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStage, setNewStage] = useState("DISCOVERY");
  const [newStagingUrl, setNewStagingUrl] = useState("");
  const [newLiveUrl, setNewLiveUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Project Modal State
  const [projectToEdit, setProjectToEdit] = useState<any | null>(null);
  const [editClientId, setEditClientId] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editStage, setEditStage] = useState("DISCOVERY");
  const [editStagingUrl, setEditStagingUrl] = useState("");
  const [editLiveUrl, setEditLiveUrl] = useState("");
  const [updatingProject, setUpdatingProject] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Project Modal State
  const [projectToDelete, setProjectToDelete] = useState<any | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Post Status Update Modal State
  const [selectedProjectForUpdate, setSelectedProjectForUpdate] = useState<any | null>(null);
  const [updateTitle, setUpdateTitle] = useState("");
  const [updateBody, setUpdateBody] = useState("");
  const [notifyClient, setNotifyClient] = useState(true);
  const [postingUpdate, setPostingUpdate] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Sub-Project States
  const [subProjectModalOpen, setSubProjectModalOpen] = useState(false);
  const [subProjectToEdit, setSubProjectToEdit] = useState<any | null>(null);
  const [targetParentProject, setTargetParentProject] = useState<any | null>(null);
  const [subName, setSubName] = useState("");
  const [subDesc, setSubDesc] = useState("");
  const [subStage, setSubStage] = useState("IN_PROGRESS");
  const [isSavingSubProject, setIsSavingSubProject] = useState(false);
  const [subProjectError, setSubProjectError] = useState<string | null>(null);
  const [subProjectToDelete, setSubProjectToDelete] = useState<{ id: string; name: string; projectId: string } | null>(null);
  const [isDeletingSubProject, setIsDeletingSubProject] = useState(false);

  const isAdmin = user?.role === "ADMIN";

  const resetCreateForm = () => {
    setNewClientId(clients.length > 0 ? clients[0].id : "");
    setNewName("");
    setNewDesc("");
    setNewStage("DISCOVERY");
    setNewStagingUrl("");
    setNewLiveUrl("");
    setCreateError(null);
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    resetCreateForm();
  };

  const handleCloseEditModal = () => {
    setProjectToEdit(null);
    setEditClientId("");
    setEditName("");
    setEditDesc("");
    setEditStage("DISCOVERY");
    setEditStagingUrl("");
    setEditLiveUrl("");
    setEditError(null);
  };

  const resetPostUpdateForm = () => {
    setUpdateTitle("");
    setUpdateBody("");
    setNotifyClient(true);
    setPostError(null);
  };

  const handleClosePostUpdateModal = () => {
    setSelectedProjectForUpdate(null);
    resetPostUpdateForm();
  };

  const resetSubProjectForm = () => {
    setSubName("");
    setSubDesc("");
    setSubStage("IN_PROGRESS");
    setSubProjectError(null);
    setSubProjectToEdit(null);
    setTargetParentProject(null);
  };

  const handleCloseSubProjectModal = () => {
    setSubProjectModalOpen(false);
    resetSubProjectForm();
  };

  const fetchProjectsAndClients = async (forceRefresh = false) => {
    try {
      const [pData, cData] = await Promise.all([
        cachedFetch<{ projects: any[] }>("/api/projects", { forceRefresh }),
        cachedFetch<{ clients: any[] }>("/api/clients", { forceRefresh }),
      ]);

      setProjects(pData.projects || []);
      setClients(cData.clients || []);
      if (cData.clients?.length > 0 && !newClientId) {
        setNewClientId(cData.clients[0].id);
      }
    } catch (err: any) {
      console.error("Failed to load projects:", err);
      setError("Failed to load projects. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectsAndClients();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    // Staging URL invariant check before AWAITING_REVIEW
    if (newStage === "AWAITING_REVIEW" && (!newStagingUrl || !newStagingUrl.trim())) {
      setCreateError("A staging URL is required before a project can enter Awaiting review.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: newClientId,
          name: newName,
          description: newDesc,
          stage: newStage,
          stagingUrl: newStagingUrl,
          liveUrl: newLiveUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Failed to create project");
        setCreating(false);
        return;
      }

      handleCloseCreateModal();
      invalidateApiCache("/api/projects");
      fetchProjectsAndClients(true);
    } catch (err: any) {
      setCreateError(err.message || "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEditModal = (proj: any) => {
    setProjectToEdit(proj);
    setEditClientId(proj.clientId || proj.client?.id || (clients.length > 0 ? clients[0].id : ""));
    setEditName(proj.name || "");
    setEditDesc(proj.description || "");
    setEditStage(proj.stage || "DISCOVERY");
    setEditStagingUrl(proj.stagingUrl || "");
    setEditLiveUrl(proj.liveUrl || "");
    setEditError(null);
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectToEdit) return;
    setEditError(null);

    if (editStage === "AWAITING_REVIEW" && (!editStagingUrl || !editStagingUrl.trim())) {
      setEditError("A staging URL is required before a project can enter Awaiting review.");
      return;
    }

    setUpdatingProject(true);
    try {
      const res = await fetch(`/api/projects/${projectToEdit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: editClientId,
          name: editName,
          description: editDesc,
          stage: editStage,
          stagingUrl: editStagingUrl,
          liveUrl: editLiveUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Failed to update project");
        setUpdatingProject(false);
        return;
      }

      handleCloseEditModal();
      invalidateApiCache("/api/projects");
      fetchProjectsAndClients(true);
    } catch (err: any) {
      setEditError(err.message || "Failed to update project");
    } finally {
      setUpdatingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    setDeletingProject(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "Failed to delete project");
        setDeletingProject(false);
        return;
      }

      setProjectToDelete(null);
      invalidateApiCache("/api/projects");
      fetchProjectsAndClients(true);
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete project");
    } finally {
      setDeletingProject(false);
    }
  };

  const handlePostUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectForUpdate) return;

    setPostingUpdate(true);
    setPostError(null);
    try {
      const res = await fetch(`/api/projects/${selectedProjectForUpdate.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: updateTitle,
          body: updateBody,
          notifyClient,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPostError(data.error || "Failed to post status update");
        setPostingUpdate(false);
        return;
      }

      handleClosePostUpdateModal();
      invalidateApiCache("/api/projects");
      fetchProjectsAndClients(true);
    } catch (err: any) {
      setPostError(err.message || "Failed to post status update");
    } finally {
      setPostingUpdate(false);
    }
  };

  const handleStageChange = async (projectId: string, currentStagingUrl: string | null, targetStage: string) => {
    if (targetStage === "AWAITING_REVIEW" && (!currentStagingUrl || !currentStagingUrl.trim())) {
      const enteredStagingUrl = prompt(
        "A staging URL is required before advancing to 'Awaiting review'. Please enter the staging preview URL:"
      );
      if (!enteredStagingUrl || !enteredStagingUrl.trim()) {
        alert("Stage transition cancelled: Staging URL is required.");
        return;
      }
      await updateProjectStage(projectId, targetStage, enteredStagingUrl.trim());
      return;
    }

    await updateProjectStage(projectId, targetStage);
  };

  const updateProjectStage = async (projectId: string, stage: string, stagingUrl?: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, ...(stagingUrl ? { stagingUrl } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update project stage");
        return;
      }
      invalidateApiCache("/api/projects");
      fetchProjectsAndClients(true);
    } catch (err: any) {
      alert(err.message || "Failed to update project stage");
    }
  };

  const handleOpenCreateSubProject = (proj: any) => {
    setTargetParentProject(proj);
    setSubProjectToEdit(null);
    setSubName("");
    setSubDesc("");
    setSubStage("IN_PROGRESS");
    setSubProjectError(null);
    setSubProjectModalOpen(true);
  };

  const handleOpenEditSubProject = (proj: any, sub: any) => {
    setTargetParentProject(proj);
    setSubProjectToEdit(sub);
    setSubName(sub.name || "");
    setSubDesc(sub.description || "");
    setSubStage(sub.stage || "IN_PROGRESS");
    setSubProjectError(null);
    setSubProjectModalOpen(true);
  };

  const handleSaveSubProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetParentProject || !subName.trim()) return;

    setIsSavingSubProject(true);
    setSubProjectError(null);

    const payload = {
      name: subName.trim(),
      description: subDesc.trim() || null,
      stage: subStage,
    };

    try {
      let res;
      if (subProjectToEdit) {
        res = await fetch(`/api/projects/${targetParentProject.id}/sub-projects/${subProjectToEdit.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/projects/${targetParentProject.id}/sub-projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setSubProjectError(data.error || "Failed to save sub-project");
        setIsSavingSubProject(false);
        return;
      }

      handleCloseSubProjectModal();
      invalidateApiCache("/api/projects");
      fetchProjectsAndClients(true);
    } catch (err: any) {
      setSubProjectError(err.message || "Network error saving sub-project");
    } finally {
      setIsSavingSubProject(false);
    }
  };

  const handleDeleteSubProject = async () => {
    if (!subProjectToDelete) return;
    setIsDeletingSubProject(true);

    try {
      const res = await fetch(`/api/projects/${subProjectToDelete.projectId}/sub-projects/${subProjectToDelete.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete sub-project");
        setIsDeletingSubProject(false);
        return;
      }

      setSubProjectToDelete(null);
      invalidateApiCache("/api/projects");
      fetchProjectsAndClients(true);
    } catch (err: any) {
      alert(err.message || "Failed to delete sub-project");
    } finally {
      setIsDeletingSubProject(false);
    }
  };

  const handleSubProjectStageChange = async (projectId: string, subId: string, newStage: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sub-projects/${subId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      if (res.ok) {
        invalidateApiCache("/api/projects");
      fetchProjectsAndClients(true);
      }
    } catch {}
  };


  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="page-heading text-text-primary flex items-center gap-2">
            <FolderKanban className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
            <span>Projects & Milestones</span>
          </h1>
          <p className="helper-text text-text-secondary mt-1">
            {isAdmin
              ? "Manage all client delivery pipelines, staging environments, and client status updates."
              : "Active projects belonging to your assigned clients."}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              resetCreateForm();
              setShowCreateModal(true);
            }}
            className="flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white btn-text shadow-sm transition cursor-pointer self-start sm:self-auto shrink-0 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>New Project</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 helper-text text-error font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-error shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="p-12 text-center helper-text text-text-secondary">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="p-12 text-center bg-white border border-border rounded-card body-text text-text-secondary shadow-sm">
          No projects found. {isAdmin ? "Click 'New Project' above to create one." : ""}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {projects.map((proj) => {
            const stageBadge = getStageBadge(proj.stage);

            return (
              <div
                key={proj.id}
                className="p-4 sm:p-6 rounded-card bg-white border border-border hover:shadow-md transition shadow-sm space-y-4 sm:space-y-5 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Top Bar: Name, Client, Stage, and Admin Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <h3 className="card-title text-text-primary leading-snug truncate">
                        {proj.name}
                      </h3>
                      {proj.client && (
                        <p className="helper-text text-primary flex items-center gap-1.5 mt-0.5 truncate">
                          <Building className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {proj.client.name} {proj.client.company ? `(${proj.client.company})` : ""}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-start">
                      {isAdmin ? (
                        <>
                          <select
                            value={proj.stage}
                            onChange={(e) =>
                              handleStageChange(proj.id, proj.stagingUrl, e.target.value)
                            }
                            className={`label-text font-medium px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none ${stageBadge.bg}`}
                          >
                            <option value="DISCOVERY">Discovery</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="AWAITING_REVIEW">Awaiting Review</option>
                            <option value="LIVE">Live Site</option>
                          </select>

                          <div className="flex items-center gap-1 border-l border-border pl-2">
                            <button
                              onClick={() => handleOpenEditModal(proj)}
                              title="Edit Project"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-slate-100 transition cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setProjectToDelete(proj);
                                setDeleteError(null);
                              }}
                              title="Delete Project"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-error hover:bg-red-50 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <span className={`label-text px-2.5 py-1 rounded-full border ${stageBadge.bg}`}>
                          {stageBadge.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {proj.description && (
                    <p className="body-text text-text-secondary line-clamp-3">
                      {proj.description}
                    </p>
                  )}

                  {/* Staging & Live URLs */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {proj.stagingUrl ? (
                      <a
                        href={proj.stagingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-blue-50 text-primary border border-blue-200 hover:bg-blue-100 transition flex items-center gap-1.5 btn-text"
                      >
                        <span>Staging Preview</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-50 text-text-secondary border border-border helper-text italic">
                        No staging URL
                      </span>
                    )}

                    {proj.liveUrl && (
                      <a
                        href={proj.liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-green-50 text-success border border-green-200 hover:bg-green-100 transition flex items-center gap-1.5 btn-text"
                      >
                        <span>Live Site</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        useChatStore.getState().setActiveConvId(proj.id);
                        useChatStore.getState().setIsOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-blue-50 text-primary border border-blue-200 hover:bg-blue-100 transition flex items-center gap-1.5 btn-text cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Project Chat</span>
                    </button>
                  </div>

                  {/* Sub-Projects Section */}
                  <div className="pt-3 border-t border-border space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FolderTree className="w-4 h-4 text-primary" />
                        <span className="label-text uppercase font-semibold text-text-secondary">
                          Sub-Projects
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-text-secondary border border-border font-semibold">
                          {proj.subProjects?.length || 0}
                        </span>
                      </div>

                      {isAdmin && (
                        <button
                          type="button"
                          id={`add-subproject-btn-${proj.id}`}
                          data-testid={`add-subproject-btn-${proj.id}`}
                          onClick={() => handleOpenCreateSubProject(proj)}
                          className="text-xs text-primary hover:text-primary-hover font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Sub-Project</span>
                        </button>
                      )}
                    </div>

                    {proj.subProjects && proj.subProjects.length > 0 ? (
                      <div className="space-y-1.5">
                        <div
                          id={`subprojects-list-${proj.id}`}
                          data-testid={`subprojects-list-${proj.id}`}
                          className={`space-y-2 ${
                            proj.subProjects.length > 2
                              ? "max-h-[185px] overflow-y-auto pr-1"
                              : ""
                          }`}
                        >
                          {proj.subProjects.map((sub: any) => {
                            const subBadge = getStageBadge(sub.stage);
                            return (
                              <div
                                key={sub.id}
                                className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100/70 border border-border transition space-y-1"
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <span className="font-semibold text-text-primary text-xs truncate">
                                      {sub.name}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                                    {isAdmin ? (
                                      <select
                                        value={sub.stage}
                                        onChange={(e) =>
                                          handleSubProjectStageChange(proj.id, sub.id, e.target.value)
                                        }
                                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full border cursor-pointer focus:outline-none ${subBadge.bg}`}
                                      >
                                        <option value="DISCOVERY">Discovery</option>
                                        <option value="IN_PROGRESS">In Progress</option>
                                        <option value="AWAITING_REVIEW">Review</option>
                                        <option value="LIVE">Live / Done</option>
                                      </select>
                                    ) : (
                                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${subBadge.bg}`}>
                                        {subBadge.label}
                                      </span>
                                    )}

                                    {isAdmin && (
                                      <div className="flex items-center gap-1 border-l border-border pl-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleOpenEditSubProject(proj, sub)}
                                          title="Edit Sub-Project"
                                          className="p-1 rounded text-slate-400 hover:text-primary hover:bg-white transition cursor-pointer"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setSubProjectToDelete({
                                              id: sub.id,
                                              name: sub.name,
                                              projectId: proj.id,
                                            })
                                          }
                                          title="Delete Sub-Project"
                                          className="p-1 rounded text-slate-400 hover:text-error hover:bg-white transition cursor-pointer"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {sub.description && (
                                  <p className="text-[11px] text-text-secondary line-clamp-2">
                                    {sub.description}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-slate-50/70 border border-dashed border-border text-center">
                        <span className="helper-text text-text-secondary italic">
                          No sub-projects created yet.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Latest Status Updates */}
                  <div className="pt-2 border-t border-border space-y-2">
                    <span className="label-text uppercase font-semibold text-text-secondary block">
                      Recent Updates
                    </span>
                    {proj.statusUpdates && proj.statusUpdates.length > 0 ? (
                      <div className="space-y-1.5">
                        {proj.statusUpdates.map((u: any) => (
                          <div
                            key={u.id}
                            className="p-2.5 rounded-xl bg-slate-50 border border-border"
                          >
                            <div className="flex items-center justify-between helper-text text-text-secondary mb-0.5">
                              <span className="font-medium text-text-primary">{u.title}</span>
                              <span>{new Date(u.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                            </div>
                            <p className="helper-text text-text-secondary line-clamp-2">{u.body}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="helper-text text-text-secondary italic">No status updates published yet.</p>
                    )}
                  </div>
                </div>

                {/* Bottom Action: Post Status Update */}
                <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="helper-text text-text-secondary">
                    {proj._count?.timeEntries || 0} time entries logged
                  </span>
                  <button
                    onClick={() => {
                      resetPostUpdateForm();
                      setSelectedProjectForUpdate(proj);
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-text-primary border border-border btn-text transition cursor-pointer shadow-sm self-start sm:self-auto"
                  >
                    <Send className="w-3.5 h-3.5 text-primary" />
                    <span>Post Client Update</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Project Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !creating) handleCloseCreateModal();
          }}
        >
          <div
            className="w-full max-w-lg bg-white border border-border rounded-card p-6 sm:p-8 shadow-xl space-y-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="section-heading text-text-primary flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-primary" />
                <span>Create New Project</span>
              </h3>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                className="text-text-secondary hover:text-text-primary p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              {createError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-error helper-text flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Assign to Client *
                </label>
                <select
                  required
                  value={newClientId}
                  onChange={(e) => setNewClientId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="" disabled>Select Client Portfolio</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company ? `(${c.company})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Project Title *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Next.js E-Commerce Redesign"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Project Description
                </label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Scope of work, key deliverables, and target launch window"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Initial Project Stage
                </label>
                <select
                  value={newStage}
                  onChange={(e) => setNewStage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="DISCOVERY">Discovery — Initial Scoping & Architecture</option>
                  <option value="IN_PROGRESS">In Progress — Active Sprint & Development</option>
                  <option value="AWAITING_REVIEW">Awaiting Review — Ready for Client Acceptance</option>
                  <option value="LIVE">Live Site — Production Deployed</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block label-text text-text-primary font-medium mb-1.5">
                    Staging Preview URL
                  </label>
                  <input
                    type="url"
                    value={newStagingUrl}
                    onChange={(e) => setNewStagingUrl(e.target.value)}
                    placeholder="https://staging.client.dev"
                    className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block label-text text-text-primary font-medium mb-1.5">
                    Production Live URL
                  </label>
                  <input
                    type="url"
                    value={newLiveUrl}
                    onChange={(e) => setNewLiveUrl(e.target.value)}
                    placeholder="https://client.com"
                    className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="px-4 py-2 rounded-xl btn-text text-text-secondary hover:text-text-primary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover btn-text text-white shadow-sm cursor-pointer disabled:opacity-50 transition flex items-center gap-2"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{creating ? "Creating..." : "Create Project"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {projectToEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !updatingProject) handleCloseEditModal();
          }}
        >
          <div
            className="w-full max-w-lg bg-white border border-border rounded-card p-6 sm:p-8 shadow-xl space-y-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="section-heading text-text-primary flex items-center gap-2">
                <Pencil className="w-5 h-5 text-primary" />
                <span>Edit Project</span>
              </h3>
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="text-text-secondary hover:text-text-primary p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateProject} className="space-y-4">
              {editError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-error helper-text flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Client *
                </label>
                <select
                  required
                  value={editClientId}
                  onChange={(e) => setEditClientId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company ? `(${c.company})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Project Title *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Next.js E-Commerce Redesign"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Project Description
                </label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Scope of work, key deliverables, and target launch window"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Project Stage
                </label>
                <select
                  value={editStage}
                  onChange={(e) => setEditStage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="DISCOVERY">Discovery — Initial Scoping & Architecture</option>
                  <option value="IN_PROGRESS">In Progress — Active Sprint & Development</option>
                  <option value="AWAITING_REVIEW">Awaiting Review — Ready for Client Acceptance</option>
                  <option value="LIVE">Live Site — Production Deployed</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block label-text text-text-primary font-medium mb-1.5">
                    Staging Preview URL
                  </label>
                  <input
                    type="url"
                    value={editStagingUrl}
                    onChange={(e) => setEditStagingUrl(e.target.value)}
                    placeholder="https://staging.client.dev"
                    className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block label-text text-text-primary font-medium mb-1.5">
                    Production Live URL
                  </label>
                  <input
                    type="url"
                    value={editLiveUrl}
                    onChange={(e) => setEditLiveUrl(e.target.value)}
                    placeholder="https://client.com"
                    className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="px-4 py-2 rounded-xl btn-text text-text-secondary hover:text-text-primary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingProject}
                  className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover btn-text text-white shadow-sm cursor-pointer disabled:opacity-50 transition flex items-center gap-2"
                >
                  {updatingProject && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{updatingProject ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Project Confirmation Modal */}
      {projectToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingProject) setProjectToDelete(null);
          }}
        >
          <div
            className="w-full max-w-md bg-white border border-border rounded-card p-6 sm:p-8 shadow-xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-error">
              <div className="p-3 bg-red-50 border border-red-200 rounded-full">
                <AlertTriangle className="w-6 h-6 text-error" />
              </div>
              <div>
                <h3 className="section-heading text-text-primary">Delete Project</h3>
                <p className="helper-text text-text-secondary">This action cannot be undone.</p>
              </div>
            </div>

            <p className="body-text text-text-secondary">
              Are you sure you want to delete{" "}
              <strong className="text-text-primary">{projectToDelete.name}</strong>?
              All logged time entries, milestones, and status updates for this project will be permanently deleted.
            </p>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-error helper-text flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                disabled={deletingProject}
                className="px-4 py-2 rounded-xl btn-text text-text-secondary hover:text-text-primary transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                disabled={deletingProject}
                className="px-4 py-2.5 rounded-xl bg-error hover:bg-red-700 btn-text text-white shadow-sm cursor-pointer disabled:opacity-50 transition flex items-center gap-2"
              >
                {deletingProject && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{deletingProject ? "Deleting..." : "Delete Project"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post Status Update Modal */}
      {selectedProjectForUpdate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !postingUpdate) handleClosePostUpdateModal();
          }}
        >
          <div
            className="w-full max-w-md bg-white border border-border rounded-card p-4 sm:p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="section-heading text-text-primary flex items-center gap-2">
                  <Send className="w-5 h-5 text-primary" />
                  <span>Post Project Update</span>
                </h3>
                <p className="helper-text text-text-secondary mt-1">
                  Publish a milestone update visible to {selectedProjectForUpdate.client?.name || "client"} on their portal.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClosePostUpdateModal}
                className="text-text-secondary hover:text-text-primary p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePostUpdate} className="space-y-4">
              {postError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-error helper-text flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{postError}</span>
                </div>
              )}

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Update Title *
                </label>
                <input
                  type="text"
                  required
                  value={updateTitle}
                  onChange={(e) => setUpdateTitle(e.target.value)}
                  placeholder="e.g. Completed Checkout & Payment Integration"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Update Details *
                </label>
                <textarea
                  rows={4}
                  required
                  value={updateBody}
                  onChange={(e) => setUpdateBody(e.target.value)}
                  placeholder="Describe progress made, next steps, or items needing client review"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="notifyClientCheckbox"
                  checked={notifyClient}
                  onChange={(e) => setNotifyClient(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <label
                  htmlFor="notifyClientCheckbox"
                  className="helper-text text-text-secondary cursor-pointer"
                >
                  Send email notification to client ({selectedProjectForUpdate.client?.email || "on file"})
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleClosePostUpdateModal}
                  className="px-4 py-2 rounded-xl btn-text text-text-secondary hover:text-text-primary transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={postingUpdate}
                  className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover btn-text text-white shadow-sm cursor-pointer disabled:opacity-50 transition flex items-center gap-2"
                >
                  {postingUpdate && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{postingUpdate ? "Publishing..." : "Publish Update"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Sub-Project Modal */}
      {subProjectModalOpen && targetParentProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSavingSubProject) handleCloseSubProjectModal();
          }}
        >
          <div
            className="w-full max-w-md bg-white border border-border rounded-card p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary-subtle text-primary border border-blue-200 flex items-center justify-center">
                  <FolderTree className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="card-title text-text-primary">
                    {subProjectToEdit ? "Edit Sub-Project" : "Add Sub-Project"}
                  </h3>
                  <p className="helper-text text-text-secondary truncate max-w-[260px]">
                    Project: <strong className="text-text-primary">{targetParentProject.name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseSubProjectModal}
                disabled={isSavingSubProject}
                className="text-text-secondary hover:text-text-primary p-1 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubProject} className="space-y-4">
              {subProjectError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-error helper-text flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{subProjectError}</span>
                </div>
              )}

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Sub-Project Name *
                </label>
                <input
                  type="text"
                  required
                  id="subproject-name-input"
                  data-testid="subproject-name-input"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="e.g. Frontend UI Redesign, Checkout API, Mobile QA"
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Delivery Stage
                </label>
                <select
                  id="subproject-stage-select"
                  data-testid="subproject-stage-select"
                  value={subStage}
                  onChange={(e) => setSubStage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary focus:outline-none focus:border-primary cursor-pointer font-medium"
                >
                  <option value="DISCOVERY">Discovery — Planning & Scope</option>
                  <option value="IN_PROGRESS">In Progress — In Active Work</option>
                  <option value="AWAITING_REVIEW">Awaiting Review — Ready for QA</option>
                  <option value="LIVE">Live / Done — Delivered</option>
                </select>
              </div>

              <div>
                <label className="block label-text text-text-primary font-medium mb-1.5">
                  Scope & Description
                </label>
                <textarea
                  rows={3}
                  id="subproject-desc-input"
                  data-testid="subproject-desc-input"
                  value={subDesc}
                  onChange={(e) => setSubDesc(e.target.value)}
                  placeholder="Module objectives, deliverables, or technical notes..."
                  className="w-full px-3.5 py-2.5 bg-white border border-border rounded-xl body-text text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseSubProjectModal}
                  disabled={isSavingSubProject}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-text-primary btn-text transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-subproject-btn"
                  data-testid="submit-subproject-btn"
                  disabled={isSavingSubProject || !subName.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white btn-text shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {isSavingSubProject && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{subProjectToEdit ? "Update Sub-Project" : "Create Sub-Project"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Sub-Project Confirmation Modal */}
      {subProjectToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingSubProject) setSubProjectToDelete(null);
          }}
        >
          <div
            className="w-full max-w-sm bg-white border border-border rounded-card p-6 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 text-error border border-red-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="card-title text-text-primary">Delete Sub-Project?</h3>
                <p className="helper-text text-text-secondary">
                  Are you sure you want to delete <strong className="text-text-primary">&ldquo;{subProjectToDelete.name}&rdquo;</strong>?
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSubProjectToDelete(null)}
                disabled={isDeletingSubProject}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-text-primary btn-text transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-delete-subproject-btn"
                data-testid="confirm-delete-subproject-btn"
                onClick={handleDeleteSubProject}
                disabled={isDeletingSubProject}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white btn-text shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                {isDeletingSubProject && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Sub-Project</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
