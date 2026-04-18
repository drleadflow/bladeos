import { cn } from "@/lib/utils";
import { Brackets } from "./Brackets";

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  brackets?: boolean;
  scanlines?: boolean;
  glow?: boolean;
  bracketColor?: string;
}

export function Panel({
  className,
  brackets = true,
  scanlines = false,
  glow = false,
  bracketColor,
  children,
  ...rest
}: PanelProps) {
  return (
    <div
      className={cn(
        "relative blade-panel rounded-md",
        glow && "blade-glow",
        className,
      )}
      {...rest}
    >
      {scanlines && (
        <div className="pointer-events-none absolute inset-0 rounded-md blade-scanlines opacity-40" />
      )}
      {brackets && <Brackets color={bracketColor} />}
      <div className="relative">{children}</div>
    </div>
  );
}
