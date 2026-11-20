// Nhập câu hỏi nhanh: đọc văn bản / Excel / Word, phát hiện trùng, gọi AI. Tải lười từ app GV (`@openedu/data/import`).
export * from './types';
export * from './check';
export * from './dedupe';
export { parseQuestionText, resolveChoiceAnswer, MARK, type ParseTextResult } from './textParser';
export { readXlsx, writeXlsx, xmlEscape, xmlUnescape, colName, colIndex, XLSX_MIME, XLSX_MAX_BYTES, XLSX_MAX_ROWS, type XlsxCell, type XlsxSheet, type ReadXlsxResult } from './xlsx';
export { docxToText, DOCX_MAX_BYTES, type DocxTextResult } from './docx';
export * from './template';
export * from './ai';
