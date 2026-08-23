import { useState, useCallback, useEffect, useMemo } from 'react'
import { Sun, Moon } from 'lucide-react'
import JSZip from 'jszip'
import { parseRoll20Html } from './utils/parseRoll20'
import { fetchCcfoliaLog, parseCcfoliaHtml, extractRoomId } from './utils/parseCcfolia'
import { generateEpub, DEFAULT_BODY_FONT } from './utils/generateEpub'
import { makeTheme, styles } from './theme'
import { useMediaQuery } from './hooks'
import { SHOW_THEME_TOGGLE } from './featureFlags'
import Toast from './components/Toast'
import CcfoliaAvatarManager from './components/CcfoliaAvatarManager'
import Lnb, { MobileTopBar } from './components/Lnb'
import ConvertPage from './pages/ConvertPage'
import BookInfoPage from './pages/BookInfoPage'
import CoverPage from './pages/CoverPage'
import './App.css'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'])
const MIME_MAP = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }

const PAGES = { convert: ConvertPage, bookinfo: BookInfoPage, cover: CoverPage }

export default function App() {
  // ─── 테마 ────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const t = makeTheme(isDark)
  const S = styles(t)

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
    document.body.style.background = t.bg
    document.body.style.backgroundAttachment = 'fixed'
    document.body.style.minHeight = '100svh'
    document.body.style.transition = 'background 0.3s'
  }, [isDark, t.bg])

  // ─── 셸 ──────────────────────────────────────────────────────
  const isMobile = useMediaQuery('(max-width: 899px)')
  const [page, setPage] = useState('convert')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('trpg_lnb_collapsed') === '1')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const toggleCollapse = useCallback(() => {
    setCollapsed(c => {
      localStorage.setItem('trpg_lnb_collapsed', c ? '0' : '1')
      return !c
    })
  }, [])

  // 페이지 전환 시 스크롤 위로
  useEffect(() => { window.scrollTo({ top: 0 }) }, [page])

  // ─── 토스트 ──────────────────────────────────────────────────
  const [toasts, setToasts] = useState([])
  const toast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 3500)
  }, [])

  // ─── 로그 / 결과물 상태 ───────────────────────────────────────
  const [messages, setMessages] = useState([])
  const [templateCss, setTemplateCss] = useState('')
  const [fileName, setFileName] = useState('')
  const [stats, setStats] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [selectedMode, setSelectedMode] = useState(null)
  const [includeSadam, setIncludeSadam] = useState(true)

  // EPUB 본문 조판 서체 — 'gothic' | 'serif'
  const [bodyFont, setBodyFontRaw] = useState(() => localStorage.getItem('trpg_bodyfont') || DEFAULT_BODY_FONT)
  const setBodyFont = useCallback((v) => { setBodyFontRaw(v); localStorage.setItem('trpg_bodyfont', v) }, [])

  // 책 정보 / 표지
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [coverImage, setCoverImage] = useState(null)

  // 표지 생성기에서 「이 표지로 적용하기」 후 돌아갈 페이지. 기본값 = 책 정보 수정.
  // 로그 변환 화면의 표지 생성기 링크만 'convert'로 바꿔 돌아갈 곳을 지정함.
  const [coverReturnTo, setCoverReturnTo] = useState('bookinfo')
  const navigate = useCallback((p) => {
    if (p === 'cover') setCoverReturnTo('bookinfo') // LNB로 직접 들어오면 기본 반환처로
    setPage(p)
  }, [])

  // 플랫폼 입력
  const [source, setSource] = useState(() => localStorage.getItem('trpg_source') || 'roll20')
  const [ccfoliaMode, setCcfoliaMode] = useState('html')
  const [roomInput, setRoomInput] = useState('')
  const [isFetching, setIsFetching] = useState(false)
  const [fetchCount, setFetchCount] = useState(0)

  // 코코포리아 프로필 인장(화자별 아바타) — 세션 한정, 저장하지 않음
  const [ccfoliaAvatars, setCcfoliaAvatars] = useState({}) // { speakerName: base64 }
  const [showAvatarManager, setShowAvatarManager] = useState(false)
  // 인장 영역 제거 — Roll20/코코포리아 미리보기에서 프로필 이미지 칸 자체를 안 그림
  const [hideAvatarArea, setHideAvatarArea] = useState(false)
  const messagesWithAvatars = useMemo(() => {
    if (!Object.keys(ccfoliaAvatars).length) return messages
    return messages.map(m => (m.speaker && ccfoliaAvatars[m.speaker])
      ? { ...m, iconUrl: ccfoliaAvatars[m.speaker] }
      : m)
  }, [messages, ccfoliaAvatars])

  // ─── 파싱 결과 → 상태 반영 ────────────────────────────────────
  const applyParsedResult = useCallback(({ messages: parsed, templateCss: css }, name, isRoll20 = true) => {
    setIsParsing(false)
    setSelectedMode(null)
    setFileName(name)
    setTitle(name.replace(/\.(html|zip)$/i, ''))
    setMessages(parsed)
    setTemplateCss(css || '')
    setCcfoliaAvatars({})
    setStats({
      total: parsed.length,
      general: parsed.filter(m => m.type === 'general' && !m.isSadam).length,
      sadam: parsed.filter(m => m.isSadam).length,
      hidden: parsed.filter(m => m.type === 'hidden').length,
      whisper: isRoll20 ? parsed.filter(m => m.type === 'whisper').length : 0,
      desc: isRoll20 ? parsed.filter(m => m.type === 'desc').length : 0,
      emote: isRoll20 ? parsed.filter(m => m.type === 'emote').length : 0,
      template: isRoll20 ? parsed.filter(m => m.type === 'template').length : 0,
    })
  }, [setIsParsing, setSelectedMode, setFileName, setTitle, setMessages, setTemplateCss, setCcfoliaAvatars, setStats])

  // ─── Roll20 ──────────────────────────────────────────────────
  const handleRoll20File = useCallback((file) => {
    if (!file) return
    setIsParsing(true)

    if (file.name.endsWith('.zip')) {
      file.arrayBuffer().then(async (buffer) => {
        const zip = await JSZip.loadAsync(buffer)
        let htmlText = null, htmlName = ''
        for (const [path, entry] of Object.entries(zip.files)) {
          if (!entry.dir && path.endsWith('.html') && !path.includes('/')) {
            htmlText = await entry.async('text'); htmlName = path; break
          }
        }
        if (!htmlText) { toast('ZIP에서 HTML 로그 파일을 찾을 수 없습니다.', 'error'); setIsParsing(false); return }

        // ZIP 안의 이미지를 base64 맵으로 만들어 파서에 넘김
        const localImageMap = {}
        await Promise.all(
          Object.entries(zip.files)
            .filter(([path, entry]) => !entry.dir && IMAGE_EXTS.has(path.split('.').pop().toLowerCase()))
            .map(async ([path, entry]) => {
              const ext = path.split('.').pop().toLowerCase()
              localImageMap[path] = `data:${MIME_MAP[ext] || 'image/png'};base64,${await entry.async('base64')}`
            })
        )
        applyParsedResult(await parseRoll20Html(htmlText, localImageMap), htmlName, true)
      })
      return
    }

    if (!file.name.endsWith('.html')) { setIsParsing(false); return }
    const reader = new FileReader()
    reader.onload = async (e) => applyParsedResult(await parseRoll20Html(e.target.result, {}), file.name, true)
    reader.readAsText(file, 'utf-8')
  }, [applyParsedResult, toast])

  // ─── 코코포리아 ───────────────────────────────────────────────
  const handleCcfoliaFile = useCallback((file) => {
    if (!file || !file.name.endsWith('.html')) return
    setIsParsing(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const result = await parseCcfoliaHtml(e.target.result)
      if (result.parseError) { toast(result.parseError, 'error'); setIsParsing(false); return }
      applyParsedResult(result, file.name, false)
    }
    reader.readAsText(file, 'utf-8')
  }, [applyParsedResult, toast])

  const handleFetchCcfolia = useCallback(async () => {
    if (!roomInput.trim() || isFetching) return
    setIsFetching(true); setIsParsing(true); setFetchCount(0)
    try {
      const roomId = extractRoomId(roomInput)
      applyParsedResult(await fetchCcfoliaLog(roomId, setFetchCount), roomId, false)
    } catch (err) {
      toast(`가져오기 실패: ${err.message}`, 'error')
      setIsParsing(false)
    } finally {
      setIsFetching(false)
    }
  }, [roomInput, isFetching, applyParsedResult, toast])

  const handleFileDrop = useCallback((file) => {
    if (source === 'roll20') handleRoll20File(file)
    else handleCcfoliaFile(file)
  }, [source, handleRoll20File, handleCcfoliaFile])

  const switchSource = useCallback((s) => {
    localStorage.setItem('trpg_source', s)
    setSource(s)
    setMessages([]); setStats(null); setFileName(''); setTemplateCss('')
    setSelectedMode(null); setIsParsing(false); setCcfoliaAvatars({})
  }, [])

  // ─── 다운로드 ────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!messages.length || isGenerating) return
    setIsGenerating(true)
    try {
      const blob = await generateEpub(messagesWithAvatars, {
        title, author, coverImage, coverTitle: title,
        includeSadam, templateCss, bodyFont,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title || fileName.replace(/\.(html|zip)$/i, '')}.epub`
      a.click()
      URL.revokeObjectURL(url)
      toast('epub 다운로드 완료!')
    } finally {
      setIsGenerating(false)
    }
  }, [messages, messagesWithAvatars, title, author, coverImage, fileName, isGenerating, includeSadam, templateCss, bodyFont, toast])

  // PDF — 브라우저 인쇄. body 직하에 print 전용 div 를 만들어
  // 글래스 컨테이너의 overflow/containing block 영향을 피함.
  const handlePdf = useCallback((mode) => {
    const el = document.getElementById(mode === 'roll20' ? 'roll20-preview-msgs' : 'ccfolia-preview-msgs')
    if (!el) return
    const bgColor = mode === 'ccfolia' ? '#0e0e16' : '#fff'

    const printDiv = document.createElement('div')
    printDiv.id = 'trpg-pdf-print'
    printDiv.innerHTML = el.innerHTML
    printDiv.style.cssText = `background:${bgColor};margin:0;padding:0;`
    document.body.appendChild(printDiv)

    const style = document.createElement('style')
    style.textContent =
      '@media print{' +
      'body > *:not(#trpg-pdf-print){display:none!important;}' +
      '#trpg-pdf-print{display:block!important;}' +
      'body{margin:0;padding:0;background:' + bgColor + '!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '}'
    document.head.appendChild(style)

    const cleanup = () => {
      printDiv.remove(); style.remove()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }, [])

  // ─── 페이지에 넘길 묶음 ───────────────────────────────────────
  const app = {
    t, page, setPage, toast,
    source, switchSource, ccfoliaMode, setCcfoliaMode,
    roomInput, setRoomInput, isFetching, fetchCount, handleFetchCcfolia,
    handleFileDrop, fileName, stats, isParsing, messages, messagesWithAvatars, templateCss,
    selectedMode, setSelectedMode,
    includeSadam, setIncludeSadam, bodyFont, setBodyFont,
    title, setTitle, author, setAuthor, coverImage, setCoverImage,
    coverReturnTo, setCoverReturnTo,
    isGenerating, handleDownload, handlePdf,
    showAvatarManager, setShowAvatarManager,
    hideAvatarArea, setHideAvatarArea,
  }

  const Page = PAGES[page] || ConvertPage

  return (
    <div style={{ display: 'flex', minHeight: '100svh', color: t.text }}>
      {!isMobile && (
        <Lnb
          page={page} onSelect={navigate}
          collapsed={collapsed} onToggleCollapse={toggleCollapse}
          isMobile={false} t={t}
        />
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {isMobile && (
          <>
            <MobileTopBar onOpenDrawer={() => setDrawerOpen(true)} t={t} />
            <Lnb
              page={page} onSelect={navigate}
              collapsed={false} isMobile
              drawerOpen={drawerOpen} onCloseDrawer={() => setDrawerOpen(false)} t={t}
            />
          </>
        )}

        <main className="page-main">
          <div style={{ maxWidth: 820, margin: '0 auto', width: '100%' }}>
            {SHOW_THEME_TOGGLE && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button type="button" onClick={() => setIsDark(d => !d)} style={{
                  ...S.btnSecondary, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 20,
                }}>
                  {isDark ? <><Sun size={14} /> 라이트</> : <><Moon size={14} /> 다크</>}
                </button>
              </div>
            )}

            {templateCss && <style>{templateCss}</style>}
            <Page app={app} />
          </div>
        </main>
      </div>

      {showAvatarManager && (
        <CcfoliaAvatarManager
          messages={messages}
          avatars={ccfoliaAvatars}
          setAvatars={setCcfoliaAvatars}
          onClose={() => setShowAvatarManager(false)}
          t={t}
        />
      )}
      <Toast toasts={toasts} />
    </div>
  )
}
