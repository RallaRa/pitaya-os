export default function StockTraderSettingsPage() {
  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <h1 className="text-lg font-bold text-white">연동 설정</h1>
      <p className="text-sm text-slate-400">
        Pitaya(Vercel/로컬) 환경변수에 stock-trader 서버를 연결합니다. 슈퍼유저만 이 메뉴에 접근합니다.
      </p>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 space-y-3 text-sm font-mono">
        <p className="text-slate-300">STOCK_TRADER_API_URL=http://localhost:8787</p>
        <p className="text-slate-300">STOCK_TRADER_API_TOKEN=server/.env 의 API_TOKEN</p>
      </div>

      <ul className="text-sm text-slate-400 space-y-2 list-disc pl-5">
        <li>로컬: Mac에서 <code className="text-slate-300">./scripts/start-server.sh</code> 실행</li>
        <li>Vercel: 공인 IP 등록된 클라우드/VPS URL 사용 (localhost 불가)</li>
        <li>KIS 실전: <code className="text-slate-300">stock-trader-android/docs/KIS_LIVE.md</code></li>
      </ul>
    </div>
  );
}
