import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "online" | "offline" | "rebooting";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border",
        status === "online" && "status-online",
        status === "offline" && "status-offline",
        status === "rebooting" &&
          "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"
      )}
    >
      <span
        className={cn(
          "w-2 h-2 rounded-full",
          status === "online" && "bg-success animate-pulse",
          status === "offline" && "bg-destructive",
          status === "rebooting" && "bg-yellow-500 animate-pulse"
        )}
      />

      {status === "online" && "Online"}
      {status === "offline" && "Offline"}
      {status === "rebooting" && "Rebooting"}
    </span>
  );
}