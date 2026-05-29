#!/usr/bin/env python3
"""피타야 개발 에이전트 Step 2: GPT-4o로 Next.js/TypeScript 위험 분석"""
import os
import sys
import json
import atexit
from datetime import datetime
from pathlib import Path

FEATURES_DIR = Path("pitaya_features")


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

def gpt(text: str) -> None:
    print(f"\n{C.YELLOW}🔍 ChatGPT:{C.END}\n{C.YELLOW}{text}{C.END}\n")

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


def init_openai():
    try:
        from openai import OpenAI
    except ImportError:
        err("openai 미설치: pip install openai")
        sys.exit(1)

    key = os.getenv("OPENAI_API_KEY")
    if not key:
        err("OPENAI_API_KEY 환경변수 없음")
        sys.exit(1)

    from openai import OpenAI
    client = OpenAI(api_key=key)
    ok("ChatGPT 연결 완료 (gpt-4o)")
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


def build_analysis_prompt(feature_data: dict) -> str:
    summary = feature_data.get("summary", {})
    conv_log = feature_data.get("conversation_log", [])
    conv_text = "\n".join(f"[{m['role']}] {m['content']}" for m in conv_log[-10:])

    new_pages = json.dumps(summary.get("new_pages", []), ensure_ascii=False)
    new_apis = json.dumps(summary.get("new_apis", []), ensure_ascii=False)
    new_components = json.dumps(summary.get("new_components", []), ensure_ascii=False)
    firestore_cols = json.dumps(summary.get("firestore_collections", []), ensure_ascii=False)

    return f"""당신은 Next.js + TypeScript + Firebase 전문 시니어 아키텍트입니다.
Pitaya OS 프로젝트에 추가될 다음 기능의 위험 요소를 분석하세요.

## 기존 프로젝트 환경
- Next.js 16 App Router, TypeScript strict
- Firebase Firestore + Firebase Admin SDK (서버)
- Firebase Auth (ID Token Bearer 인증)
- Tailwind CSS, lucide-react
- Vercel 배포 (Hobby plan — cron 1개 제한)

## 신규 기능 정보
기능명: {feature_data.get("project_name")}
목표: {summary.get("project_goal", "")}
세부 기능: {json.dumps(summary.get("main_features", []), ensure_ascii=False)}
새 페이지: {new_pages}
새 API: {new_apis}
새 컴포넌트: {new_components}
Firestore 컬렉션: {firestore_cols}
대상 역할: {summary.get("target_users", "")}

대화 기록:
{conv_text}

반드시 아래 JSON 형식으로만 응답하세요 (마크다운 없이 순수 JSON):
{{
  "security_risks": [
    {{
      "risk": "위험 이름",
      "severity": "critical/high/medium/low",
      "description": "상세 설명",
      "mitigation": "완화 방법 (verifyToken 적용 등 구체적으로)"
    }}
  ],
  "performance_risks": [
    {{
      "risk": "위험 이름",
      "potential_impact": "예상 영향",
      "solution": "해결책 (캐싱, 페이지네이션 등)"
    }}
  ],
  "architecture_risks": [
    {{
      "risk": "위험 이름",
      "reason": "이유",
      "recommendation": "Next.js App Router 패턴에 맞는 권장사항"
    }}
  ],
  "typescript_risks": [
    {{
      "risk": "타입 안전성 위험",
      "solution": "해결책"
    }}
  ],
  "must_implement": [
    "verifyToken() 인증 — 모든 API route에 필수",
    "getAuthHeaders() — 모든 클라이언트 fetch에 필수"
  ],
  "avoid": [
    "하드코딩된 uid/email/storeId",
    "인증 없는 Firestore 직접 접근"
  ],
  "overall_risk_level": "high/medium/low",
  "summary_for_claude": "Claude에게 전달할 핵심 지시사항 (Next.js/TypeScript/Firebase 패턴 강조, 한국어)"
}}"""


def analyze_risks(client, feature_data: dict) -> dict:
    prompt = build_analysis_prompt(feature_data)
    sys_("ChatGPT(GPT-4o) 분석 중... (30~60초 소요)")
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "당신은 Next.js + Firebase 전문 시니어 아키텍트입니다. 순수 JSON으로만 응답합니다.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
        raw = response.choices[0].message.content.strip()
    except Exception as e:
        err(f"ChatGPT API 오류: {e}")
        sys.exit(1)

    try:
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()
        return json.loads(raw)
    except json.JSONDecodeError as e:
        warn(f"JSON 파싱 실패 ({e}), 기본값 사용")
        return {
            "security_risks": [],
            "performance_risks": [],
            "architecture_risks": [],
            "typescript_risks": [],
            "must_implement": ["verifyToken() 인증", "getAuthHeaders() 클라이언트 인증"],
            "avoid": ["하드코딩된 uid", "인증 없는 API"],
            "overall_risk_level": "medium",
            "summary_for_claude": raw[:500] if raw else "기본 보안 및 성능을 고려하여 코드를 작성하세요.",
        }


def display_risks(risks: dict) -> None:
    level = risks.get("overall_risk_level", "medium")
    level_color = C.RED if level == "high" else C.YELLOW if level == "medium" else C.GREEN

    header("🔍 ChatGPT 위험 분석 결과")
    print(f"  종합 위험 등급: {level_color}{C.BOLD}{level.upper()}{C.END}\n")

    def sev_color(severity: str) -> str:
        return C.RED if severity in ["critical", "high"] else C.YELLOW if severity == "medium" else C.GREEN

    sec = risks.get("security_risks", [])
    if sec:
        print(f"{C.RED}🔐 보안 위험:{C.END}")
        for item in sec:
            s = item.get("severity", "")
            print(f"  [{sev_color(s)}{s}{C.END}] {item.get('risk', '')}")
            print(f"       설명: {item.get('description', '')}")
            print(f"       완화: {item.get('mitigation', '')}")
        line()

    perf = risks.get("performance_risks", [])
    if perf:
        print(f"{C.YELLOW}⚡ 성능 위험:{C.END}")
        for item in perf:
            print(f"  • {item.get('risk', '')}")
            print(f"    영향: {item.get('potential_impact', '')}")
            print(f"    해결: {item.get('solution', '')}")
        line()

    arch = risks.get("architecture_risks", [])
    if arch:
        print(f"{C.BLUE}🏗️  아키텍처 위험:{C.END}")
        for item in arch:
            print(f"  • {item.get('risk', '')}")
            print(f"    이유: {item.get('reason', '')}")
            print(f"    권장: {item.get('recommendation', '')}")
        line()

    ts = risks.get("typescript_risks", [])
    if ts:
        print(f"{C.CYAN}🔷 TypeScript 위험:{C.END}")
        for item in ts:
            print(f"  • {item.get('risk', '')}")
            print(f"    해결: {item.get('solution', '')}")
        line()

    must = risks.get("must_implement", [])
    if must:
        print(f"{C.GREEN}✅ 반드시 구현:{C.END}")
        for item in must:
            print(f"  • {item}")
        line()

    avoid = risks.get("avoid", [])
    if avoid:
        print(f"{C.RED}❌ 피해야 할 것:{C.END}")
        for item in avoid:
            print(f"  • {item}")
        line()

    print(f"{C.CYAN}💬 Claude 지시사항:{C.END}")
    print(f"  {risks.get('summary_for_claude', '')}")
    line()


def main() -> None:
    if len(sys.argv) < 2:
        err("기능 이름 필요")
        print("  사용법: python pitaya_agent_step2.py <기능_이름>")
        sys.exit(1)

    feature_name = sys.argv[1]
    feature_dir = FEATURES_DIR / feature_name

    load_env()
    log_path = setup_logging(feature_name, step_number=2)

    header("🔍 피타야 개발 에이전트 Step 2 — 위험 분석")
    info(f"로그 저장: {log_path}")
    line()

    sys_("기능 정의 로드 중...")
    feature_data = load_feature(feature_dir)
    info(f"기능: {feature_data['project_name']} (ID: {feature_data['project_id']})")
    info(f"현재 상태: {feature_data['status']}")
    line()

    sys_("ChatGPT 연결 중...")
    client = init_openai()
    line()

    risks = analyze_risks(client, feature_data)
    display_risks(risks)

    feature_data["risks"] = risks
    feature_data["status"] = "risk_checked"
    feature_data["current_step"] = 3
    save_feature(feature_dir, feature_data)

    header("✅ Step 2 완료!")
    info(f"로그 파일: {log_path}")
    print(f"\n  ▶  Step 3 실행:")
    print(f"     python pitaya_agent_step3.py {feature_name}")
    line()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        warn("\n작업이 중단되었습니다. 진행 상황이 저장되었습니다.")
        sys.exit(0)
