#!/usr/bin/env python3
"""피타야 개발 에이전트 Step 4: Groq로 TypeScript 정적 분석 + 자동수정"""
import os
import sys
import json
import atexit
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

FEATURES_DIR = Path("pitaya_features")
PROJECT_ROOT = Path(__file__).parent
MAX_RETRIES = 3


class C:
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'
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

def groq_out(text: str) -> None:
    print(f"\n{C.CYAN}⚡ Groq:{C.END}\n{C.CYAN}{text}{C.END}\n")

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


def init_groq():
    try:
        from groq import Groq  # noqa: F401
    except ImportError:
        err("groq 미설치: pip install groq")
        sys.exit(1)

    key = os.getenv("GROQ_API_KEY")
    if not key:
        err("GROQ_API_KEY 환경변수 없음")
        sys.exit(1)

    from groq import Groq
    client = Groq(api_key=key)
    ok("Groq 연결 완료 (mixtral-8x7b-32768)")
    return client


def load_feature(feature_dir: Path) -> dict:
    idx_path = feature_dir / "project_idx.json"
    if not idx_path.exists():
        err(f"기능 파일 없음: {idx_path}")
        err("Step 1부터 순서대로 실행하세요.")
        sys.exit(1)
    with open(idx_path, encoding="utf-8") as f:
        return json.load(f)


def save_feature(feature_dir: Path, data: dict) -> None:
    data["updated_at"] = datetime.now().isoformat()
    idx_path = feature_dir / "project_idx.json"
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    ok(f"저장됨: {idx_path}")


def load_generated_code(feature_data: dict) -> str:
    generated_files: list[str] = feature_data.get("generated_files", [])
    sections: list[str] = []
    for filepath in generated_files:
        path = Path(filepath)
        if not path.exists():
            warn(f"파일 없음: {path}")
            continue
        try:
            content = path.read_text(encoding="utf-8")
            sections.append(f"// ===== FILE: {path.name} =====\n{content}")
        except OSError as e:
            warn(f"파일 읽기 실패 {path}: {e}")

    if not sections:
        err("로드할 생성 파일 없음. Step 3을 먼저 실행하세요.")
        sys.exit(1)

    combined = "\n\n".join(sections)
    if len(combined) > 20000:
        warn(f"코드가 너무 김 ({len(combined)}자), 앞 20,000자만 분석합니다.")
        combined = combined[:20000] + "\n\n... (이하 생략)"
    return combined


def build_analysis_prompt(feature_data: dict, code: str) -> str:
    summary = feature_data.get("summary", {})
    return f"""다음 Next.js/TypeScript 코드를 정적 분석하세요.

프로젝트: Pitaya OS — {feature_data.get("project_name")} 기능
목표: {summary.get("project_goal", "")}
기술스택: Next.js 16 App Router, TypeScript strict, Firebase, Tailwind CSS

분석할 코드:
{code}

다음 항목을 확인하세요:
- TypeScript 타입 오류 (any 사용, 타입 누락, 잘못된 타입)
- 'use client' 지시어 누락 (클라이언트 컴포넌트)
- verifyToken() 인증 누락 (서버 API route)
- getAuthHeaders() / getAuthJsonHeaders() 누락 (클라이언트 fetch)
- storesLoaded 체크 없는 데이터 로드
- Firestore import 오류 (클라이언트에서 adminDb 사용 등)
- 미사용 import
- 하드코딩된 uid/email/storeId
- Next.js App Router 패턴 위반 (잘못된 export 등)
- 보안 취약점

반드시 아래 JSON 형식으로만 응답하세요 (마크다운 없이 순수 JSON):
{{
  "stability_score": 85,
  "code_quality_score": 80,
  "security_score": 75,
  "typescript_score": 85,
  "syntax_and_static_issues": [
    {{
      "file": "파일명.tsx",
      "severity": "high/medium/low",
      "description": "문제 설명",
      "fix": "수정 방법"
    }}
  ],
  "missing_features": ["누락된 기능"],
  "good_points": ["잘된 점"],
  "overall_verdict": "approved/needs_fix/needs_redesign"
}}"""


def analyze_stability(client, feature_data: dict, code: str) -> dict:
    prompt = build_analysis_prompt(feature_data, code)
    sys_("Groq(Mixtral) TypeScript 정적 분석 중... (10~30초 소요)")
    try:
        response = client.chat.completions.create(
            model="mixtral-8x7b-32768",
            messages=[
                {
                    "role": "system",
                    "content": "당신은 Next.js/TypeScript 코드 품질 전문가입니다. 순수 JSON으로만 응답합니다.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=4096,
        )
        raw = response.choices[0].message.content.strip()
    except Exception as e:
        err(f"Groq API 오류: {e}")
        sys.exit(1)

    try:
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()
        return json.loads(raw)
    except json.JSONDecodeError as e:
        warn(f"JSON 파싱 실패 ({e}), 기본값 반환")
        return {
            "stability_score": 70,
            "code_quality_score": 70,
            "security_score": 70,
            "typescript_score": 70,
            "syntax_and_static_issues": [],
            "missing_features": [],
            "good_points": ["코드 생성 완료"],
            "overall_verdict": "needs_fix",
        }


def score_bar(score: int, width: int = 10) -> str:
    filled = max(0, min(width, score * width // 100))
    return f"{'█' * filled}{'░' * (width - filled)}"


def score_color(score: int) -> str:
    if score >= 85:
        return C.GREEN
    if score >= 70:
        return C.YELLOW
    return C.RED


def display_analysis(analysis: dict) -> None:
    stability = analysis.get("stability_score", 0)
    quality = analysis.get("code_quality_score", 0)
    security = analysis.get("security_score", 0)
    typescript = analysis.get("typescript_score", 0)
    verdict = analysis.get("overall_verdict", "needs_fix")

    header("⚡ Groq TypeScript 정적 분석 결과")
    print(f"  안정성:     {score_color(stability)}{stability:3d}/100{C.END} {score_bar(stability)}")
    print(f"  코드품질:   {score_color(quality)}{quality:3d}/100{C.END} {score_bar(quality)}")
    print(f"  보안:       {score_color(security)}{security:3d}/100{C.END} {score_bar(security)}")
    print(f"  TypeScript: {score_color(typescript)}{typescript:3d}/100{C.END} {score_bar(typescript)}")
    line()

    verdict_map = {
        "approved": (C.GREEN, "✅ 승인됨"),
        "needs_fix": (C.YELLOW, "⚠️  수정 필요"),
        "needs_redesign": (C.RED, "❌ 재설계 필요"),
    }
    vc, vt = verdict_map.get(verdict, (C.YELLOW, "⚠️  수정 필요"))
    print(f"  판정: {vc}{C.BOLD}{vt}{C.END}\n")

    issues = analysis.get("syntax_and_static_issues", [])
    if issues:
        print(f"{C.RED}🔴 발견된 이슈:{C.END}")
        for issue in issues:
            sev = issue.get("severity", "")
            sc = C.RED if sev == "high" else C.YELLOW if sev == "medium" else C.CYAN
            print(f"  [{sc}{sev}{C.END}] {issue.get('file', '')} — {issue.get('description', '')}")
            print(f"       수정: {issue.get('fix', '')}")
        line()

    good = analysis.get("good_points", [])
    if good:
        print(f"{C.GREEN}👍 잘된 점:{C.END}")
        for item in good:
            print(f"  • {item}")
        line()

    missing = analysis.get("missing_features", [])
    if missing:
        print(f"{C.YELLOW}📋 누락된 기능:{C.END}")
        for item in missing:
            print(f"  • {item}")
        line()


def get_user_choice(stability: int, verdict: str) -> int:
    if stability >= 85 and verdict == "approved":
        ok(f"안정성 {stability}점 달성! 완료 조건 충족.")
        return 0

    warn(f"안정성 {stability}점 (기준: 85점 이상)")
    print(f"\n{C.CYAN}다음 중 선택하세요:{C.END}")
    print(f"  {C.GREEN}1){C.END} Claude 자동 수정 (Step 3 재실행)")
    print(f"  {C.YELLOW}2){C.END} 세부 지시 입력 후 재생성")
    print(f"  {C.CYAN}3){C.END} 현재 코드 그대로 수락 (프로젝트에 적용)")
    line()

    while True:
        try:
            choice = input(C.prompt(C.BLUE, "선택 (1-3): ")).strip()
        except EOFError:
            return 3
        if choice in ["1", "2", "3"]:
            return int(choice)
        warn("1~3 중 하나를 선택하세요.")


def deploy_to_project(feature_dir: Path, feature_data: dict) -> None:
    """승인된 파일을 실제 프로젝트에 복사."""
    generated_files: list[str] = feature_data.get("generated_files", [])
    deployed: list[str] = []

    header("🚀 프로젝트에 파일 적용 중")
    for filepath in generated_files:
        src = Path(filepath)
        if not src.exists():
            warn(f"파일 없음: {src}")
            continue

        # pitaya_features/feature_name/src/app/... → src/app/... 로 변환
        try:
            relative = src.relative_to(feature_dir)
        except ValueError:
            warn(f"경로 변환 실패: {src}")
            continue

        dst = PROJECT_ROOT / relative
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        ok(f"복사: {dst}")
        deployed.append(str(dst))

    if deployed:
        print(f"\n{C.GREEN}✅ {len(deployed)}개 파일이 프로젝트에 적용되었습니다!{C.END}")
        print(f"{C.CYAN}다음 단계: git add → git commit → Vercel 배포{C.END}")
    line()


def handle_complete(feature_dir: Path, feature_data: dict, reason: str = "승인") -> None:
    feature_data["status"] = "done"
    feature_data["current_step"] = 5
    feature_data["retry_count"] = 0
    save_feature(feature_dir, feature_data)

    header("🎉 피타야 개발 에이전트 완료!")
    ok(f"완료 사유: {reason}")
    print(f"\n  📁 생성된 파일:")
    for f in feature_data.get("generated_files", []):
        print(f"    📄 {f}")

    print(f"\n{C.CYAN}프로젝트에 적용하시겠습니까?{C.END}")
    print(f"  {C.GREEN}y){C.END} 예 — 지금 바로 프로젝트에 파일 복사")
    print(f"  {C.YELLOW}n){C.END} 아니오 — 나중에 수동으로 복사")
    try:
        ans = input(C.prompt(C.BLUE, "선택 (y/n): ")).strip().lower()
    except EOFError:
        ans = "n"

    if ans == "y":
        deploy_to_project(feature_dir, feature_data)
    else:
        header("📋 수동 적용 방법")
        print(f"{C.CYAN}아래 명령으로 파일을 프로젝트에 복사하세요:{C.END}\n")
        for filepath in feature_data.get("generated_files", []):
            src = Path(filepath)
            try:
                relative = src.relative_to(FEATURES_DIR / feature_data["project_name"])
                dst = PROJECT_ROOT / relative
                print(f"  cp {src} {dst}")
            except ValueError:
                print(f"  cp {src} <프로젝트_경로>/")
        line()


def handle_auto_fix(
    feature_name: str, feature_dir: Path, feature_data: dict,
    retry_count: int, analysis: dict
) -> None:
    new_count = retry_count + 1
    feature_data["retry_count"] = new_count
    feature_data.setdefault("auto_fix_attempts", []).append({
        "attempt": new_count,
        "issues": analysis.get("syntax_and_static_issues", []),
        "stability_before": analysis.get("stability_score"),
        "timestamp": datetime.now().isoformat(),
    })
    feature_data["status"] = "risk_checked"
    feature_data["current_step"] = 3
    save_feature(feature_dir, feature_data)

    sys_(f"재시도 {new_count}/{MAX_RETRIES} — Step 3 자동 재실행")
    result = subprocess.run(
        [sys.executable, "pitaya_agent_step3.py", feature_name],
        check=False,
    )
    if result.returncode != 0:
        err("Step 3 재실행 실패")
        sys.exit(1)

    subprocess.run(
        [sys.executable, "pitaya_agent_step4.py", feature_name],
        check=False,
    )


def handle_user_instructions(feature_name: str, feature_dir: Path, feature_data: dict) -> None:
    try:
        instructions = input(
            "\n" + C.prompt(C.BLUE, "추가 지시사항 입력 (Claude에게 전달됩니다): ")
        ).strip()
    except EOFError:
        instructions = ""

    if not instructions:
        warn("지시사항 없음, 취소합니다.")
        return

    existing = feature_data.get("risks", {}).get("summary_for_claude", "")
    feature_data.setdefault("risks", {})["summary_for_claude"] = (
        f"{existing}\n\n[사용자 추가 지시 — {datetime.now().strftime('%H:%M')}]\n{instructions}"
    )
    feature_data["status"] = "risk_checked"
    feature_data["current_step"] = 3
    save_feature(feature_dir, feature_data)

    sys_("추가 지시사항 반영 후 Step 3 재실행")
    result = subprocess.run(
        [sys.executable, "pitaya_agent_step3.py", feature_name, instructions],
        check=False,
    )
    if result.returncode != 0:
        err("Step 3 재실행 실패")
        sys.exit(1)

    subprocess.run(
        [sys.executable, "pitaya_agent_step4.py", feature_name],
        check=False,
    )


def main() -> None:
    if len(sys.argv) < 2:
        err("기능 이름 필요")
        print("  사용법: python pitaya_agent_step4.py <기능_이름>")
        sys.exit(1)

    feature_name = sys.argv[1]
    feature_dir = FEATURES_DIR / feature_name

    load_env()
    log_path = setup_logging(feature_name, step_number=4)

    header("⚡ 피타야 개발 에이전트 Step 4 — TypeScript 검증")
    info(f"로그 저장: {log_path}")
    line()

    sys_("기능 정의 로드 중...")
    feature_data = load_feature(feature_dir)
    info(f"기능: {feature_data['project_name']} (ID: {feature_data['project_id']})")
    info(f"생성된 파일: {len(feature_data.get('generated_files', []))}개")

    retry_count: int = feature_data.get("retry_count", 0)
    if retry_count >= MAX_RETRIES:
        print()
        err(f"최대 자동 수정 횟수({MAX_RETRIES}회)를 초과했습니다.")
        err("무한 루프 방지를 위해 자동 실행을 멈춥니다.")
        print(f"\n  자동 수정 시도 기록:")
        for attempt in feature_data.get("auto_fix_attempts", []):
            print(
                f"    [{attempt['attempt']}회] {attempt['timestamp']} — "
                f"안정성 {attempt.get('stability_before', '?')}점"
            )
        line()
        sys.exit(1)

    if retry_count > 0:
        warn(f"자동 수정 {retry_count}/{MAX_RETRIES}회 진행 중")
    line()

    sys_("코드 파일 로드 중...")
    code = load_generated_code(feature_data)
    info(f"분석할 코드 크기: {len(code)}자")
    line()

    sys_("Groq 연결 중...")
    client = init_groq()
    line()

    analysis = analyze_stability(client, feature_data, code)
    display_analysis(analysis)

    feature_data["stability_analysis"] = analysis
    stability: int = analysis.get("stability_score", 0)
    verdict: str = analysis.get("overall_verdict", "needs_fix")

    choice = get_user_choice(stability, verdict)

    if choice == 0:
        handle_complete(feature_dir, feature_data, f"안정성 {stability}점 달성")

    elif choice == 1:
        handle_auto_fix(feature_name, feature_dir, feature_data, retry_count, analysis)

    elif choice == 2:
        handle_user_instructions(feature_name, feature_dir, feature_data)

    elif choice == 3:
        handle_complete(feature_dir, feature_data, "사용자 수동 수락")

    info(f"로그 파일: {log_path}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        warn("\n작업이 중단되었습니다. 진행 상황이 저장되었습니다.")
        sys.exit(0)
