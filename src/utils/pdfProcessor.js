import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Worker 설정: CDN을 사용하여 경로 문제 해결
// pdfjsLib.version을 사용하여 현재 설치된 버전과 일치하는 워커를 로드합니다.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// 사용자가 요청한 모델명 적용
const MODEL_NAME = 'gemini-3-pro-preview';

export async function processPdf(file, apiKey, onProgress) {
  const genAI = new GoogleGenerativeAI(apiKey);
  // 모델 인스턴스 생성
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
  const numPages = pdf.numPages;
  
  const doc = new jsPDF();
  const translatedPages = [];

  for (let i = 1; i <= numPages; i++) {
    onProgress((i / numPages) * 100, `${i}/${numPages} 페이지 처리 중...`);
    
    const page = await pdf.getPage(i);
    // 텍스트 인식을 높이기 위해 스케일을 2.0으로 설정하여 고해상도 렌더링
    const viewport = page.getViewport({ scale: 2.0 });
    
    // 1. 페이지를 이미지로 렌더링
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    const imgData = canvas.toDataURL('image/jpeg', 0.8);
    
    // 2. Gemini에게 이미지 전송 및 번역 요청
    // 이미지의 한국어 텍스트를 감지하고, 해당 텍스트의 좌표(bounding box)와 영문 번역 결과를 JSON으로 요청
    const prompt = `
      You are an expert translator and document layout analyzer.
      Analyze the attached image of a document page written in Korean.
      1. Identify all text blocks containing Korean text.
      2. Translate the Korean text to English.
      3. If the translation is too long for the original space, shorten it or use smaller fonts in your mind.
      4. Return a JSON array where each object represents a text block:
         {
           "original_text": "Korean text",
           "translated_text": "English translation",
           "box_2d": [ymin, xmin, ymax, xmax] // normalized coordinates (0-1000)
         }
      
      Important:
      - Preserve the meaning accurately.
      - Ignore text that is already in English.
      - The coordinates should be normalized to 0-1000 range relative to the image size.
      - Return ONLY the JSON string, no markdown formatting.
    `;
    
    try {
      const imagePart = {
        inlineData: {
          data: imgData.split(',')[1],
          mimeType: "image/jpeg",
        },
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      let text = response.text();
      
      // JSON 파싱 (마크다운 코드 블록 제거 등)
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      let translations = [];
      try {
        translations = JSON.parse(text);
      } catch (e) {
        console.warn("JSON parsing failed, trying to fix or skip", text);
        // 간단한 오류 복구 시도 또는 빈 배열
      }

      translatedPages.push({
        imgData,
        width: viewport.width,
        height: viewport.height,
        translations
      });

    } catch (err) {
      console.error(`Page ${i} translation error:`, err);
      // 에러 발생 시 원본 이미지만이라도 저장하도록 처리
      translatedPages.push({
        imgData,
        width: viewport.width,
        height: viewport.height,
        translations: []
      });
    }
  }

  // 3. 새 PDF 생성
  onProgress(90, 'PDF 생성 중...');
  
  for (let i = 0; i < translatedPages.length; i++) {
    const pageData = translatedPages[i];
    if (i > 0) doc.addPage();
    
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = doc.internal.pageSize.getHeight();
    
    // 원본 이미지를 배경으로 삽입
    doc.addImage(pageData.imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    
    // 번역된 텍스트 오버레이
    pageData.translations.forEach(item => {
      const { translated_text, box_2d } = item;
      if (!box_2d || box_2d.length !== 4) return;

      const [ymin, xmin, ymax, xmax] = box_2d;
      
      // 좌표 변환 (1000분율 -> PDF 좌표)
      const x = (xmin / 1000) * pdfWidth;
      const y = (ymin / 1000) * pdfHeight;
      const w = ((xmax - xmin) / 1000) * pdfWidth;
      const h = ((ymax - ymin) / 1000) * pdfHeight;
      
      // 흰색 배경 박스 그리기 (기존 텍스트 가리기)
      doc.setFillColor(255, 255, 255);
      doc.rect(x, y, w, h, 'F');
      
      // 텍스트 쓰기 (폰트 크기 자동 조절)
      doc.setTextColor(0, 0, 0);
      let fontSize = 10; // 기본 시작 폰트 사이즈
      doc.setFontSize(fontSize);
      
      // 텍스트 폭이 박스보다 넓으면 폰트 줄이기
      while (doc.getTextWidth(translated_text) > w && fontSize > 4) {
        fontSize -= 0.5;
        doc.setFontSize(fontSize);
      }
      
      // 텍스트 줄바꿈 처리
      const splitText = doc.splitTextToSize(translated_text, w);
      
      // 세로 중앙 정렬을 위한 Y 좌표 조정
      // 1pt approx 0.3527mm
      const lineHeight = fontSize * 0.3527 * 1.15; 
      const totalTextHeight = splitText.length * lineHeight;
      const textY = y + (h - totalTextHeight) / 2 + lineHeight * 0.8; // baseline adjustment

      doc.text(splitText, x, textY);
    });
  }
  
  onProgress(100, '완료');
  return doc;
}

// 제목 번역 함수
export async function translateTitle(title, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  
  const prompt = `Translate this filename to English: "${title}". Return only the translated string, no quotes.`;
  
  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (e) {
    console.error("Title translation failed", e);
    return title; // 실패 시 원본 반환
  }
}
