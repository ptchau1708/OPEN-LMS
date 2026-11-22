"""Tạo 2 tệp .xls MẪU GIẢ (tên học sinh bịa) có cấu trúc giống hệt tệp VnEdu thật, dùng cho kiểm thử.

Chạy: python3 tools/make-vnedu-fixtures.py  (cần openpyxl và LibreOffice `soffice`).
Không dùng tệp thật của trường để kiểm thử vì có tên và mã học sinh thật.
"""
import os, subprocess, tempfile
from openpyxl import Workbook
from openpyxl.styles import Border, Side, Font, Alignment

OUT = os.path.join(os.path.dirname(__file__), '..', 'packages', 'data', 'src', 'export', '__fixtures__')
thin = Side(style='thin'); box = Border(left=thin, right=thin, top=thin, bottom=thin)
STUDENTS = [('Nguyễn Văn', 'An'), ('Trần Thị', 'Bình'), ('Lê Hoàng', 'Cường'), ('Phạm Minh', 'Dũng'), ('Võ Thị Ngọc', 'Hà'), ('Đặng Gia', 'Huy')]

def score_sheet(ws, mon, subj_code, with_kt):
    ws['A1'] = 'ỦY BAN NHÂN DÂN PHƯỜNG MẪU'; ws['E1'] = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'
    ws['A2'] = 'TRƯỜNG TIỂU HỌC MẪU'; ws['E2'] = 'Độc lập - Tự do - Hạnh phúc'
    ws['A4'] = f'BẢNG ĐIỂM CHI TIẾT - MÔN {mon} - HỌC KỲ 2 - CUỐI KỲ 2 - NĂM HỌC 2026 - 2027'
    ws['A5'] = 'Khối 5 - Lớp 5A1'
    ws['B6'] = f'1234567890-{subj_code}-2-ck2-2026'
    for rg in ['A1:D1', 'E1:G1', 'A2:D2', 'E2:G2', 'A4:G4', 'A5:G5', 'C7:D7']: ws.merge_cells(rg)
    heads = ['STT', 'Mã học sinh', 'Họ và tên', None, 'Nhận xét'] + (['KT CK2', 'XL CK2', 'KT CK2 (Sau thi lại)', 'XL CK2 (Sau thi lại)'] if with_kt else ['XL CK2', 'XL CK2 (Sau thi lại)'])
    for c, h in enumerate(heads, 1):
        cell = ws.cell(7, c, h); cell.font = Font(bold=True, name='Arial', size=10); cell.border = box; cell.alignment = Alignment(wrap_text=True)
    for i, (ho, ten) in enumerate(STUDENTS):
        r = 8 + i
        ws.cell(r, 1, i + 1); ws.cell(r, 2, 9900000001 + i * 20); ws.cell(r, 3, ho); ws.cell(r, 4, ten)
        for c in range(1, len(heads) + 1): ws.cell(r, c).border = box
    ws.column_dimensions['B'].hidden = True
    ws.column_dimensions['E'].width = 40

wb = Workbook(); ws = wb.active; ws.title = 'tieng_viet_5a1'; score_sheet(ws, 'TIẾNG VIỆT', 50, True)
score_sheet(wb.create_sheet('dao_duc_5a1'), 'ĐẠO ĐỨC', 56, False)
score_sheet(wb.create_sheet('am_nhac_5a1'), 'ÂM NHẠC', 58, False)

wb2 = Workbook(); ws = wb2.active; ws.title = 'Năng lực phẩm chất'
top = {1: 'STT', 2: 'Mã học sinh', 3: 'Họ và tên ', 4: 'Học kì', 5: 'Năng lực chung', 9: 'Năng lực đặc thù', 17: 'Phẩm chất'}
sub = ['Nhận xét về năng lực', 'Tự chủ và tự học', 'Giao tiếp và hợp tác', 'GQVĐ và sáng tạo', 'Nhận xét về năng lực đặc thù', 'Ngôn ngữ', 'Tính toán', 'Khoa học', 'Thẩm mĩ', 'Thể chất', 'Công nghệ', 'Tin học', 'Nhận xét về phẩm chất', 'Yêu nước', 'Nhân ái', 'Chăm chỉ', 'Trung thực', 'Trách nhiệm']
for c, h in top.items(): ws.cell(1, c, h).font = Font(bold=True)
for i, h in enumerate(sub): ws.cell(2, 5 + i, h).font = Font(bold=True)
for rg in ['E1:H1', 'I1:P1', 'Q1:V1', 'A1:A2', 'C1:C2', 'D1:D2', 'B1:B2']: ws.merge_cells(rg)
wb2.create_sheet('Sheet2'); wb2.create_sheet('Sheet3')

with tempfile.TemporaryDirectory() as tmp:
    for book, name in [(wb, 'vnedu-so-diem-mau'), (wb2, 'vnedu-nlpc-mau')]:
        p = os.path.join(tmp, name + '.xlsx'); book.save(p)
        subprocess.run(['soffice', '--headless', '--convert-to', 'xls:MS Excel 97', '--outdir', OUT, p], check=True, capture_output=True)
print('OK', os.listdir(OUT))
