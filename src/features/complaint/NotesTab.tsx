import { useState } from "react";
import { Download, MessageSquare, Plus, Trash2, Calendar } from "lucide-react";
import { NOTE_KINDS } from "@shared/constants/domain";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Cards";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/toast-context";
import { ApiError } from "@/lib/api";
import { downloadSheet } from "@/lib/excel";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  useApiMutation,
  useNotes,
  usePermissions,
  type ComplaintDetail,
  type NoteRecord
} from "@/services/queries";
import { TabPanel } from "./shared";

export function NotesTab({
  complaint,
  canEdit
}: {
  complaint: ComplaintDetail;
  canEdit: boolean;
}) {
  const toast = useToast();
  const permissions = usePermissions();
  const [showAddModal, setShowAddModal] = useState(false);
  const [kind, setKind] = useState<(typeof NOTE_KINDS)[number]>("Note");
  const [referenceDate, setReferenceDate] = useState("");
  const [content, setContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<NoteRecord | null>(null);

  const notesQuery = useNotes(complaint._id);
  const notes = notesQuery.data?.notes ?? [];

  const invalidate = [["notes", complaint._id]];

  const addNoteMutation = useApiMutation<
    { note: NoteRecord },
    { kind: string; referenceDate?: string; content: string }
  >("POST", `/api/complaints/${complaint._id}/notes`, invalidate);

  const deleteNoteMutation = useApiMutation<{ message: string }, string>(
    "DELETE",
    (noteId) => `/api/complaints/${complaint._id}/notes/${noteId}`,
    invalidate
  );

  async function handleAddSubmit() {
    if (content.trim().length < 2) {
      toast.error("Note content must be at least 2 characters");
      return;
    }

    try {
      await addNoteMutation.mutateAsync({
        kind,
        referenceDate: referenceDate ? new Date(referenceDate).toISOString() : undefined,
        content: content.trim()
      });
      toast.success(`${kind} added successfully`);
      setShowAddModal(false);
      setContent("");
      setReferenceDate("");
      setKind("Note");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to add note";
      toast.error(message);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await deleteNoteMutation.mutateAsync(deleteTarget._id);
      toast.success("Note deleted");
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to delete note";
      toast.error(message);
    }
  }

  function handleExportExcel() {
    if (notes.length === 0) {
      toast.error("No notes to export");
      return;
    }
    const rows = notes.map((note) => ({
      Type: note.kind,
      Content: note.content,
      "Reference Date": note.referenceDate ? formatDate(note.referenceDate) : "",
      "Created By": note.createdByName ?? "Unknown",
      "Created At": formatDateTime(note.createdAt)
    }));
    downloadSheet(`${complaint.number}-Notes`, "Notes", rows);
    toast.success("Notes exported to Excel");
  }

  return (
    <TabPanel>
      <SectionCard
        title="Notes & Minutes of Meeting (MOM)"
        description="Communication log, customer phone interactions, review meeting summaries, and internal discussions."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={handleExportExcel}
              disabled={notes.length === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export Notes
            </Button>
            {canEdit && (
              <Button
                type="button"
                variant="primary"
                className="text-xs"
                onClick={() => setShowAddModal(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Note / MOM
              </Button>
            )}
          </div>
        }
      >
        {notesQuery.isLoading ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="py-8 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No notes or MOMs recorded</p>
            <p className="text-xs text-slate-400">
              Click &quot;Add Note / MOM&quot; above to log meeting minutes or important correspondence.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => {
              const isOwn =
                note.createdBy === permissions.user?.id ||
                note.createdByName === permissions.user?.name;
              const canDelete = isOwn || permissions.isMasterAdmin;

              return (
                <div
                  key={note._id}
                  className="rounded-xl border border-slate-200 bg-white p-4 transition"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        tone={note.kind === "MOM" ? "green" : note.kind === "Email" ? "neutral" : "amber"}
                      >
                        {note.kind}
                      </StatusBadge>
                      <span className="text-xs font-semibold text-slate-800">
                        {note.createdByName ?? "User"}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-400">{formatDateTime(note.createdAt)}</span>
                      {note.referenceDate && (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          <Calendar className="h-3 w-3" />
                          Ref: {formatDate(note.referenceDate)}
                        </span>
                      )}
                    </div>

                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-7 w-7 px-0 text-brand-red hover:bg-red-50"
                        title="Delete note"
                        onClick={() => setDeleteTarget(note)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="mt-3 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <Modal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        title="Add Note or Minutes of Meeting (MOM)"
      >
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Entry Kind" required>
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value as (typeof NOTE_KINDS)[number])}
              >
                {NOTE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Reference Meeting / Interaction Date">
              <Input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Note / Discussion Content" required>
            <Textarea
              rows={5}
              placeholder="Enter detailed minutes, decisions made, action items agreed, or correspondence notes..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={addNoteMutation.isPending}
              onClick={handleAddSubmit}
            >
              {addNoteMutation.isPending ? "Saving..." : "Add Entry"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Note"
        description="Are you sure you want to delete this note? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </TabPanel>
  );
}
