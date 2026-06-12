'use client';

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import type { KisCandle } from '@/lib/stock-trader/kisQuote';
import { formatChartDate } from '@/lib/stock-trader/kisQuote';

interface Props {
  candles: KisCandle[];
  height?: number;
}

export default function StockCandleChart({ candles, height = 280 }: Props) {
  const data = candles.map(c => ({
    ...c,
    label: formatChartDate(c.date),
    volM: Math.round(c.volume / 1000),
  }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-slate-500 text-sm" style={{ height }}>
        차트 데이터 없음
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} minTickGap={24} />
        <YAxis
          yAxisId="price"
          domain={['auto', 'auto']}
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          width={52}
          tickFormatter={v => `${(Number(v) / 1000).toFixed(0)}k`}
        />
        <YAxis
          yAxisId="vol"
          orientation="right"
          tick={{ fill: '#64748b', fontSize: 9 }}
          width={36}
          tickFormatter={v => `${v}`}
        />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
          formatter={(value, name) => {
            if (name === 'volM') return [`${value}천주`, '거래량'];
            return [Number(value).toLocaleString(), name === 'close' ? '종가' : String(name)];
          }}
          labelFormatter={l => `날짜 ${l}`}
        />
        <Bar yAxisId="vol" dataKey="volM" fill="#334155" opacity={0.5} barSize={4} />
        <Line
          yAxisId="price"
          type="monotone"
          dataKey="close"
          stroke="#2dd4bf"
          dot={false}
          strokeWidth={2}
        />
        <Line yAxisId="price" type="monotone" dataKey="high" stroke="#475569" dot={false} strokeWidth={1} strokeDasharray="2 2" />
        <Line yAxisId="price" type="monotone" dataKey="low" stroke="#475569" dot={false} strokeWidth={1} strokeDasharray="2 2" />
        {data.length > 0 && (
          <ReferenceLine yAxisId="price" y={data[data.length - 1].close} stroke="#14b8a6" strokeDasharray="4 4" />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
