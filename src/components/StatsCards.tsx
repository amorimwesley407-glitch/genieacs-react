import { Wifi, WifiOff, Router, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface StatsCardsProps {
  totalCount: number;
  onlineCount: number;
  offlineCount: number;
}

export function StatsCards({ totalCount, onlineCount, offlineCount }: StatsCardsProps) {
  const offlineRate = totalCount > 0 ? Math.round((offlineCount / totalCount) * 100) : 0;
  const onlineRate = totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0;

  const pieData = [
    { name: "Online", value: onlineCount, color: "hsl(142 71% 45%)" },
    { name: "Offline", value: offlineCount, color: "hsl(0 72% 51%)" },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border rounded-lg px-3 py-2 shadow-lg text-xs">
          <p className="font-semibold">{payload[0].name}</p>
          <p className="text-muted-foreground">{payload[0].value} dispositivos</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Card 1 — Total + mini donut */}
      <Card className="glass-card hover:glow-primary transition-all duration-300 animate-fade-in md:col-span-1">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total de Dispositivos</p>
              <p className="text-4xl font-bold text-foreground">{totalCount}</p>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-success inline-block" />
                  <span className="text-xs text-muted-foreground">{onlineCount} online</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-destructive inline-block" />
                  <span className="text-xs text-muted-foreground">{offlineCount} offline</span>
                </div>
              </div>
            </div>
            <div className="w-20 h-20">
              {totalCount > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={22}
                      outerRadius={36}
                      strokeWidth={0}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Router className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2 — Online rate */}
      <Card className="glass-card hover:glow-primary transition-all duration-300 animate-fade-in">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Wifi className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Online</p>
              <p className="text-2xl font-bold text-foreground">{onlineCount}</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {onlineRate >= 80 ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : onlineRate >= 50 ? (
                <Minus className="h-4 w-4 text-warning" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              <span className={`text-xs font-semibold ${onlineRate >= 80 ? "text-success" : onlineRate >= 50 ? "text-warning" : "text-destructive"}`}>
                {onlineRate}%
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-success transition-all duration-700"
                style={{ width: `${onlineRate}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">{onlineRate}% da frota online</p>
          </div>
        </CardContent>
      </Card>

      {/* Card 3 — Offline rate */}
      <Card className="glass-card hover:glow-primary transition-all duration-300 animate-fade-in">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <WifiOff className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Offline</p>
              <p className="text-2xl font-bold text-foreground">{offlineCount}</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {offlineRate === 0 ? (
                <TrendingDown className="h-4 w-4 text-success" />
              ) : offlineRate <= 20 ? (
                <Minus className="h-4 w-4 text-warning" />
              ) : (
                <TrendingUp className="h-4 w-4 text-destructive" />
              )}
              <span className={`text-xs font-semibold ${offlineRate === 0 ? "text-success" : offlineRate <= 20 ? "text-warning" : "text-destructive"}`}>
                {offlineRate}%
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-destructive transition-all duration-700"
                style={{ width: `${offlineRate}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {offlineRate === 0
                ? "Nenhum dispositivo offline 🎉"
                : `${offlineRate}% da frota offline`}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
