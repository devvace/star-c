// STAR-C 문서용 Markdown → DOCX 변환기. 이 프로젝트의 제한된 Markdown(H1~H3, 문단, 글머리, 표, 코드, 이미지, **굵게**, `코드`)만 다룬다.
// 사용: (처음 한 번) cd docs/tools && npm i docx@9   →   node docs/tools/md2docx.js docs/01-xxx.md docs/word/01-xxx.docx
// docx 패키지는 docs/tools/node_modules에만 설치한다 (앱 의존성 아님, 커밋 제외)
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, HeadingLevel, AlignmentType,
  WidthType, ShadingType, BorderStyle, LevelFormat, PageBreak, Footer, PageNumber, TableLayoutType, VerticalAlign,
} = require('docx')

const [,, inFile, outFile] = process.argv
const md = fs.readFileSync(inFile, 'utf8')
const baseDir = path.dirname(inFile)

// ---- 서식 상수 ----
const FONT = 'Malgun Gothic' // 맑은 고딕 (사용자 결정 2026-10-27). 영문 이름을 쓰면 Windows·Mac Word 모두 인식
const MONO = 'Consolas'
const BLACK = '000000'
const GRAY_FILL = 'F2F2F2'
const CODE_FILL = 'F7F7F7'
const LINE = 'BFBFBF'
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1440 // A4, 2.54cm
const CONTENT_W = PAGE_W - MARGIN * 2
const BODY = 21, SMALL = 19, CODE = 17 // half-points
const fonts = (f = FONT) => ({ ascii: f, hAnsi: f, eastAsia: f === FONT ? '맑은 고딕' : f, cs: f })

// ---- 인라인: **굵게**, `코드` ----
function inline(text, extra = {}) {
  const runs = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0, m
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), font: fonts(), color: BLACK, ...extra }))
    const t = m[0]
    if (t.startsWith('**')) runs.push(new TextRun({ text: t.slice(2, -2), font: fonts(), color: BLACK, bold: true, ...extra }))
    else runs.push(new TextRun({ text: t.slice(1, -1), font: fonts(MONO), color: BLACK, ...extra }))
    last = m.index + t.length
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), font: fonts(), color: BLACK, ...extra }))
  return runs
}

// ---- 블록 파서 ----
function parseBlocks(src) {
  const lines = src.replace(/\r/g, '').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (/^\s*$/.test(l)) { i++; continue }
    let m
    if ((m = /^(#{1,3}) (.*)$/.exec(l))) { blocks.push({ type: 'h', level: m[1].length, text: m[2] }); i++; continue }
    if (l.startsWith('```')) {
      const buf = []; i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++; blocks.push({ type: 'code', lines: buf }); continue
    }
    if ((m = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(l))) { blocks.push({ type: 'img', alt: m[1], src: m[2] }); i++; continue }
    if (l.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].slice(1).replace(/\|\s*$/, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells)
        i++
      }
      blocks.push({ type: 'table', rows }); continue
    }
    if ((m = /^(\s*)- (.*)$/.exec(l))) {
      const items = []
      while (i < lines.length && (m = /^(\s*)- (.*)$/.exec(lines[i]))) { items.push({ level: Math.floor(m[1].length / 2), text: m[2] }); i++ }
      blocks.push({ type: 'list', items }); continue
    }
    // 문단: 빈 줄 전까지 이어 붙임
    const buf = [l]; i++
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#|```|\||- |!\[)/.test(lines[i])) buf.push(lines[i++])
    blocks.push({ type: 'p', text: buf.join(' ') })
  }
  return blocks
}

// ---- 표 ----
function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } }
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: LINE }
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }

function makeTable(rows) {
  const cols = Math.max(...rows.map((r) => r.length))
  // 열 너비: 각 열의 최대 글자 수에 비례 (최소 보장)
  const lens = Array.from({ length: cols }, (_, c) => Math.max(4, ...rows.map((r) => (r[c] || '').replace(/\*\*|`/g, '').length)))
  const capped = lens.map((n) => Math.min(n, 40))
  const total = capped.reduce((a, b) => a + b, 0)
  let widths = capped.map((n) => Math.floor((n / total) * CONTENT_W))
  widths[widths.length - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0)
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0,
      children: Array.from({ length: cols }, (_, c) => new TableCell({
        width: { size: widths[c], type: WidthType.DXA },
        borders,
        verticalAlign: VerticalAlign.CENTER,
        shading: ri === 0 ? { type: ShadingType.CLEAR, fill: GRAY_FILL, color: 'auto' } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({
          spacing: { before: 0, after: 0 },
          children: inline(r[c] || '', { size: SMALL, bold: ri === 0 ? true : undefined }),
        })],
      })),
    })),
  })
}

// ---- 블록 → docx 요소 ----
function render(blocks) {
  const out = []
  for (const b of blocks) {
    if (b.type === 'h') {
      if (b.level === 1) continue // 제목은 표지에서 처리
      out.push(new Paragraph({
        heading: b.level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        spacing: { before: b.level === 2 ? 360 : 240, after: 120 },
        children: inline(b.text, { bold: true, size: b.level === 2 ? 30 : 24 }),
      }))
    } else if (b.type === 'p') {
      out.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: inline(b.text, { size: BODY }) }))
    } else if (b.type === 'list') {
      for (const it of b.items) out.push(new Paragraph({
        numbering: { reference: 'bullets', level: Math.min(it.level, 2) },
        spacing: { before: 0, after: 60 },
        children: inline(it.text, { size: BODY }),
      }))
    } else if (b.type === 'table') {
      out.push(makeTable(b.rows))
      out.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: [] }))
    } else if (b.type === 'code') {
      b.lines.forEach((ln, idx) => out.push(new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' },
        spacing: { before: 0, after: idx === b.lines.length - 1 ? 160 : 0, line: 260 },
        indent: { left: 120, right: 120 },
        children: [new TextRun({ text: ln.replace(/ /g, ' ') || ' ', font: fonts(MONO), size: CODE, color: BLACK })],
      })))
    } else if (b.type === 'img') {
      const file = path.resolve(baseDir, b.src)
      const data = fs.readFileSync(file)
      const { w, h } = pngSize(data)
      const maxW = 620 // px (약 16.4cm)
      const scale = Math.min(1, maxW / w)
      out.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 },
        children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round(w * scale), height: Math.round(h * scale) } })],
      }))
      if (b.alt) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 }, children: [new TextRun({ text: `[그림] ${b.alt}`, font: fonts(), size: SMALL, color: BLACK })] }))
    }
  }
  return out
}

// ---- 표지 ----
function cover(title, meta) {
  const kv = (k, v) => new TableRow({ children: [
    new TableCell({ width: { size: 2600, type: WidthType.DXA }, borders, shading: { type: ShadingType.CLEAR, fill: GRAY_FILL, color: 'auto' }, margins: { top: 100, bottom: 100, left: 140, right: 140 }, verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: k, font: fonts(), size: BODY, bold: true, color: BLACK })] })] }),
    new TableCell({ width: { size: 6426, type: WidthType.DXA }, borders, margins: { top: 100, bottom: 100, left: 140, right: 140 }, verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: v, font: fonts(), size: BODY, color: BLACK })] })] }),
  ] })
  const blank = (n) => Array.from({ length: n }, () => new Paragraph({ children: [] }))
  return [
    ...blank(8),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'STAR-C 의뢰자용 모집 가능성 예측 콘솔 (파일럿)', font: fonts(), size: 26, color: BLACK })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: title, font: fonts(), size: 48, bold: true, color: BLACK })] }),
    ...blank(6),
    new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [2600, 6426], layout: TableLayoutType.FIXED, alignment: AlignmentType.CENTER, rows: [
      kv('발주 기관', ''), kv('수행 기관', ''), kv('작성일', meta['작성일'] || ''), kv('버전', meta['버전'] || ''),
    ] }),
    new Paragraph({ children: [new PageBreak()] }),
  ]
}

// ---- 조립 ----
const blocks = parseBlocks(md)
const h1 = blocks.find((b) => b.type === 'h' && b.level === 1)
const title = h1 ? h1.text.replace(/^STAR-C 파일럿 콘솔 /, '') : path.basename(inFile, '.md')
// H1 바로 다음 표는 문서 정보 → 표지에 쓰고 본문에서는 뺀다
const h1i = blocks.indexOf(h1)
let meta = {}
if (blocks[h1i + 1] && blocks[h1i + 1].type === 'table') {
  for (const r of blocks[h1i + 1].rows.slice(1)) meta[r[0]] = r[1]
  blocks.splice(h1i + 1, 1)
}

const doc = new Document({
  creator: '',
  styles: {
    default: { document: { run: { font: fonts(), size: BODY, color: BLACK } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: fonts(), size: 30, bold: true, color: BLACK }, paragraph: { outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: fonts(), size: 24, bold: true, color: BLACK }, paragraph: { outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'bullets', levels: [
    { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } },
    { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 240 } } } },
    { level: 2, format: LevelFormat.BULLET, text: '·', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 240 } } } },
  ] }] },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: fonts(), size: SMALL, color: BLACK })] })] }) },
    children: [...cover(title, meta), ...render(blocks)],
  }],
})

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(outFile, buf); console.log('wrote', outFile, buf.length, 'bytes') })
