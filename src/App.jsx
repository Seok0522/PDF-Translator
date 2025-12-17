import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, Loader2, AlertCircle, Key, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { processPdf, translateTitle } from './utils/pdfProcessor';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [isApiKeySet, setIsApiKeySet] = useState(false);
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);

  const handleApiKeySubmit = (e) => {
    e.preventDefault();
    if (apiKey.trim().length > 0) {
      setIsApiKeySet(true);
    }
  };

  const handleFileUpload = (e) => {
    const uploadedFiles = Array.from(e.target.files).map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'idle',
      progress: 0,
      message: '대기 중',
      downloadUrl: null,
      translatedName: null
    }));
    setFiles(prev => [...prev, ...uploadedFiles]);
  };

  const updateFileStatus = (id, status, progress, message) => {
    setFiles(prev => prev.map(f => {
      if (f.id === id) {
        return { ...f, status, progress, message };
      }
      return f;
    }));
  };

  const startProcessing = async () => {
    setProcessing(true);
    
    // 순차 처리
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'completed') continue;
      
      const fileId = files[i].id;
      const originalFile = files[i].file;

      updateFileStatus(fileId, 'processing', 5, '제목 번역 및 준비 중...');
      
      try {
        // 제목 번역
        const originalName = originalFile.name.replace('.pdf', '');
        const translatedNameBase = await translateTitle(originalName, apiKey);
        const translatedName = `${translatedNameBase}.pdf`;

        updateFileStatus(fileId, 'processing', 10, '페이지 분석 및 번역 중...');

        // PDF 처리
        const pdfDoc = await processPdf(originalFile, apiKey, (progress, msg) => {
          // progress는 0~100 사이
          // 전체 프로세스에서 PDF 처리가 10% ~ 90%를 차지한다고 가정
          const totalProgress = 10 + (progress * 0.8);
          updateFileStatus(fileId, 'processing', totalProgress, msg);
        });

        // 결과 저장
        const blob = pdfDoc.output('blob');
        const downloadUrl = URL.createObjectURL(blob);
        
        // 상태 업데이트
        setFiles(prev => prev.map(f => {
          if (f.id === fileId) {
            return { 
              ...f, 
              status: 'completed', 
              progress: 100, 
              message: '번역 완료',
              downloadUrl,
              translatedName
            };
          }
          return f;
        }));

      } catch (error) {
        console.error(error);
        updateFileStatus(fileId, 'error', 0, `오류: ${error.message || '알 수 없는 오류'}`);
      }
    }
    setProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">사내 IT 정책 문서 번역기</h1>
          <p className="text-gray-600">PDF 문서를 업로드하여 영문으로 번역합니다. (Gemini 3 Pro Preview 사용)</p>
        </header>

        {!isApiKeySet ? (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-md mx-auto">
            <div className="flex items-center gap-2 mb-4 text-blue-600">
              <Key size={24} />
              <h2 className="text-xl font-semibold">API Key 입력</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Google Gemini API 사용을 위한 키를 입력해주세요. 입력된 키는 브라우저에만 저장됩니다.
            </p>
            <form onSubmit={handleApiKeySubmit} className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Gemini API Key"
                className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                확인
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-xl shadow-sm border-2 border-dashed border-gray-300 hover:border-blue-500 transition-colors text-center">
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-4">
                <div className="p-4 bg-blue-50 text-blue-600 rounded-full">
                  <Upload size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-700">PDF 파일 업로드</h3>
                  <p className="text-sm text-gray-500">클릭하여 파일을 선택하세요 (여러 파일 가능)</p>
                </div>
              </label>
            </div>

            {files.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="font-semibold text-gray-700">작업 목록 ({files.length})</h3>
                  <button
                    onClick={startProcessing}
                    disabled={processing || files.every(f => f.status === 'completed')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      processing || files.every(f => f.status === 'completed')
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {processing ? '작업 진행 중...' : '번역 시작'}
                  </button>
                </div>
                <div className="divide-y divide-gray-100">
                  <AnimatePresence>
                    {files.map((file) => (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        className="p-4 flex items-center gap-4"
                      >
                        <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                          <FileText size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <p className="font-medium text-gray-800 truncate">{file.file.name}</p>
                            <div className="flex items-center gap-2">
                              {file.status === 'completed' && file.downloadUrl && (
                                <a
                                  href={file.downloadUrl}
                                  download={file.translatedName}
                                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full flex items-center gap-1 hover:bg-blue-200 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Download size={12} /> 다운로드
                                </a>
                              )}
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                file.status === 'completed' ? 'bg-green-100 text-green-700' :
                                file.status === 'error' ? 'bg-red-100 text-red-700' :
                                file.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {file.status === 'completed' && <span className="flex items-center gap-1"><CheckCircle size={12} /> 완료</span>}
                                {file.status === 'error' && <span className="flex items-center gap-1"><AlertCircle size={12} /> 오류</span>}
                                {file.status === 'processing' && <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> 처리 중</span>}
                                {file.status === 'idle' && '대기'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                            <motion.div
                              className={`h-2 rounded-full ${
                                file.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                              }`}
                              initial={{ width: 0 }}
                              animate={{ width: `${file.progress}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                          <p className="text-xs text-gray-500">{file.message}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
