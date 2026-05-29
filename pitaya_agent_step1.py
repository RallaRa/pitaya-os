#!/usr/bin/env python3
"""피타야 개발 에이전트 Step 1: Gemini와 대화로 신규 기능 정의"""
import os
import sys
import json
import hashlib
import atexit
from datetime import datetime
from pathlib import Path

FEATURES_DIR = Path("pitaya_features")

PITAYA_CONTEXT = """
## 기존 프로젝트: Pitaya OS (소상공인 매장 관리 SaaS)
- 프레임워크: Next.js 16 (App Router, Turbopack), TypeScript strict
- DB: Firestore (Firebase Admin SDK — 서버), Firebase Client SDK (클라이언트)
- 인증: Google OAuth signInWithPopup + Firebase ID Token (Bearer 헤더)
- 배포: Vercel (Hobby plan — cron 1개 제한)
- UI: Tailwind CSS, lucide-react 아이콘, react-grid-layout (대시보드만)
- AI: Gemini / Claude / GPT-4o / Groq 멀티모델

## 기존 파일 구조
- src/app/dashboard/{기능}/page.tsx   — 페이지
- src/app/api/{기능}/route.ts         — API Route Handler
- src/components/{컴포넌트}.tsx       — 공통 컴포넌트
- src/context/{Context}.tsx           — React Context
- src/lib/{유틸}.ts                   — 서버/클라이언트 공통 유틸

## 인증 패턴 (반드시 준수)
- 서버 API: verifyToken(req) from src/lib/authVerify.ts
- 클라이언트: getAuthHeaders() / getAuthJsonHeaders() from src/lib/getAuthHeaders.ts
- 스토어 컨텍스트: useStore() → { currentStore, storesLoaded }

## 완성된 기능 (중복 개발 금지)
- 대시보드, AI대화, 메신저, 일마감보고, 위생점검, 캘린더, 거래처관리,
  AI매입관리, 품목별매출추이, AI예측변수설정, 권한설정, 고객관리, POS브릿지
"""


class C:
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'
    # readline이 invisible 문자를 무시하도록 감싸는 마커 (커서 위치 정확히 계산)
    RL_START = '\001'
    RL_END = '\002'

    @classmethod
    def prompt(cls, color: str, text: str) -> str:
        return f"{cls.RL_START}{color}{cls.RL_END}{text}{cls.RL_START}{cls.END}{cls.RL_END}"


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

def gem(text: str) -> None:
    print(f"\n{C.GREEN}🤖 Gemini:{C.END}\n{C.GREEN}{text}{C.END}\n")

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


def init_gemini():
    try:
        from google import genai
    except ImportError:
        err("google-genai 미설치: pip install google-genai")
        sys.exit(1)

    key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        err("GEMINI_API_KEY 환경변수 없음")
        sys.exit(1)

    client = genai.Client(api_key=key)
    ok("Gemini 연결 완료 (gemini-2.5-flash-lite)")
    return client


def save_feature(feature_dir: Path, data: dict) -> None:
    feature_dir.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.now().isoformat()
    idx_path = feature_dir / "project_idx.json"
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    ok(f"저장됨: {idx_path}")


def extract_summary(client, conversation_log: list, feature_name: str) -> dict:
    conv_text = "\n".join(f"[{m['role']}] {m['content']}" for m in conversation_log)
    prompt = f"""다음 대화를 분석하여 Pitaya OS 신규 기능 요약을 생성하세요.

대화:
{conv_text}

반드시 아래 JSON 형식으로만 응답하세요 (마크다운 없이 순수 JSON):
{{
  "project_goal": "기능 핵심 목표 한 문장",
  "main_features": ["세부기능1", "세부기능2", "세부기능3"],
  "tech_stack": ["Next.js 16", "TypeScript", "Firestore", "Tailwind CSS"],
  "new_pages": ["src/app/dashboard/기능명/page.tsx"],
  "new_apis": ["src/app/api/기능명/route.ts"],
  "new_components": ["src/components/기능컴포넌트.tsx"],
  "firestore_collections": ["신규컬렉션명 — 설명"],
  "target_users": "admin/user/staff 등 대상 역할",
  "unclear_points": [],
  "notes": "특이사항"
}}"""
    try:
        response = client.models.generate_content(model="gemini-2.5-flash-lite", contents=prompt)
        text = response.text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        return json.loads(text)
    except Exception as e:
        warn(f"자동 요약 실패 ({e}), 기본값 사용")
        return {
            "project_goal": f"{feature_name} 기능",
            "main_features": [],
            "tech_stack": ["Next.js 16", "TypeScript", "Firestore", "Tailwind CSS"],
            "new_pages": [],
            "new_apis": [],
            "new_components": [],
            "firestore_collections": [],
            "target_users": "",
            "unclear_points": [],
            "notes": "",
        }


def run_conversation(client, feature_name: str, feature_data: dict, feature_dir: Path) -> None:
    system_prompt = (
        f"당신은 Pitaya OS 프로젝트의 시니어 풀스택 개발자입니다.\n"
        f"사용자가 요청한 '{feature_name}' 신규 기능을 정의하도록 돕습니다.\n\n"
        f"{PITAYA_CONTEXT}\n\n"
        "다음 항목을 파악하세요:\n"
        "1. 기능의 목표와 해결하는 문제\n"
        "2. 세부 기능 목록 (UI, API, DB)\n"
        "3. 필요한 새 페이지/API/컴포넌트 경로\n"
        "4. Firestore에 추가될 컬렉션/필드\n"
        "5. 접근 권한 (어떤 role이 사용 가능한지)\n\n"
        "기존 완성된 기능과 중복되지 않도록 주의하세요.\n"
        "충분한 정보 수집 시 마지막 응답에 '[설계완료]' 태그를 포함하세요. 한국어로 대화하세요."
    )

    from google.genai import types as genai_types
    chat = client.chats.create(
        model="gemini-2.5-flash-lite",
        config=genai_types.GenerateContentConfig(system_instruction=system_prompt),
    )
    sys_("Gemini 생각 중...")
    try:
        greeting = chat.send_message(
            f"'{feature_name}' 기능 개발을 시작합니다. "
            "친근하게 인사하고 이 기능의 목표에 대해 첫 질문을 해주세요."
        )
    except Exception as e:
        err(f"Gemini 오류: {e}")
        sys.exit(1)

    gem(greeting.text)
    feature_data["conversation_log"].append({"turn": 0, "role": "gemini", "content": greeting.text})
    save_feature(feature_dir, feature_data)

    max_turns = 5
    for turn in range(1, max_turns + 1):
        sys_(f"({turn}/{max_turns}턴) 입력하세요 ('exit' 또는 '완료' 입력 시 종료)")
        try:
            user_input = input(C.prompt(C.BLUE, "You: ")).strip()
        except EOFError:
            break

        if not user_input:
            continue
        if user_input.lower() in ["exit", "quit", "종료", "완료"]:
            sys_("사용자 요청으로 대화 종료")
            break

        feature_data["conversation_log"].append({"turn": turn, "role": "user", "content": user_input})
        sys_("Gemini 생각 중...")
        try:
            response = chat.send_message(user_input)
            reply = response.text
        except Exception as e:
            err(f"Gemini 응답 오류: {e}")
            continue

        gem(reply)
        feature_data["conversation_log"].append({"turn": turn, "role": "gemini", "content": reply})
        save_feature(feature_dir, feature_data)

        if "[설계완료]" in reply or "[완료]" in reply:
            ok("설계 완료 태그 감지!")
            break


def main() -> None:
    load_env()
    print(f"\n{C.BOLD}{C.CYAN}{'='*60}{C.END}")
    print(f"{C.BOLD}{C.CYAN}{'🚀 피타야 개발 에이전트 Step 1':^60}{C.END}")
    print(f"{C.BOLD}{C.CYAN}{'='*60}{C.END}\n")
    print(f"{C.CYAN}기존 프로젝트에 추가할 새 기능을 정의합니다.{C.END}\n")

    try:
        feature_name = input(C.prompt(C.BLUE, "기능 이름 (영문 소문자, 하이픈 허용): ")).strip()
    except EOFError:
        feature_name = ""
    if not feature_name:
        feature_name = "new_feature"

    feature_name = feature_name.replace(" ", "-").lower()
    feature_dir = FEATURES_DIR / feature_name

    log_path = setup_logging(feature_name, step_number=1)
    info(f"로그 저장: {log_path}")
    line()

    header("【기능 정의 시작】")
    sys_("Gemini 연결 중...")
    model = init_gemini()
    line()

    pid = hashlib.md5(f"{feature_name}{datetime.now().isoformat()}".encode()).hexdigest()[:8]
    now = datetime.now().isoformat()

    feature_data: dict = {
        "project_id": pid,
        "project_name": feature_name,
        "created_at": now,
        "updated_at": now,
        "status": "defining",
        "current_step": 1,
        "pitaya_context": True,
        "summary": {},
        "conversation_log": [],
        "requirements": "",
        "design": "",
        "risks": {},
        "generated_files": [],
        "stability_analysis": {},
        "retry_count": 0,
    }

    run_conversation(model, feature_name, feature_data, feature_dir)

    sys_("기능 요약 생성 중...")
    summary = extract_summary(model, feature_data["conversation_log"], feature_name)
    feature_data["summary"] = summary
    feature_data["requirements"] = "\n".join(summary.get("main_features", []))
    feature_data["design"] = (
        f"목표: {summary.get('project_goal', '')}\n"
        f"새 페이지: {', '.join(summary.get('new_pages', []))}\n"
        f"새 API: {', '.join(summary.get('new_apis', []))}\n"
        f"새 컴포넌트: {', '.join(summary.get('new_components', []))}\n"
        f"Firestore: {', '.join(summary.get('firestore_collections', []))}\n"
        f"대상 역할: {summary.get('target_users', '')}"
    )
    feature_data["status"] = "designed"
    feature_data["current_step"] = 2
    save_feature(feature_dir, feature_data)

    # Step 2 자동 체이닝을 위해 마지막으로 처리한 기능명 저장
    (FEATURES_DIR / ".last_feature").write_text(feature_name, encoding="utf-8")

    header("✅ Step 1 완료!")
    info(f"기능 목표: {summary.get('project_goal', '')}")
    info(f"세부 기능: {len(summary.get('main_features', []))}개")
    info(f"새 페이지: {summary.get('new_pages', [])}")
    info(f"새 API: {summary.get('new_apis', [])}")
    info(f"로그 파일: {log_path}")
    line()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        warn("\n작업이 중단되었습니다. 진행 상황이 저장되었습니다.")
        sys.exit(0)
