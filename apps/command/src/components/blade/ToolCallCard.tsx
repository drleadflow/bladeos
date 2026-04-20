import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";

interface ToolCall {
  name: string;
  input: string;
  result: string;
}

export function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1 rounded-sm border border-white/10 bg-white/5 font-mono text-[10px]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-white/50 hover:text-white/70"
      >
        <Wrench size={10} />
        <span className="text-white/70">{tool.name}</span>
        {open ? <ChevronDown size={10} className="ml-auto" /> : <ChevronRight size={10} className="ml-auto" />}
      </button>
      {open && (
        <div className="border-t border-white/10 px-2 py-1 text-white/40">
          <div className="mb-0.5 text-[9px] text-white/30">Result:</div>
          <div className="max-h-24 overflow-y-auto whitespace-pre-wrap">{tool.result.slice(0, 500)}</div>
        </div>
      )}
    </div>
  );
}
