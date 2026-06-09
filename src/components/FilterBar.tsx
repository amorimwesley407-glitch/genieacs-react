import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  manufacturerFilter: string;
  onManufacturerFilterChange: (value: string) => void;
  manufacturers: string[];
  chartFilterActive?: boolean;
  onClearChartFilter?: () => void;
}

export function FilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  manufacturerFilter,
  onManufacturerFilterChange,
  manufacturers,
  chartFilterActive = false,
  onClearChartFilter,
}: FilterBarProps) {
  return (
    <div className="space-y-2">
      {chartFilterActive && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
          <span className="flex-1">
            ⚡ Filtro do gráfico ativo — os seletores abaixo refletem a seleção do gráfico.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1 hover:text-destructive"
            onClick={onClearChartFilter}
          >
            <X className="h-3 w-3" />
            Limpar
          </Button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por MAC, IP, serial, SSID..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>

        <Select value={manufacturerFilter} onValueChange={onManufacturerFilterChange}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Fabricante" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Todos</SelectItem>
            {manufacturers.map((manufacturer) => (
              <SelectItem key={manufacturer} value={manufacturer}>
                {manufacturer}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
