import { FileText, Tag, Image as ImageIcon, FlaskConical, Pencil } from 'lucide-react'
import { SHOW_PLAYGROUND } from './featureFlags'

/**
 * LNB 메뉴 구성. 그룹 순서 = 표시 순서.
 * 기능을 추가할 때 여기에 항목만 넣고 App 의 PAGES 에 페이지를 등록하면 됨.
 */
export const NAV_GROUPS = [
  {
    label: '제본',
    items: [{ key: 'convert', label: '로그 변환', Icon: FileText }],
  },
  {
    label: 'eBook 수정',
    items: [
      { key: 'bookinfo', label: '책 정보 수정', Icon: Tag },
      { key: 'cover', label: '표지 생성기', Icon: ImageIcon },
      { key: 'logedit', label: '로그 편집', Icon: Pencil, soon: true },
    ],
  },
  {
    label: '실험',
    hidden: !SHOW_PLAYGROUND,
    items: [{ key: 'playground', label: 'playground', Icon: FlaskConical, soon: true }],
  },
]
