'use client';

import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { DowProfitRow } from '@/lib/dowProfitabilityCalc';
import { formatManwon } from '@/lib/dowProfitabilityCalc';

interface Props {
  rows: DowProfitRow[];
  onBarClick?: (dow: number) => void;
  selectedDow?: number | null;
  compact?: boolean;
}

export default function DowProfitabilityChart({
  rows,
  onBarClick,
  selectedDow,
  compact = false,
}: Props) {
  const sorted = [...rows].sort((a, b) => a.dow - b.dow);
  const data = sorted.map(r => ({
    name: r.dowLabel,
    dow: r.dow,
    profit: r.avgEstProfit,
    sales: r.avgSales,
    rank: r.rank,
    fill: selectedDow === r.dow ? '#2dd4bf' : r.rank === 1 ? '#14b8a6' : r.rank === rows.length ? '#64748b' : '#94a3b8',
  }));

  const height = compact ? 140 : 220;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: '#94a3b8', fontSize: compact ? 9 : 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => formatManwon(v)}
        />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: '#cbd5e1' }}
          formatter={(value: number, _name, props) => {
            const p = props.payload as { rank: number; sales: number };
            return [
              `${formatManwon(value)} (순위 ${p.rank}위)`,
              '추정 수익',
            ];
          }}
        />
        <Bar
          dataKey="profit"
          radius={[4, 4, 0, 0]}
          cursor={onBarClick ? 'pointer' : 'default'}
          onClick={(entry) => {
            const dow = (entry as { dow?: number })?.dow;
            if (dow != null) onBarClick?.(dow);
          }}
        >
          {data.map(entry => (
            <Cell key={entry.dow} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
