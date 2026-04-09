import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

interface ConsumptionChartProps {
  data: { time: string; value: number }[];
  height?: number;
  color?: string;
  showAxis?: boolean;
}

const ConsumptionChart = ({ data, height = 180, showAxis = true }: ConsumptionChartProps) => {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(168, 55%, 38%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(168, 55%, 38%)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {showAxis && (
            <>
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'hsl(220, 10%, 50%)' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'hsl(220, 10%, 50%)' }}
                unit="W"
              />
            </>
          )}
          <Tooltip
            contentStyle={{
              background: 'hsl(0, 0%, 100%)',
              border: '1px solid hsl(220, 15%, 90%)',
              borderRadius: '0.75rem',
              fontSize: '13px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
            formatter={(value: number) => [`${value} W`, 'Consumo']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="hsl(168, 55%, 38%)"
            strokeWidth={2}
            fill="url(#energyGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ConsumptionChart;
