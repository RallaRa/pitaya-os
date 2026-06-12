'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Play } from 'lucide-react';
import { overlay } from '@/components/overlay';
import { queryKeys } from '@/lib/queries/keys';
import type { BriefingAction } from '@/lib/salesEvidence';
import {
  BRIEFING_EXECUTE_LABELS,
  getExecutableBriefingAction,
  isBriefingActionExecutable,
} from '@/lib/briefingActions';
import { runBriefingActionExecute } from '@/lib/briefing/runBriefingActionExecute';

export default function BriefingActionExecuteButton({
  action,
  storeId,
}: {
  action: BriefingAction;
  storeId: string;
}) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const exec = getExecutableBriefingAction(action);

  if (!isBriefingActionExecutable(exec)) return null;

  const label = BRIEFING_EXECUTE_LABELS[exec.actionType as keyof typeof BRIEFING_EXECUTE_LABELS];

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await runBriefingActionExecute(exec, storeId);
          void queryClient.invalidateQueries({
            queryKey: queryKeys.dashboard.briefingAttribution(storeId),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : '실행에 실패했습니다';
          overlay.toast(msg, { variant: 'error' });
        } finally {
          setLoading(false);
        }
      }}
      className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-teal-300 hover:text-teal-200 bg-teal-900/30 hover:bg-teal-900/50 border border-teal-700/40 px-2 py-0.5 rounded-md transition-colors disabled:opacity-50"
    >
      {loading
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : <Play className="w-3 h-3" />}
      {label}
    </button>
  );
}
