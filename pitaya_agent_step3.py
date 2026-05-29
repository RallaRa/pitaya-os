#!/usr/bin/env python3
"""피타야 개발 에이전트 Step 3: Claude로 Next.js/TypeScript 코드 생성"""
import os
import sys
import json
import atexit
import shutil
from datetime import datetime
from pathlib import Path

FEATURES_DIR = Path("pitaya_features")
PROJECT_ROOT = Path(__file__).parent  # pitaya-osv1/

PITAYA_CODE_CONTEXT = """
## Pitaya OS 코드 패턴 (반드시 준수)

### 서버 API Route (src/app/api/기능/route.ts) 템플릿
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  const { uid } = await verifyToken(req);  // 인증 필수
  const storeId = req.nextUrl.searchParams.get('storeId');
  // Firestore 조회
  const snap = await adminDb.collection('컬렉션명').doc(storeId!).get();
  return NextResponse.json({ data: snap.data() });
}

export async function POST(req: NextRequest) {
  const { uid } = await verifyToken(req);
  const body = await req.json();
  // Firestore 저장
  await adminDb.collection('컬렉션명').add({ ...body, uid, createdAt: new Date() });
  return NextResponse.json({ ok: true });
}
```

### 클라이언트 페이지 (src/app/dashboard/기능/page.tsx) 템플릿
```typescript
'use client';
import { useState, useEffect } from 'react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { Loader2 } from 'lucide-react';

export default function FeaturePage() {
  const { currentStore, storesLoaded } = useStore();
  const [data, setData] = useState<타입[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!storesLoaded || !currentStore) return;
    const load = async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/기능?storeId=${currentStore.storeId}`, { headers });
      const json = await res.json();
      setData(json.data || []);
      setIsLoading(false);
    };
    load();
  }, [storesLoaded, currentStore]);

  if (!storesLoaded || isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 text-teal-400 animate-spin" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* UI 코드 */}
    </div>
  );
}
```

### 공통 규칙
- 모든 서버 API: verifyToken(req) 필수 (미인증 시 401 자동 반환)
- 모든 클라이언트 fetch: getAuthHeaders() / getAuthJsonHeaders() 사용
- storesLoaded 체크 후 데이터 로드 (currentStore null 방지)
- Tailwind CSS 클래스: bg-slate-900, bg-slate-800, text-teal-400, border-slate-700 등 다크 테마
- 아이콘: lucide-react만 사용
- TypeScript: 모든 변수/함수에 명시적 타입 필수
- 'use client' 지시어: 클라이언트 컴포넌트에만 사용
- 서버 컴포넌트에서 Firestore 직접 접근 금지 — API route 경유 필수
"""


class C:
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'


def header(text: str) -> None:
    print(f"\n{C.BOLD}{C.CYAN}{'='*60}{C.END}")
    print(f"{C.BOLD}{C.CYAN}{text:^60}{C.END}")
    print(f"{C.BOLD}{C.CYAN}{'='*60}{C.END}\n")

def line() -> None:
    print(f"{C.CYAN}{'─'*60}{C.END}")

def ok(text: str) -> None:
    print(f"{C.GREEN}✅ {text}{C.END}")

def err(text: str) -> None:
    print(f"{C.RED}❌ {text}{C.END}")

def warn(text: str) -> None:
    print(f"{C.YELLOW}⚠️  {text}{C.END}")

def sys_(text: str) -> None:
    print(f"{C.CYAN}⚙  {text}{C.END}")

def claude_out(text: str) -> None:
    print(f"\n{C.BLUE}💻 Claude:{C.END}\n{C.BLUE}{text}{C.END}\n")

def info(text: str) -> None:
    print(f"{C.CYAN}📋 {text}{C.END}")


def load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    for candidate in [Path(".env.local"), Path(__file__).parent / ".env.local"]:
        if candidate.exists():
            load_dotenv(candidate, override=False)
            sys_(f".env.local 로드됨: {candidate.resolve()}")
            return


def setup_logging(feature_name: str, step_number: int) -> Path:
    logs_dir = FEATURES_DIR / feature_name / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = logs_dir / f"step{step_number}_{timestamp}.log"

    _original_stdout = sys.stdout
    _log_file = open(log_path, "w", encoding="utf-8")

    class DualWriter:
        def write(self, message: str) -> int:
            _original_stdout.write(message)
            return _log_file.write(message)
        def flush(self) -> None:
            _original_stdout.flush()
            _log_file.flush()
        def fileno(self) -> int:
            return _original_stdout.fileno()
        def isatty(self) -> bool:
            return _original_stdout.isatty()

    def _restore() -> None:
        sys.stdout = _original_stdout
        _log_file.close()

    atexit.register(_restore)
    sys.stdout = DualWriter()  # type: ignore[assignment]
    return log_path


def init_claude():
    try:
        import anthropic  # noqa: F401
    except ImportError:
        err("anthropic 미설치: pip install anthropic")
        sys.exit(1)

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        err("ANTHROPIC_API_KEY 환경변수 없음")
        sys.exit(1)

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    ok("Claude 연결 완료 (claude-sonnet-4-6)")
    return client


def load_feature(feature_dir: Path) -> dict:
    idx_path = feature_dir / "project_idx.json"
    if not idx_path.exists():
        err(f"기능 파일 없음: {idx_path}")
        err("Step 1을 먼저 실행하세요: python pitaya_agent_step1.py")
        sys.exit(1)
    with open(idx_path, encoding="utf-8") as f:
        return json.load(f)


def save_feature(feature_dir: Path, data: dict) -> None:
    data["updated_at"] = datetime.now().isoformat()
    idx_path = feature_dir / "project_idx.json"
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    ok(f"저장됨: {idx_path}")


def build_prompt(feature_data: dict, extra_instructions: str = "") -> str:
    summary = feature_data.get("summary", {})
    risks = feature_data.get("risks", {})
    feature_name = feature_data.get("project_name", "feature")

    features = "\n".join(f"- {f}" for f in summary.get("main_features", []))
    new_pages = "\n".join(f"- {p}" for p in summary.get("new_pages", []))
    new_apis = "\n".join(f"- {a}" for a in summary.get("new_apis", []))
    new_components = "\n".join(f"- {c}" for c in summary.get("new_components", []))
    firestore_cols = "\n".join(f"- {c}" for c in summary.get("firestore_collections", []))
    must_implement = "\n".join(f"- {item}" for item in risks.get("must_implement", []))
    avoid_items = "\n".join(f"- {item}" for item in risks.get("avoid", []))
    risk_summary = risks.get("summary_for_claude", "")
    extra = f"\n\n추가 지시사항:\n{extra_instructions}" if extra_instructions else ""

    return f"""Pitaya OS 프로젝트에 추가할 '{feature_name}' 기능의 Next.js/TypeScript 코드를 작성하세요.

## 기능 정보
이름: {feature_name}
목표: {summary.get("project_goal", "")}
세부 기능:
{features}

## 생성할 파일 목록
새 페이지:
{new_pages}
새 API:
{new_apis}
새 컴포넌트:
{new_components}
Firestore 컬렉션:
{firestore_cols}
대상 역할: {summary.get("target_users", "")}

## 아키텍처/보안 지침
{risk_summary}

반드시 구현:
{must_implement}

피해야 할 것:
{avoid_items}

{PITAYA_CODE_CONTEXT}{extra}

## TypeScript 코드 작성 규칙
- 'use client' 지시어: 클라이언트 컴포넌트 최상단에 필수
- 모든 타입을 명시적으로 선언 (any 사용 금지)
- 모든 서버 API에 verifyToken(req) 인증 필수
- 모든 클라이언트 fetch에 getAuthHeaders() 사용
- Tailwind CSS 다크 테마 (bg-slate-900, text-teal-400 등)
- lucide-react 아이콘만 사용
- storesLoaded 체크 후 데이터 로드
- 에러 처리 철저히 (try/catch + 사용자 메시지 표시)
- 환경변수로 민감정보 관리

## ★ 응답 형식 (반드시 준수)
다른 텍스트 없이 아래 JSON만 출력하세요:

{{
  "files": [
    {{
      "filename": "src/app/dashboard/{feature_name}/page.tsx",
      "content": "전체 파일 내용",
      "description": "파일 설명"
    }},
    {{
      "filename": "src/app/api/{feature_name}/route.ts",
      "content": "...",
      "description": "API Route"
    }}
  ]
}}"""


def extract_json_from_response(raw: str) -> str:
    raw = raw.strip()
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        parts = raw.split("```")
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    return raw


def generate_code(client, feature_data: dict, extra_instructions: str = "") -> list:
    import anthropic
    prompt = build_prompt(feature_data, extra_instructions)
    sys_("Claude(Sonnet 4.6) 코드 생성 중... (60~120초 소요)")
    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text
    except Exception as e:
        err(f"Claude API 오류: {e}")
        sys.exit(1)

    claude_out(f"응답 수신 완료 ({len(raw)}자)")
    clean = extract_json_from_response(raw)

    try:
        files_data = json.loads(clean)
    except json.JSONDecodeError as e:
        err(f"JSON 파싱 실패: {e}")
        sys.exit(1)

    files = files_data.get("files", [])
    if not files:
        err("생성된 파일 없음. Claude 응답을 확인하세요.")
        sys.exit(1)

    return files


def save_files(feature_dir: Path, files: list) -> list[str]:
    """생성된 파일을 staging 폴더에 저장."""
    saved_paths: list[str] = []
    for file_info in files:
        filename = file_info.get("filename", "").strip()
        content = file_info.get("content", "")
        description = file_info.get("description", "")
        if not filename or not content:
            warn(f"파일 정보 불완전, 건너뜀: {filename}")
            continue

        file_path = feature_dir / filename
        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            ok(f"생성: {file_path} — {description}")
            saved_paths.append(str(file_path))
        except OSError as e:
            err(f"파일 저장 실패 {file_path}: {e}")
            sys.exit(1)

    return saved_paths


def show_deploy_preview(feature_dir: Path, files: list) -> None:
    """생성 후 프로젝트 적용 안내."""
    header("📋 프로젝트 적용 방법")
    print(f"{C.CYAN}Step 4 완료 후 아래 명령으로 프로젝트에 복사하세요:{C.END}\n")
    for file_info in files:
        filename = file_info.get("filename", "")
        if filename:
            src = feature_dir / filename
            dst = PROJECT_ROOT / filename
            print(f"  {C.GREEN}cp{C.END} {src}")
            print(f"     → {dst}\n")
    line()


def main() -> None:
    if len(sys.argv) < 2:
        err("기능 이름 필요")
        print("  사용법: python pitaya_agent_step3.py <기능_이름>")
        sys.exit(1)

    feature_name = sys.argv[1]
    feature_dir = FEATURES_DIR / feature_name
    extra_instructions = sys.argv[2] if len(sys.argv) > 2 else ""

    load_env()
    log_path = setup_logging(feature_name, step_number=3)

    header("💻 피타야 개발 에이전트 Step 3 — 코드 생성")
    info(f"로그 저장: {log_path}")
    line()

    sys_("기능 정의 로드 중...")
    feature_data = load_feature(feature_dir)
    info(f"기능: {feature_data['project_name']} (ID: {feature_data['project_id']})")
    info(f"위험 수준: {feature_data.get('risks', {}).get('overall_risk_level', '미분석')}")
    if extra_instructions:
        info(f"추가 지시: {extra_instructions}")
    line()

    sys_("Claude 연결 중...")
    client = init_claude()
    line()

    files = generate_code(client, feature_data, extra_instructions)

    header("📁 파일 저장 중 (staging)")
    saved_paths = save_files(feature_dir, files)

    feature_data["generated_files"] = saved_paths
    feature_data["status"] = "coded"
    feature_data["current_step"] = 4
    save_feature(feature_dir, feature_data)

    show_deploy_preview(feature_dir, files)

    header("✅ Step 3 완료!")
    info(f"{len(saved_paths)}개 파일 생성됨 (staging 폴더)")
    for path in saved_paths:
        print(f"  📄 {path}")
    info(f"로그 파일: {log_path}")
    print(f"\n  ▶  Step 4 실행:")
    print(f"     python pitaya_agent_step4.py {feature_name}")
    line()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        warn("\n작업이 중단되었습니다. 진행 상황이 저장되었습니다.")
        sys.exit(0)
