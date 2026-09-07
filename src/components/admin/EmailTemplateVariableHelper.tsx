import { Code2, Copy } from "lucide-react";
import { useState } from "react";

type VariableHelperProps = {
  variables: string[];
  onSelectVariable?: (variableName: string) => void;
};

export function EmailTemplateVariableHelper({ variables, onSelectVariable }: VariableHelperProps) {
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const copyToClipboard = (token: string) => {
    const placeholder = `{{${token}}}`;
    navigator.clipboard.writeText(placeholder);
    setCopiedVar(token);
    setTimeout(() => setCopiedVar(null), 1800);
    if (onSelectVariable) {
      onSelectVariable(placeholder);
    }
  };

  const defaultVars = [
    "recipientName",
    "companyName",
    "appUrl",
    "complaintNumber",
    "complaintTitle",
    "priority",
    "dueDate",
    "ownerName",
    "actionUrl"
  ];

  const displayVars = Array.from(new Set([...variables, ...defaultVars]));

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-600">
          <Code2 className="h-3.5 w-3.5 text-brand-red" />
          Supported Variables
        </span>
        <span className="text-[11px] text-slate-400">Click to copy/insert</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {displayVars.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => copyToClipboard(v)}
            className="group flex items-center gap-1 rounded bg-white px-2 py-1 font-mono text-[11px] font-medium text-slate-700 shadow-2xs transition hover:border-brand-red hover:bg-red-50/50 hover:text-brand-red"
            title={`Insert {{${v}}}`}
          >
            <span>&#123;&#123;{v}&#125;&#125;</span>
            <Copy className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
            {copiedVar === v && (
              <span className="ml-1 rounded bg-green-100 px-1 text-[9px] font-bold text-green-700">Copied</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
