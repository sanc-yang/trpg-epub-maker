/**
 * Roll20 아카이브 HTML을 파싱해서 메시지 배열로 변환
 *
 * 반환 메시지 객체 스펙:
 * {
 *   id        : string   — Roll20 data-messageid
 *   type      : 'general' | 'hidden' | 'emote' | 'desc' | 'template' | 'rollresult'
 *   isSadam   : boolean  — OOC 사담 여부. general/hidden에만 해당.
 *   isYou     : boolean  — 파일 저장자 본인 메시지 여부
 *   speaker   : string   — 발언자 이름 ('' = 없음)
 *   content   : string   — 대사/텍스트 본문 (sanitized HTML)
 *   timestamp : string   — "October 31, 2023 9:32PM" 형식. 연속 메시지는 직전 값 상속.
 * }
 */
export async function parseRoll20Html(htmlString, localImageMap = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const templateCss = extractTemplateCss(doc);

  // 메시지 내 이미지(아바타 제외)를 base64로 사전 치환
  await embedImages(doc, localImageMap);

  const messageEls = doc.querySelectorAll('.message');

  const messages = [];
  let lastSpeaker = '';
  let lastTimestamp = '';
  let lastIconUrl = '';

  for (const el of messageEls) {
    const classList = el.classList;
    const id = el.dataset.messageid || '';

    const tstampEl = el.querySelector('.tstamp');
    const byEl = el.querySelector('.by');

    const timestamp = tstampEl?.textContent?.trim() || lastTimestamp;
    // byEl 존재 여부로 "연속 메시지"와 "공백 화자"를 구분
    // null = .by 없음(연속 메시지), 'name' = 유명 화자, 빈 이름은 GM으로 치환
    const rawSpeaker = byEl ? byEl.textContent.replace(/:$/, '').trim() : null;
    const speaker = rawSpeaker === '' ? 'GM' : rawSpeaker;

    // 아바타: .by가 있는 첫 발언 행에만 존재. 연속 메시지는 직전 값 상속.
    const avatarImg = el.querySelector('.avatar img');
    const iconUrl = (() => {
      if (!avatarImg) return speaker === null ? lastIconUrl : '';
      const src = avatarImg.getAttribute('src') || '';
      if (!src) return speaker === null ? lastIconUrl : '';
      if (src.startsWith('data:')) return src;
      // localImageMap에서 base64 resolve (브라우저 Ctrl+S 저장 경로 기준)
      const key = src.replace(/^\.\//, '');
      return localImageMap[key] || src;
    })();

    if (speaker !== null) {
      lastSpeaker = speaker;
      lastTimestamp = timestamp;
      lastIconUrl = iconUrl;
    }

    if (classList.contains('general') || classList.contains('hidden-message') || classList.contains('whisper')) {
      const isHidden = classList.contains('hidden-message');
      const isWhisper = classList.contains('whisper');
      const isYou = classList.contains('you');

      // 사담 판별: 내부에 회색 계열 color 스타일이 있으면 OOC
      const GRAY_RE = /color\s*:\s*(#(?:888|999|aaa|bbb|ccc|888888|999999|aaaaaa|bbbbbb|cccccc)|gray|grey)\b/i;
      const isSadam = [...el.querySelectorAll('[style*="color"]')].some(
        n => GRAY_RE.test(n.getAttribute('style') || '')
      );

      // 롤 템플릿 감지 (CoC 포함 모든 sheet-rolltemplate-*)
      let foundTemplate = false;
      for (const e of el.querySelectorAll('[class]')) {
        const cls = [...e.classList].find(c => c.startsWith('sheet-rolltemplate-'));
        if (cls) {
          const rawHtml = templateNodeToHtml(e)
          messages.push({
            id, type: 'template', templateClass: cls,
            templateHtml: cleanTemplateHtml(rawHtml),
            isSadam: false, isYou,
            speaker: speaker !== null ? speaker : lastSpeaker,
            content: '', timestamp, iconUrl,
          });
          foundTemplate = true;
          break;
        }
      }
      if (foundTemplate) continue;

      // 본문 추출
      let content;
      if (byEl) {
        content = siblingsToHtml(byEl.nextSibling);
      } else {
        // 연속 메시지: avatar/tstamp 제외하고 HTML 추출
        const parts = [];
        for (const child of el.childNodes) {
          if (child.nodeType === Node.ELEMENT_NODE &&
              (child.classList.contains('avatar') || child.classList.contains('tstamp'))) continue;
          parts.push(nodeToHtml(child));
        }
        content = parts.join('').trim();
      }

      if (content === 'This message has been hidden.') continue;

      // .by 없는 general 메시지 중 ': '로 시작하는 건 Roll20 GM 발언 포맷
      let resolvedSpeaker = speaker !== null ? speaker : lastSpeaker;
      let resolvedContent = isSadam ? stripInlineColor(content) : content;
      if (speaker === null && resolvedContent.startsWith(': ')) {
        resolvedSpeaker = 'GM';
        resolvedContent = resolvedContent.slice(2).trim();
      }

      messages.push({
        id,
        type: isHidden ? 'hidden' : isWhisper ? 'whisper' : 'general',
        isSadam,
        isYou,
        speaker: resolvedSpeaker,
        content: resolvedContent,
        timestamp, iconUrl: resolvedSpeaker === 'GM' ? '' : iconUrl,
      });

    } else if (classList.contains('desc')) {
      // GM 지문: <div class="spacer"> 이후 텍스트만 추출
      const content = extractTextSkippingChildren(el, ['spacer']);

      messages.push({
        id,
        type: 'desc',
        isSadam: false,
        isYou: false,
        speaker: '',
        content,
        timestamp, iconUrl,
        roll: null,
      });

    } else if (classList.contains('emote')) {
      // 판정 타이틀: avatar, spacer 제외하고 텍스트 추출
      const content = extractTextSkippingChildren(el, ['avatar', 'spacer']);

      messages.push({
        id,
        type: 'emote',
        isSadam: false,
        isYou: false,
        speaker: '',
        content,
        timestamp, iconUrl,
        roll: null,
      });

    } else if (classList.contains('rollresult')) {
      const isYou = classList.contains('you');

      // 수식 텍스트: "rolling 1d2 ... == $0" 에서 == $N 아티팩트 제거
      const formulaEl = el.querySelector('.formula:not(.formattedformula)');
      const formula = (formulaEl?.textContent || '').replace(/\s*==\s*\$\d+/g, '').trim();

      // 스타일 보존된 다이스 표시 HTML
      const formattedEl = el.querySelector('.formula.formattedformula');
      const formattedHtml = formattedEl
        ? Array.from(formattedEl.childNodes).map(nodeToHtml).join('').trim()
        : '';

      // 최종 결과값
      const rolled = el.querySelector('.rolled')?.textContent?.trim() || '';

      if (!formula && !rolled) continue;

      messages.push({
        id,
        type: 'rollresult',
        isSadam: false,
        isYou,
        speaker: speaker !== null ? speaker : lastSpeaker,
        formula,
        formattedHtml,
        rolled,
        content: '',
        timestamp, iconUrl,
        roll: null,
      });
    }
  }

  return { messages, templateCss };
}


/**
 * 메시지 내 img src를 fetch하여 base64 data URL로 치환 (아바타 제외)
 * DOM을 직접 수정하므로 이후 모든 추출 함수가 자동으로 data URL 사용
 */
async function embedImages(doc, localImageMap = {}) {
  const imgs = [...doc.querySelectorAll('img')]
    .filter(img => !img.closest('.avatar'));

  await Promise.all(imgs.map(async (img) => {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return;

    // 로컬 이미지 맵(ZIP 상대경로 또는 MHTML 원본 URL) 우선 적용 — 있으면 네트워크 요청 없이 바로 사용
    const key = src.replace(/^\.\//, '');
    if (localImageMap[key]) { img.setAttribute('src', localImageMap[key]); return; }
    if (!src.startsWith('http')) return;

    try {
      const resp = await fetch(src);
      if (!resp.ok) return;
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) return;
      const blob = await resp.blob();
      const dataUrl = await blobToDataUrl(blob);
      img.setAttribute('src', dataUrl);
    } catch (e) {
      console.warn('[embedImages] fetch 실패:', src, e);
    }
  }));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Roll20 base.css에 있어서 HTML 익스포트에 미포함되는 default 템플릿 CSS 보완
const FALLBACK_DEFAULT_TEMPLATE_CSS = `
.sheet-rolltemplate-default { font-size: 13px; }
.sheet-rolltemplate-default table { border-collapse: collapse; border-spacing: 0; width: 100%; border: 1px solid #bbb; }
.sheet-rolltemplate-default caption { background: #8624a7; color: #fff; font-weight: bold; padding: 3px 6px; text-align: left; }
.sheet-rolltemplate-default td { padding: 2px 6px; vertical-align: top; border-bottom: 1px solid #ddd; border-right: 1px solid #ddd; }
.sheet-rolltemplate-default td:last-child { border-right: none; }
.sheet-rolltemplate-default tr:last-child td { border-bottom: none; }
.sheet-rolltemplate-default tr:nth-child(odd) td { background: #f0f0f0; }
.sheet-rolltemplate-default tr:nth-child(even) td { background: #fff; }
`

/**
 * Roll20 <style> 블록에서 .sheet-rolltemplate-* 관련 CSS 규칙만 추출
 */
function extractTemplateCss(doc) {
  const css = [...doc.querySelectorAll('style')].map(el => el.textContent).join('\n');
  const result = [FALLBACK_DEFAULT_TEMPLATE_CSS];
  if (css) {
    let depth = 0;
    let blockStart = 0;
    for (let i = 0; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) {
          const block = css.slice(blockStart, i + 1).trim();
          if (block.includes('.sheet-rolltemplate-')) result.push(block);
          blockStart = i + 1;
        }
      }
    }
  }
  return pxFontSizeToEm(result.join('\n'));
}

function stripInlineColor(html) {
  return html.replace(/\bcolor\s*:[^;}"']+;?/gi, '');
}

function pxFontSizeToEm(css) {
  // 1단계: em 값은 rem으로 변환 (중첩 영향 제거), 0.75rem 미만이면 0.75rem으로 클램핑
  let result = css.replace(
    /font-size\s*:\s*(\d+(?:\.\d+)?)em/gi,
    (_, em) => {
      const clamped = Math.max(parseFloat(em), 0.75);
      return `font-size: ${clamped}rem`;
    }
  );
  // 2단계: px → rem 변환 (최소 12px, 1.1배 스케일)
  result = result.replace(
    /font-size\s*:\s*(\d+(?:\.\d+)?)px/gi,
    (_, px) => {
      const rem = (Math.max(parseFloat(px), 12) / 16 * 1.1).toFixed(4).replace(/\.?0+$/, '');
      return `font-size: ${rem}rem`;
    }
  );
  return result;
}

const COC_SUCCESS_COLORS = {
  '성공':      'background:#2e7d32;color:#fff',
  '어려운 성공': 'background:#43a047;color:#fff',
  '극단적 성공': 'background:#a5d6a7;color:#1b5e20',
  '대성공':    'background:#76ff03;color:#1a3a00',
}

function computeCocLevel(roll, skill) {
  if ((skill < 50 && roll >= 96) || (skill >= 50 && roll === 100)) return '대실패'
  if (roll > skill) return '실패'
  if (roll === 1) return '대성공'
  if (roll <= Math.ceil(skill / 5)) return '극단적 성공'
  if (roll <= Math.ceil(skill / 2)) return '어려운 성공'
  return '성공'
}

function cleanTemplateHtml(html) {
  html = html
    .replace(/(대실패|실패|성공|어려운 성공|극도의 성공)!/g, '$1')
    .replace(/<h3>\s*<span[^>]*data-i18n="regular"[^>]*>[^<]*<\/span>\s*<\/h3>/gi, '')

  // CoC 롤템플릿 한정 (sheet-coc-roll__ 클래스 보유한 템플릿만)
  if (html.includes('sheet-coc-roll__')) {
    // 판정값/기능치: inlinerollresult span 텍스트를 vs. 기준으로 추출
    // 구조: >판정값</span> ... vs. ... >기능치</span>
    const vsMatch = html.match(/>(\d+)<\/span>[\s\S]{0,500}?vs\.[\s\S]{0,500}?>(\d+)<\/span>/i)
    if (vsMatch) {
      const level = computeCocLevel(parseInt(vsMatch[1], 10), parseInt(vsMatch[2], 10))
      const colorStyle = COC_SUCCESS_COLORS[level]
      if (colorStyle) {
        // div.sheet-coc-roll__result 앞에 형제 요소로 배지 삽입 (실패 배지와 동일 구조)
        const badge = `<div style="${colorStyle};text-align:center;font-weight:bold;padding:4px 8px;">${level}</div>`
        html = html.replace(
          /(<div[^>]+class="[^"]*sheet-coc-roll__result[^"]*"[^>]*>)/,
          `${badge}$1`
        )
      }
    }
  }

  // 테이블 colspan 자동 보정: 각 tr의 실제 컬럼 수가 maxCols보다 적으면 마지막 셀에 colspan 보정
  if (html.includes('<table')) {
    const tmpDoc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
    tmpDoc.querySelectorAll('table').forEach(table => {
      const effectiveCols = (tr) =>
        Array.from(tr.querySelectorAll('th, td'))
          .reduce((s, c) => s + parseInt(c.getAttribute('colspan') || '1', 10), 0)
      const rows = Array.from(table.querySelectorAll('tr'))
      const maxCols = rows.reduce((max, tr) => Math.max(max, effectiveCols(tr)), 0)
      if (maxCols < 2) return
      rows.forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('th, td'))
        if (!cells.length) return
        const current = effectiveCols(tr)
        if (current < maxCols) {
          const last = cells[cells.length - 1]
          const lastSpan = parseInt(last.getAttribute('colspan') || '1', 10)
          last.setAttribute('colspan', String(lastSpan + maxCols - current))
        }
      })
    })
    html = tmpDoc.querySelector('div').innerHTML
  }

  return html
}

const TEMPLATE_VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']);
const TEMPLATE_SKIP_TAGS = new Set(['script', 'style']);
const TEMPLATE_SKIP_ATTRS = new Set(['id', 'onclick', 'onmouseenter', 'onmouseleave', 'onmouseover', 'onmouseout']);

/**
 * rolltemplate 엘리먼트를 EPUB용 HTML로 변환 (class/style/data-* 속성 보존)
 */
function templateNodeToHtml(node) {
  if (node.nodeType === Node.TEXT_NODE) return escHtml(node.textContent);
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.classList.contains('flyout')) return '';
    const tag = node.tagName.toLowerCase();
    if (TEMPLATE_SKIP_TAGS.has(tag)) return escHtml(node.textContent || '');
    const attrs = Array.from(node.attributes)
      .filter(a => !TEMPLATE_SKIP_ATTRS.has(a.name))
      .map(a => {
        const val = a.name === 'style' ? pxFontSizeToEm(a.value || '') : (a.value || '')
        return `${a.name}="${val.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
      })
      .join(' ');
    if (TEMPLATE_VOID_TAGS.has(tag)) {
      const errorAttr = tag === 'img' ? ` onerror="this.style.display='none'"` : '';
      return `<${tag}${attrs ? ' ' + attrs : ''}${errorAttr} />`;
    }
    const inner = Array.from(node.childNodes).map(templateNodeToHtml).join('');
    return `<${tag}${attrs ? ' ' + attrs : ''}>${inner}</${tag}>`;
  }
  return '';
}

function escHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 노드 하나를 HTML 문자열로 변환. 모든 엘리먼트 구조와 inline style 그대로 보존.
// 텍스트 노드의 개행/연속 공백은 원본 HTML이 예쁘게 들여쓰기된 흔적이라 일반 공백 1개로 합침.
// 안 그러면 white-space:pre-wrap로 렌더링하는 화면(코코포리아 스타일 등)에서 의도치 않은 줄바꿈이 보임.
function nodeToHtml(node) {
  if (node.nodeType === Node.TEXT_NODE) return escHtml(node.textContent.replace(/\s+/g, ' '));
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.classList.contains('dicegrouping')) {
      // "== $0" 아티팩트 텍스트 스트립, "(" ")" 및 하위 diceroll은 유지
      const parts = [];
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent.replace(/\s*==\s*\$\d+/g, '').replace(/\s+/g, ' ');
          if (text.trim()) parts.push(escHtml(text));
        } else {
          parts.push(nodeToHtml(child));
        }
      }
      return parts.join('');
    }
    if (node.classList.contains('diceroll')) {
      const didroll = node.querySelector('.didroll')
      const text = didroll ? escHtml(didroll.textContent.trim()) : escHtml(node.textContent.trim())
      return `<span style="display:inline-block;min-width:1.2em;padding:1px 4px;border:1px solid #bbb;background:#f9f9f9;text-align:center;border-radius:2px;">${text}</span>`
    }
    if (node.tagName?.toLowerCase() === 'br') return '<br />';
    if (node.tagName?.toLowerCase() === 'img') {
      const src = (node.getAttribute('src') || '').replace(/"/g, '&quot;');
      const alt = escHtml(node.getAttribute('alt') || '');
      const style = (node.getAttribute('style') || '').replace(/"/g, '&quot;');
      return `<img src="${src}" alt="${alt}"${style ? ` style="${style}"` : ''} onerror="this.style.display='none'" />`;
    }
    // inlinerollresult에 inline style이 없으면 Roll20 기본 스타일 폴백
    if (node.classList.contains('inlinerollresult') && !node.getAttribute('style')) {
      const inner = Array.from(node.childNodes).map(nodeToHtml).join('');
      return `<span style="background-color:#FEF68E;border:2px solid #FEF68E;color:#333;font-weight:bold;padding:0 2px;">${inner}</span>`;
    }
    const tag = node.tagName.toLowerCase();
    const KEEP_ATTRS = new Set(['style', 'colspan', 'rowspan', 'scope', 'align', 'valign', 'width', 'height', 'href', 'src', 'alt', 'type'])
    const attrs = Array.from(node.attributes)
      .filter(a => KEEP_ATTRS.has(a.name))
      .map(a => `${a.name}="${(a.value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
      .join(' ')
    const inner = Array.from(node.childNodes).map(nodeToHtml).join('');
    return `<${tag}${attrs ? ' ' + attrs : ''}>${inner}</${tag}>`;
  }
  return '';
}

// startNode부터 형제 노드를 순회하며 HTML 합산
function siblingsToHtml(startNode) {
  const parts = [];
  let node = startNode;
  while (node) { parts.push(nodeToHtml(node)); node = node.nextSibling; }
  return parts.join('').trim();
}

/**
 * el의 자식 노드를 순회하되, skipClasses에 해당하는 element는 건너뜀
 */
function extractTextSkippingChildren(el, skipClasses) {
  const parts = [];
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(escHtml(node.textContent.replace(/\s+/g, ' ')));
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const shouldSkip = skipClasses.some(cls => node.classList.contains(cls));
      if (!shouldSkip) {
        parts.push(nodeToHtml(node));
      }
    }
  }
  return parts.join('').trim();
}
