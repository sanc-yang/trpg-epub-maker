/**
 * 코코포리아 로그 파서
 *
 * 지원 방식:
 * 1. fetchCcfoliaLog(roomId, onProgress) — Firestore REST API로 수집
 * 2. parseCcfoliaHtml(htmlString) — HTML 직접 업로드 파싱
 *
 * 반환 메시지 형식은 parseRoll20.js 스펙과 동일:
 * { id, type, isSadam, isYou, speaker, content, timestamp }
 */

const FIRESTORE_BASE =
  'https://firestore.googleapis.com/v1/projects/ccfolia-160aa/databases/(default)/documents'

// ── 공통 유틸 ─────────────────────────────────────────────────────
function escHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * URL 또는 방 ID 문자열에서 room ID만 추출
 * - "https://ccfolia.com/rooms/abc123" → "abc123"
 * - "abc123" → "abc123"
 */
export function extractRoomId(input) {
  const match = (input || '').match(/rooms\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input.trim()
}

// ── Firestore API fetch ────────────────────────────────────────────
/**
 * 방 ID로 전체 로그를 Firestore REST API로 수집
 * @param {string} roomId
 * @param {(count: number) => void} onProgress
 * @returns {Promise<{ messages: object[], templateCss: string }>}
 */
export async function fetchCcfoliaLog(roomId, onProgress) {
  const allDocs = []
  let pageToken = undefined

  do {
    const params = new URLSearchParams({ pageSize: '300' })
    if (pageToken) params.set('pageToken', pageToken)

    const resp = await fetch(`${FIRESTORE_BASE}/rooms/${roomId}/messages?${params}`)
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`Firestore API 오류 (${resp.status})\n방 ID를 확인해주세요.${text ? '\n' + text.slice(0, 200) : ''}`)
    }

    const data = await resp.json()
    if (data.documents?.length) {
      allDocs.push(...data.documents)
      onProgress?.(allDocs.length)
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  // createTime 기준 오름차순 정렬
  allDocs.sort((a, b) => new Date(a.createTime) - new Date(b.createTime))

  return { messages: firestoreDocsToMessages(allDocs), templateCss: '' }
}

/**
 * Firestore 문서 배열 → 공통 메시지 형식 변환
 *
 * Firestore 필드 구조:
 *   fields.name.stringValue        — 발언자 이름
 *   fields.text.stringValue        — 발언 내용
 *   fields.color.stringValue       — 캐릭터 컬러 (#rrggbb)
 *   fields.secret.booleanValue     — 비밀 메시지 여부
 *   fields.channel.stringValue     — 탭 ID
 *   fields.channelName.stringValue — 탭 이름 ('잡담' = 사담)
 *   fields.iconUrl.stringValue     — 캐릭터 아바타 이미지 URL
 *   fields.extend.mapValue.fields.roll.mapValue.fields.result.stringValue — 주사위 결과
 *   createTime                     — ISO 타임스탬프
 */
function firestoreDocsToMessages(docs) {
  const messages = []

  for (const doc of docs) {
    const f = doc.fields || {}
    const name = f.name?.stringValue || ''
    const text = f.text?.stringValue || ''
    const secret = f.secret?.booleanValue ?? false
    const channelName = f.channelName?.stringValue || ''
    const charColor = f.color?.stringValue || ''
    // iconUrl 필드명은 버전마다 다를 수 있어 후보를 순서대로 시도
    const iconUrl =
      f.iconUrl?.stringValue ||
      f.imageUrl?.stringValue ||
      f.image?.stringValue ||
      ''
    const rollResult =
      f.extend?.mapValue?.fields?.roll?.mapValue?.fields?.result?.stringValue || ''
    const ts = doc.createTime
      ? new Date(doc.createTime).toLocaleString('ko-KR', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        })
      : ''
    const docId = doc.name?.split('/').pop() || String(messages.length)

    // 이름도 텍스트도 주사위도 없으면 시스템 메시지로 간주, 스킵
    if (!name && !text && !rollResult) continue

    // '잡담' 탭 = OOC 사담
    const isSadam = channelName === '잡담'

    let content = escHtml(text)
    if (rollResult) {
      content += `<div style="font-size:0.85em;color:#888;margin-top:4px;">[🎲 ${escHtml(rollResult)}]</div>`
    }

    messages.push({
      id: `ccfolia-${docId}`,
      type: secret ? 'hidden' : 'general',
      isSadam,
      isYou: false,
      speaker: name,
      content,
      timestamp: ts,
      charColor,
      iconUrl,
      channelName,
    })
  }

  return messages
}

// ── HTML 업로드 파싱 ───────────────────────────────────────────────
/**
 * 코코포리아 HTML 내보내기 파싱
 *
 * 코코포리아 HTML 내보내기 구조 (실제 파일로 테스트 후 셀렉터 조정 필요):
 * <div class="message-item">
 *   <div class="character-name">캐릭터명</div>
 *   <div class="message-text">내용</div>
 *   <div class="message-dice">주사위 결과</div>
 * </div>
 */
export async function parseCcfoliaHtml(htmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlString, 'text/html')
  const messages = []

  // 코코포리아 HTML 내보내기의 메시지 컨테이너 후보 셀렉터
  // 실제 파일 구조에 따라 조정이 필요할 수 있음
  const SELECTORS = [
    // 패턴 A: class에 'message' 포함 li/div
    'li[class*="message"]',
    'div[class*="message-item"]',
    'div[class*="chatMessage"]',
    // 패턴 B: data-type 속성
    '[data-type="message"]',
    // 패턴 C: 일반적인 채팅 로그 패턴
    '.log-message',
    '.chat-log-item',
  ]

  let messageEls = []
  for (const sel of SELECTORS) {
    const found = doc.querySelectorAll(sel)
    if (found.length > 0) {
      messageEls = [...found]
      break
    }
  }

  // 셀렉터가 안 맞으면 빈 배열 반환 (사용자에게 알림)
  if (!messageEls.length) {
    return { messages: [], templateCss: '', parseError: 'HTML 구조를 인식하지 못했습니다. 실제 코코포리아 HTML 파일로 테스트 후 파서를 조정해주세요.' }
  }

  for (const el of messageEls) {
    const nameEl =
      el.querySelector('[class*="name"]') ||
      el.querySelector('[class*="character"]') ||
      el.querySelector('[class*="speaker"]')

    const textEl =
      el.querySelector('[class*="text"]') ||
      el.querySelector('[class*="body"]') ||
      el.querySelector('[class*="content"]') ||
      el.querySelector('p')

    const diceEl =
      el.querySelector('[class*="dice"]') ||
      el.querySelector('[class*="roll"]')

    const name = nameEl?.textContent?.trim() || ''
    const text = textEl?.textContent?.trim() || ''
    const diceText = diceEl?.textContent?.trim() || ''

    if (!text && !diceText) continue

    let content = escHtml(text)
    if (diceText && diceText !== text) {
      content += `<div style="font-size:0.85em;color:#555;margin-top:4px;">[🎲 ${escHtml(diceText)}]</div>`
    }

    messages.push({
      id: `ccfolia-html-${messages.length}`,
      type: 'general',
      isSadam: false,
      isYou: false,
      speaker: name,
      content,
      timestamp: '',
    })
  }

  return { messages, templateCss: '' }
}
