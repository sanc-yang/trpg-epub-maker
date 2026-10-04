import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Sun, Moon } from 'lucide-react'
import JSZip from 'jszip'
import { parseRoll20Html } from './utils/parseRoll20'
import { mhtmlToHtml } from './utils/parseMhtml'
import { fetchCcfoliaLog, parseCcfoliaHtml, mergeCcfoliaLogs, extractRoomId } from './utils/parseCcfolia'
import { generateEpub, parseEpubMeta, patchEpubCover, DEFAULT_BODY_FONT } from './utils/generateEpub'
import { makeTheme, styles } from './theme'
import { useMediaQuery } from './hooks'
import { SHOW_THEME_TOGGLE } from './featureFlags'
import Toast from './components/Toast'
import AvatarManager from './components/AvatarManager'
import Lnb, { MobileTopBar } from './components/Lnb'
import ConvertPage from './pages/ConvertPage'
import BookInfoPage from './pages/BookInfoPage'
import CoverPage from './pages/CoverPage'
import LogEditPage from './pages/LogEditPage'
import './App.css'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'])
const MIME_MAP = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }

const PAGES = { convert: ConvertPage, bookinfo: BookInfoPage, cover: CoverPage, logedit: LogEditPage }

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
  // 병합 업로드 시 원본 파일명 목록 (2개 이상일 때만 드롭존에 리스트로 표시)
  const [sourceFiles, setSourceFiles] = useState([])
  // 코코포리아 업로드 방식 — null(선택 전) | 'single'(파일 하나) | 'split'(나눠 뽑은 파일 여러 개 병합)
  const [ccfoliaUpload, setCcfoliaUpload] = useState(null)
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

  // 기존에 만든 .epub 파일을 직접 업로드해 책 정보/표지만 다시 고치는 경로.
  // 로그 변환 플로우와 완전히 무관하게 동작해야 해서 title/author/coverImage를
  // 공유하지 않고 따로 둠 — 로그 변환 중이던 내용을 절대 건드리지 않음.
  // { buffer, fileName } | null — 있으면 다운로드 시 로그 재변환 대신 이 원본을 패치함
  const [uploadedEpub, setUploadedEpub] = useState(null)
  const [epubTitle, setEpubTitle] = useState('')
  const [epubAuthor, setEpubAuthor] = useState('')
  const [epubCoverImage, setEpubCoverImage] = useState(null)

  // 표지 생성기에서 「이 표지로 적용하기」 후 돌아갈 페이지. 기본값 = 책 정보 수정.
  // 로그 변환 화면의 표지 생성기 링크만 'convert'로 바꿔 돌아갈 곳을 지정함.
  const [coverReturnTo, setCoverReturnTo] = useState('bookinfo')
  const navigate = useCallback((p) => {
    if (p === 'cover') setCoverReturnTo('bookinfo') // LNB로 직접 들어오면 기본 반환처로
    // 로그 변환 화면은 업로드된 epub으로 할 수 있는 게 없으니 들어가면 비움
    if (p === 'convert') setUploadedEpub(null)
    setPage(p)
  }, [])

  // 플랫폼 입력
  const [source, setSource] = useState(() => localStorage.getItem('trpg_source') || 'roll20')
  const [ccfoliaMode, setCcfoliaMode] = useState('html')
  const [roomInput, setRoomInput] = useState('')
  const [isFetching, setIsFetching] = useState(false)
  const [fetchCount, setFetchCount] = useState(0)

  // 화자별 프로필 인장(직접 업로드) — 세션 한정, 저장하지 않음
  // 코코포리아는 원래 아바타가 없고, Roll20은 원본이 외부 URL이라 변환물에서 깨지기 때문에 둘 다 필요
  const [avatars, setAvatars] = useState({}) // { speakerName: base64 }
  const [showAvatarManager, setShowAvatarManager] = useState(false)
  // 인장 영역 제거 — Roll20/코코포리아 미리보기에서 프로필 이미지 칸 자체를 안 그림
  const [hideAvatarArea, setHideAvatarArea] = useState(false)
  // 로그 편집(개별 메시지 숨김/구간 잘라내기) — 세션 한정, 저장하지 않음
  const [hiddenMessageIds, setHiddenMessageIds] = useState(() => new Set())
  const visibleMessages = useMemo(() => (
    hiddenMessageIds.size ? messages.filter(m => !hiddenMessageIds.has(m.id)) : messages
  ), [messages, hiddenMessageIds])

  const messagesWithAvatars = useMemo(() => {
    if (!Object.keys(avatars).length) return visibleMessages
    return visibleMessages.map(m => (m.speaker && avatars[m.speaker])
      ? { ...m, iconUrl: avatars[m.speaker] }
      : m)
  }, [visibleMessages, avatars])

  // ─── 파싱 결과 → 상태 반영 ────────────────────────────────────
  const applyParsedResult = useCallback(({ messages: parsed, templateCss: css }, name, isRoll20 = true) => {
    setIsParsing(false)
    setSelectedMode(null)
    setFileName(name)
    setSourceFiles([name])
    setTitle(name.replace(/\.(html|zip|mhtml|mht)$/i, ''))
    setMessages(parsed)
    setTemplateCss(css || '')
    setAvatars({})
    setHiddenMessageIds(new Set())
    setUploadedEpub(null)
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
  }, [setIsParsing, setSelectedMode, setFileName, setTitle, setMessages, setTemplateCss, setAvatars, setHiddenMessageIds, setUploadedEpub, setStats, setSourceFiles])

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

    if (/\.(mhtml|mht)$/i.test(file.name)) {
      file.arrayBuffer().then(async (buffer) => {
        try {
          const { html: htmlText, imageMap } = mhtmlToHtml(buffer)
          applyParsedResult(await parseRoll20Html(htmlText, imageMap), file.name, true)
        } catch (err) {
          toast(`MHTML 파싱 실패: ${err.message}`, 'error')
          setIsParsing(false)
        }
      })
      return
    }

    if (!file.name.endsWith('.html')) { setIsParsing(false); return }
    const reader = new FileReader()
    reader.onload = async (e) => applyParsedResult(await parseRoll20Html(e.target.result, {}), file.name, true)
    reader.readAsText(file, 'utf-8')
  }, [applyParsedResult, toast])

  // ─── 코코포리아 ───────────────────────────────────────────────
  // 업로드된 파일별 파싱 결과 [{ name, messages }]. 나중에 파일을 더 올리면 여기에 추가해서 다시 병합.
  const ccfoliaPartsRef = useRef([])

  // 파일이 여러 개면 파일명 순(_1, _2 … 숫자 인식)으로 정렬 후 겹치는 구간을 제거해 하나로 합침.
  // 'split' 모드에서 이미 올린 파일이 있으면 교체가 아니라 이어서 합침 (같은 이름이면 새 파일로 덮어씀).
  // 'single' 모드는 항상 첫 파일 하나로 교체. 새로 시작하려면 X 버튼.
  const handleCcfoliaFiles = useCallback(async (files) => {
    if (ccfoliaUpload !== 'split') { files = files.slice(0, 1); ccfoliaPartsRef.current = [] }
    const htmlFiles = files.filter(f => f.name.endsWith('.html'))
    if (!htmlFiles.length) return
    setIsParsing(true)

    const newParts = []
    for (const f of htmlFiles) {
      const result = await parseCcfoliaHtml(await f.text())
      if (result.parseError) { toast(`${f.name}: ${result.parseError}`, 'error'); setIsParsing(false); return }
      newParts.push({ name: f.name, messages: result.messages })
    }

    const newNames = new Set(newParts.map(p => p.name))
    const parts = [...ccfoliaPartsRef.current.filter(p => !newNames.has(p.name)), ...newParts]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    ccfoliaPartsRef.current = parts

    if (parts.length === 1) { applyParsedResult({ messages: parts[0].messages, templateCss: '' }, parts[0].name, false); return }

    const { messages: merged, removed } = mergeCcfoliaLogs(parts.map(p => p.messages))
    // "로그_1.html" 외 N개 → 제목은 공통 이름("로그")으로
    const name = parts[0].name.replace(/[_\-\s]*\d+\.html$/i, '.html')
    const keepAvatars = avatars // 이어 붙이는 경우 화자별 인장은 유지
    applyParsedResult({ messages: merged, templateCss: '' }, name, false)
    setAvatars(keepAvatars)
    setSourceFiles(parts.map(p => p.name))
    toast(`${parts.length}개 파일 병합 완료${removed ? ` · 중복 ${removed}개 제거` : ''}`)
  }, [applyParsedResult, toast, avatars, ccfoliaUpload])

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

  // 코코포리아 드롭존은 multiple 이라 File 배열이 들어옴
  const handleFileDrop = useCallback((fileOrFiles) => {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles].filter(Boolean)
    if (source === 'roll20') handleRoll20File(files[0])
    else handleCcfoliaFiles(files)
  }, [source, handleRoll20File, handleCcfoliaFiles])

  const switchSource = useCallback((s) => {
    if (s === source) return
    if ((messages.length > 0 || fileName) &&
      !window.confirm('탭을 전환하면 지금까지 변환한 내용이 초기화됩니다. 계속할까요?')) {
      return
    }
    localStorage.setItem('trpg_source', s)
    setSource(s)
    setMessages([]); setStats(null); setFileName(''); setSourceFiles([]); ccfoliaPartsRef.current = []; setCcfoliaUpload(null); setTemplateCss('')
    setSelectedMode(null); setIsParsing(false); setAvatars({}); setHiddenMessageIds(new Set())
  }, [source, messages.length, fileName])

  // 드롭존의 X 버튼 — 업로드된 로그를 지우고 초기 화면(빈 드롭존)으로 되돌림
  const clearLog = useCallback(() => {
    setMessages([]); setStats(null); setFileName(''); setSourceFiles([]); ccfoliaPartsRef.current = []; setCcfoliaUpload(null); setTemplateCss('')
    setSelectedMode(null); setIsParsing(false); setAvatars({}); setHiddenMessageIds(new Set())
  }, [])

  // ─── 기존 .epub 업로드 (책 정보/표지만 다시 고치기) ────────────
  // 로그 변환 중이던 상태(messages 등)는 절대 건드리지 않음 — 서로 완전히 무관한 플로우.
  const handleEpubUpload = useCallback((file) => {
    if (!file || !file.name.endsWith('.epub')) return
    file.arrayBuffer().then(async (buffer) => {
      try {
        const meta = await parseEpubMeta(buffer)
        setUploadedEpub({ buffer, fileName: file.name })
        setEpubTitle(meta.title || file.name.replace(/\.epub$/i, ''))
        setEpubAuthor(meta.author || '')
        setEpubCoverImage(meta.coverImage || null)
        toast('epub 파일을 불러왔습니다')
      } catch {
        toast('epub 파일을 읽을 수 없습니다. 형식을 확인해주세요.', 'error')
      }
    })
  }, [toast])

  // ─── 다운로드 ────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if ((!messages.length && !uploadedEpub) || isGenerating) return
    setIsGenerating(true)
    try {
      const blob = uploadedEpub
        ? await patchEpubCover(uploadedEpub.buffer, { title: epubTitle, author: epubAuthor, coverImage: epubCoverImage })
        : await generateEpub(messagesWithAvatars, {
            title, author, coverImage, coverTitle: title,
            includeSadam, templateCss, bodyFont,
          })
      const downloadName = uploadedEpub
        ? (epubTitle || uploadedEpub.fileName.replace(/\.epub$/i, ''))
        : (title || fileName.replace(/\.(html|zip|mhtml|mht)$/i, ''))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${downloadName}.epub`
      a.click()
      URL.revokeObjectURL(url)
      toast('epub 다운로드 완료!')
      // epub 편집 플로우는 다운로드가 끝이라 처음 업로드 화면으로 되돌림
      if (uploadedEpub) {
        setUploadedEpub(null); setEpubTitle(''); setEpubAuthor(''); setEpubCoverImage(null)
      }
    } finally {
      setIsGenerating(false)
    }
  }, [messages, messagesWithAvatars, uploadedEpub, epubTitle, epubAuthor, epubCoverImage, title, author, coverImage, fileName, isGenerating, includeSadam, templateCss, bodyFont, toast])

  // ─── 페이지에 넘길 묶음 ───────────────────────────────────────
  const app = {
    t, page, setPage, toast,
    source, switchSource, ccfoliaMode, setCcfoliaMode,
    roomInput, setRoomInput, isFetching, fetchCount, handleFetchCcfolia,
    handleFileDrop, clearLog, fileName, sourceFiles, ccfoliaUpload, setCcfoliaUpload, stats, isParsing, messages, messagesWithAvatars, templateCss,
    selectedMode, setSelectedMode,
    includeSadam, setIncludeSadam, bodyFont, setBodyFont,
    title, setTitle, author, setAuthor, coverImage, setCoverImage,
    coverReturnTo, setCoverReturnTo,
    uploadedEpub, handleEpubUpload,
    epubTitle, setEpubTitle, epubAuthor, setEpubAuthor, epubCoverImage, setEpubCoverImage,
    isGenerating, handleDownload,
    showAvatarManager, setShowAvatarManager,
    hideAvatarArea, setHideAvatarArea,
    hiddenMessageIds, setHiddenMessageIds,
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
                <button type="button" className="btn-secondary" onClick={() => setIsDark(d => !d)} style={{
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
        <AvatarManager
          messages={messages}
          avatars={avatars}
          setAvatars={setAvatars}
          onClose={() => setShowAvatarManager(false)}
          source={source}
          t={t}
        />
      )}
      <Toast toasts={toasts} />
    </div>
  )
}
