import React from 'react';

interface CalendarHeatmapProps {
  activityDays: string[]; // ISO date strings e.g. ['2026-06-01', ...]
  weeks?: number;
}

export function CalendarHeatmap({ activityDays, weeks = 13 }: CalendarHeatmapProps) {
  const activeSet = new Set(activityDays);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build grid: `weeks` columns, 7 rows (Mon–Sun)
  // Start from the Monday of (weeks) weeks ago
  const dayOfWeek = today.getDay(); // 0=Sun
  const mondayOffset = (dayOfWeek + 6) % 7; // days since last Monday
  const gridStart = new Date(today.getTime() - (mondayOffset + (weeks - 1) * 7) * 86400000);

  const cells: Array<{ date: string; active: boolean; isToday: boolean }> = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(gridStart.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    cells.push({
      date: iso,
      active: activeSet.has(iso),
      isToday: iso === today.toISOString().slice(0, 10),
    });
  }

  // Month labels: show month name when it changes across weeks
  const monthLabels: Array<{ col: number; label: string }> = [];
  for (let w = 0; w < weeks; w++) {
    const firstDay = cells[w * 7];
    const prevFirstDay = w > 0 ? cells[(w - 1) * 7] : null;
    const month = firstDay.date.slice(0, 7);
    const prevMonth = prevFirstDay?.date.slice(0, 7);
    if (month !== prevMonth) {
      const [, m] = firstDay.date.split('-');
      const label = new Date(firstDay.date + 'T00:00:00').toLocaleString('en', { month: 'short' });
      monthLabels.push({ col: w, label });
    }
  }

  return (
    <div className="select-none">
      {/* Month row */}
      <div className="mb-1 flex gap-[3px]" style={{ paddingLeft: '20px' }}>
        {Array.from({ length: weeks }, (_, w) => {
          const label = monthLabels.find(ml => ml.col === w);
          return (
            <div key={w} className="w-[12px] flex-none text-center text-[9px] text-stone-400 leading-none">
              {label ? label.label : ''}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="flex gap-[3px]">
        {/* Day labels */}
        <div className="flex flex-col gap-[3px] pr-1">
          {['M', '', 'W', '', 'F', '', 'S'].map((label, i) => (
            <div key={i} className="h-[12px] w-[14px] flex-none text-right text-[9px] text-stone-400 leading-[12px]">
              {label}
            </div>
          ))}
        </div>

        {/* Week columns */}
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {cells.slice(w * 7, w * 7 + 7).map(cell => (
              <div
                key={cell.date}
                title={cell.date}
                className={[
                  'h-[12px] w-[12px] rounded-[2px] flex-none',
                  cell.isToday ? 'ring-1 ring-emerald-500' : '',
                  cell.active
                    ? 'bg-emerald-500'
                    : 'bg-stone-100',
                ].join(' ')}
              />
            ))}
          </div>
        ))}
      </div>

      <p className="mt-2 text-[10px] text-stone-400">
        Each square is one day. Green = you wrote.
      </p>
    </div>
  );
}
