'use client';

export default function KakaoLoginButton() {
  return (
    <button
      type="button"
      onClick={() => { window.location.href = '/api/auth/kakao'; }}
      className="w-full flex items-center justify-center gap-3
        bg-[#FEE500] hover:bg-[#F5DC00] active:bg-[#EACE00]
        text-[#191919] font-medium text-sm
        rounded-lg px-4 py-3 transition-colors shadow-md"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          fill="#191919"
          d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.87 5.35 4.69 6.84-.15.55-.97 3.54-1 3.7 0 .06.02.12.08.15.05.03.11.03.16 0 .07-.03 3.68-2.43 4.24-2.84.58.08 1.17.13 1.83.13 5.52 0 10-3.58 10-8S17.52 3 12 3z"
        />
      </svg>
      카카오로 계속하기
    </button>
  );
}
