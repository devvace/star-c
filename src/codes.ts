export interface AgeBand { id: string; label: string; min: number; max: number }
export interface Sido { c: string; n: string; s: string; g: string }

export const AGE_BANDS: AgeBand[] = [
  { id: '19-29', label: '19~29세', min: 19, max: 29 }, { id: '30-39', label: '30~39세', min: 30, max: 39 },
  { id: '40-49', label: '40~49세', min: 40, max: 49 }, { id: '50-59', label: '50~59세', min: 50, max: 59 },
  { id: '60-69', label: '60~69세', min: 60, max: 69 }, { id: '70+', label: '70세 이상', min: 70, max: 200 }]

export const DISEASES = ['고혈압', '이상지질혈증', '당뇨병', '아토피피부염', '건선', '기타']

// 행정표준코드 시·도 (부산·경남 우선 정렬)
export const SIDO: Sido[] = [
  { c: '26', n: '부산광역시', s: '부산', g: '동남권' }, { c: '48', n: '경상남도', s: '경남', g: '동남권' },
  { c: '31', n: '울산광역시', s: '울산', g: '동남권' }, { c: '11', n: '서울특별시', s: '서울', g: '수도권' },
  { c: '27', n: '대구광역시', s: '대구', g: '대경권' }, { c: '28', n: '인천광역시', s: '인천', g: '수도권' },
  { c: '29', n: '광주광역시', s: '광주', g: '호남권' }, { c: '30', n: '대전광역시', s: '대전', g: '충청권' },
  { c: '36', n: '세종특별자치시', s: '세종', g: '충청권' }, { c: '41', n: '경기도', s: '경기', g: '수도권' },
  { c: '51', n: '강원특별자치도', s: '강원', g: '강원권' }, { c: '43', n: '충청북도', s: '충북', g: '충청권' },
  { c: '44', n: '충청남도', s: '충남', g: '충청권' }, { c: '52', n: '전북특별자치도', s: '전북', g: '호남권' },
  { c: '46', n: '전라남도', s: '전남', g: '호남권' }, { c: '47', n: '경상북도', s: '경북', g: '대경권' },
  { c: '50', n: '제주특별자치도', s: '제주', g: '제주권' }]

export const SIDO_BY: Record<string, Sido> = Object.fromEntries(SIDO.map((x) => [x.c, x]))
