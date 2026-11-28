// Nhập câu hỏi nhanh: đọc văn bản / Excel / Word, phát hiện trùng, gọi AI. Tải lười từ app GV (`@openedu/data/import`).
export * from './types';
export * from './check';
export * from './dedupe';
export { parseQuestionText, resolveChoiceAnswer, MARK, type ParseTextResult } from './textParser';
export { readXlsx, writeXlsx, xmlEscape, xmlUnescape, colName, colIndex, XLSX_MIME, XLSX_MAX_BYTES, XLSX_MAX_ROWS, type XlsxCell, type XlsxSheet, type ReadXlsxResult } from './xlsx';
export { docxToText, DOCX_MAX_BYTES, type DocxTextResult } from './docx';
export * from './template';
export { detectDocMeta, nearestGradeFor, type DocMeta } from './meta';
export { buildSkillsXlsx, planSkillsImport, planSkillsRows, skillsSheet, SKILL_SHEET_NAME, type SkillPlanKind, type SkillPlanRow, type SkillsImportPlan } from './skillsSheet';
export * from './ai';
export { parseTypedBlock, parseTypedKind, isTypedBlock, TYPED_KIND_LABEL, type TypedKind } from './typedBlock';
export { buildOnThiTemplateDocx, buildWordTemplateDocx, ONTHI_TEMPLATE_EXAMPLES, WORD_TEMPLATE_EXAMPLES, DOCX_MIME } from './wordTemplate';

// Thông tin bổ sung của học sinh: mẫu Excel + đọc tệp (tải lười cùng mã nhập liệu).
export { buildNotesTemplate, parseNotesSheet, type NotesSheet, type NotesSheetRow } from '../notes/excel';
