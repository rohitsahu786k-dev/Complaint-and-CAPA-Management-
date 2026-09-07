import { useState } from "react";
import { Mail, Settings, FileText, ListFilter, AlertTriangle } from "lucide-react";
import { EmailSettingsPanel } from "@/components/admin/EmailSettingsPanel";
import { EmailTemplateList } from "@/components/admin/EmailTemplateList";
import { EmailLogTable } from "@/components/admin/EmailLogTable";
import { EscalationMailPanel } from "@/components/admin/EscalationMailPanel";

type TabId = "templates" | "logs" | "settings" | "escalations";

export function EmailAdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>("templates");

  const tabs: Array<{ id: TabId; label: string; icon: typeof Mail }> = [
    { id: "templates", label: "Email Templates", icon: FileText },
    { id: "logs", label: "Delivery Audit Logs", icon: ListFilter },
    { id: "settings", label: "SMTP Settings", icon: Settings },
    { id: "escalations", label: "Escalation Rules", icon: AlertTriangle }
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2 text-brand-red">
          <Mail className="h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight text-brand-charcoal">
            Email Administration &amp; Automation
          </h1>
        </div>
        <p className="mt-1 text-xs text-slate-500 sm:text-sm">
          Configure notification templates, audit delivery logs, monitor SMTP infrastructure, and govern overdue escalation workflows.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200">
        <div className="flex space-x-1 sm:space-x-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-bold transition sm:px-4 sm:text-sm ${
                  isActive
                    ? "border-brand-red text-brand-red"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-brand-red" : "text-slate-400"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Panels */}
      <div className="pt-2">
        {activeTab === "templates" && <EmailTemplateList />}
        {activeTab === "logs" && <EmailLogTable />}
        {activeTab === "settings" && <EmailSettingsPanel />}
        {activeTab === "escalations" && <EscalationMailPanel />}
      </div>
    </div>
  );
}
