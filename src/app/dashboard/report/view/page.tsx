"use client";

import React, { useState } from 'react';

// 임시 데이터: 실제로는 API를 통해 받아와야 합니다.
const dummyReports = [
  {
    id: 1,
    date: '2026-05-07',
    content: '오늘의 주요 업무는 신규 기능 A의 프로토타입을 완성하는 것이었습니다. 오후에는 팀 회의에 참석하여 다음 스프린트 계획을 논의했습니다.',
    author: '김민준',
    imageUrl: null, // 이미지 없는 경우
  },
  {
    id: 2,
    date: '2026-05-07',
    content: '고객사 B의 긴급 요청으로 버그 수정을 진행했습니다. 수정 완료 후 테스트 배포까지 마쳤습니다.',
    author: '이서연',
    imageUrl: 'https://images.unsplash.com/photo-1517694712202-1428bc648c68?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  },
  {
    id: 3,
    date: '2026-05-06',
    content: '데이터베이스 마이그레이션 작업을 계획하고 관련 문서를 작성했습니다. 예상되는 리스크와 해결 방안을 정리했습니다.',
    author: '박지훈',
    imageUrl: null,
  },
  {
    id: 4,
    date: '2026-05-06',
    content: '새로운 마케팅 캠페인 페이지의 UI 디자인을 완료했습니다. 디자이너와 협력하여 최종 시안을 확정했습니다.',
    author: '최유진',
    imageUrl: 'https://images.unsplash.com/photo-1587620962725-abab7fe55159?q=80&w=1931&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  },
  {
    id: 5,
    date: '2026-05-05',
    content: '서버 인프라 점검 및 보안 패치를 적용했습니다. 모니터링 툴을 개선하여 이상 징후를 빠르게 감지할 수 있도록 했습니다.',
    author: '정다솜',
    imageUrl: null,
  },
  {
    id: 6,
    date: '2026-05-05',
    content: '사용자 피드백을 기반으로 앱의 UX를 개선하는 작업을 진행했습니다. 특히 로그인 프로세스를 간소화했습니다.',
    author: '조현재',
    imageUrl: 'https://images.unsplash.com/photo-1555066931-4365d1469c9b?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  },
];

export default function ReportViewPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const reportsPerPage = 2; // 페이지 당 2개의 보고서를 보여줍니다.

  // 페이지네이션 로직
  const indexOfLastReport = currentPage * reportsPerPage;
  const indexOfFirstReport = indexOfLastReport - reportsPerPage;
  const currentReports = dummyReports.slice(indexOfFirstReport, indexOfLastReport);
  const totalPages = Math.ceil(dummyReports.length / reportsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 bg-slate-950 text-slate-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-teal-400 mb-6">일일 마감보고서 조회</h1>
        
        <div className="overflow-x-auto bg-slate-900 rounded-lg border border-slate-800 shadow-lg">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-800/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  보고일
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  작성자
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  내용
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  첨부 이미지
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {currentReports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{report.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{report.author}</td>
                  <td className="px-6 py-4 text-sm text-slate-300 max-w-sm lg:max-w-md xl:max-w-lg break-words">
                    {report.content}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                    {report.imageUrl ? (
                      <a href={report.imageUrl} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 underline">
                        이미지 보기
                      </a>
                    ) : (
                      '없음'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 컨트롤 */}
        <div className="mt-6 flex justify-between items-center">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-md hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            이전
          </button>
          <span className="text-sm text-slate-400">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-md hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}
