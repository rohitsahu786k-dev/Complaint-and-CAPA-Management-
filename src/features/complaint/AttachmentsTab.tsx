import { useState } from "react";
import { ExternalLink, FileIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Cards";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/toast-context";
import { ApiError } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import {
  useApiMutation,
  useAttachments,
  usePermissions,
  type AttachmentRecord,
  type ComplaintDetail
} from "@/services/queries";
import { TabPanel, UploadButton, useCloudinaryUpload } from "./shared";

export function AttachmentsTab({
  complaint,
  canEdit
}: {
  complaint: ComplaintDetail;
  canEdit: boolean;
}) {
  const toast = useToast();
  const permissions = usePermissions();
  const [deleteTarget, setDeleteTarget] = useState<AttachmentRecord | null>(null);

  const attachmentsQuery = useAttachments("Complaint", complaint._id);
  const attachments = attachmentsQuery.data?.attachments ?? [];

  const { upload, uploading } = useCloudinaryUpload({
    entityType: "Complaint",
    entityId: complaint._id,
    purpose: "Complaint Attachment",
    company: complaint.company
  });

  const deleteMutation = useApiMutation<{ message: string }, string>(
    "DELETE",
    (id) => `/api/attachments/${id}`,
    [["attachments", "Complaint", complaint._id], ["complaint", complaint._id]]
  );

  async function handleFiles(files: FileList) {
    let successCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        await upload(file);
        successCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to upload ${file.name}`;
        toast.error(message);
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount} file${successCount > 1 ? "s" : ""} uploaded successfully`);
      attachmentsQuery.refetch();
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget._id);
      toast.success(`Removed ${deleteTarget.originalFilename}`);
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to delete attachment";
      toast.error(message);
    }
  }

  return (
    <TabPanel>
      <SectionCard
        title="Evidence & Attachments"
        description="Customer emails, inspection photos, test certificates, and signed reports stored securely on Cloudinary."
        actions={
          canEdit ? (
            <UploadButton
              label="Upload Attachment"
              uploading={uploading}
              disabled={!canEdit}
              onFiles={handleFiles}
            />
          ) : undefined
        }
      >
        <DataTable<AttachmentRecord>
          rows={attachments}
          isLoading={attachmentsQuery.isLoading}
          rowKey={(item) => item._id}
          emptyTitle="No attachments uploaded"
          emptyDescription="Upload photos, emails, lab reports, or customer complaints using the button above."
          columns={[
            {
              key: "filename",
              header: "File Name",
              render: (item) => (
                <div className="flex items-center gap-2">
                  <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="font-semibold text-slate-900 truncate max-w-xs sm:max-w-md">
                    {item.originalFilename}
                  </span>
                </div>
              )
            },
            {
              key: "type",
              header: "Type",
              render: (item) => (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-600">
                  {item.mimeType.split("/")[1] || item.mimeType}
                </span>
              )
            },
            {
              key: "size",
              header: "Size",
              render: (item) => (
                <span className="text-xs text-slate-600">{formatBytes(item.bytes)}</span>
              )
            },
            {
              key: "uploader",
              header: "Uploaded By",
              render: (item) => (
                <span className="text-xs text-slate-700">
                  {item.uploadedBy?.name ?? "System"}
                </span>
              )
            },
            {
              key: "date",
              header: "Uploaded On",
              render: (item) => (
                <span className="text-xs text-slate-500">{formatDateTime(item.uploadedAt)}</span>
              )
            },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (item) => {
                const canDelete =
                  permissions.isMasterAdmin ||
                  canEdit ||
                  item.uploadedBy?.name === permissions.user?.name;

                return (
                  <div className="flex items-center justify-end gap-1.5">
                    <a
                      href={item.secureUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      title="View / Download file"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Open</span>
                    </a>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 px-0 text-brand-red hover:bg-red-50"
                        title="Delete attachment"
                        disabled={deleteMutation.isPending}
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              }
            }
          ]}
        />
      </SectionCard>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Attachment"
        description={`Are you sure you want to permanently delete "${deleteTarget?.originalFilename}"? The Cloudinary media asset will also be destroyed.`}
        confirmLabel="Delete Permanently"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </TabPanel>
  );
}
