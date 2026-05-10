/**
 * Roll20 아카이브 HTML을 파싱해서 메시지 배열로 변환
 *
 * 반환 메시지 객체 스펙:
 * {
 *   id        : string   — Roll20 data-messageid
 *   type      : 'general' | 'hidden' | 'emote' | 'desc'
 *                 - general : 플레이어/GM 대사
 *                 - hidden  : 귓속말 (GM에게만 보이는 메시지)
 *                 - desc    : GM 일반 지문 (장면 묘사, 내레이션)
 *                 - emote   : GM 특수 지문 (판정 요청, 특수 상황 강조 등)
 *   isSadam   : boolean  — true면 OOC 사담 (회색 텍스트). general/hidden에만 해당.
 *   isYou     : boolean  — 파일 저장자 본인 메시지 여부
 *   speaker   : string   — 발언자 이름 (':::' = GM 시스템 메시지, '' = 없음)
 *   content   : string   — 대사/텍스트 본문 (roll이 있을 경우 빈 문자열일 수 있음)
 *   timestamp : string   — "October 31, 2023 9:32PM" 형식. 연속 메시지는 직전 값 상속.
 *   roll      : null | {  — CoC 7th 판정 블록. 없으면 null.
 *     character    : string  — 판정 캐릭터명
 *     skill        : string  — 판정 기능명
 *     successLevel : string  — 대성공 / 어려운 성공 / 성공 / 실패 / 대실패
 *     rollValue    : number  — 내가 낸 주사위 값
 *     skillValue   : number  — 기능치
 *   }
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

    if (speaker !== null) {
      lastSpeaker = speaker;
      lastTimestamp = timestamp;
    }

    if (classList.contains('general') || classList.contains('hidden-message')) {
      const isHidden = classList.contains('hidden-message');
      const isYou = classList.contains('you');

      // 사담 판별: 내부에 color #aaaaaa 스타일 span이 있으면 OOC
      const isSadam = !!el.querySelector('span[style*="#aaaaaa"]');

      // CoC 7th 판정 블록 감지
      const rollEl = el.querySelector('.sheet-rolltemplate-callofcthulhu');
      const roll = rollEl ? parseCoCRoll(rollEl) : null;

      // 기타 롤 템플릿 감지 (non-CoC)
      if (!roll) {
        let foundTemplate = false;
        for (const e of el.querySelectorAll('[class]')) {
          const cls = [...e.classList].find(c => c.startsWith('sheet-rolltemplate-'));
          if (cls) {
            messages.push({
              id, type: 'template', templateClass: cls,
              templateHtml: templateNodeToHtml(e),
              isSadam: false, isYou,
              speaker: speaker !== null ? speaker : lastSpeaker,
              content: '', timestamp, roll: null,
            });
            foundTemplate = true;
            break;
          }
        }
        if (foundTemplate) continue;
      }

      // 본문 추출 (inlinerollresult span HTML 보존)
      let content = '';
      if (roll) {
        const clone = el.cloneNode(true);
        clone.querySelector('.sheet-rolltemplate-callofcthulhu')?.remove();
        const byClone = clone.querySelector('.by');
        if (byClone) content = siblingsToHtml(byClone.nextSibling);
      } else if (byEl) {
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

      if (content === 'This message has been hidden.' && !roll) continue;

      messages.push({
        id,
        type: isHidden ? 'hidden' : 'general',
        isSadam,
        isYou,
        speaker: speaker !== null ? speaker : lastSpeaker,
        content,
        timestamp,
        roll,
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
        timestamp,
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
        timestamp,
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
        timestamp,
        roll: null,
      });
    }
  }

  return { messages, templateCss };
}

/**
 * CoC 7th 판정 블록 파싱
 * - h3의 failure div 유무로 성공/실패 판정
 * - 성공 레벨은 roll ÷ skill 계산으로 도출 (HTML에 명시되지 않음)
 */
function parseCoCRoll(rollEl) {
  const character = rollEl.querySelector('h2')?.textContent?.trim() || '';
  const skill = rollEl.querySelector('h1')?.textContent?.trim() || '';

  const isFailed = !!rollEl.querySelector('.sheet-coc-roll__failure');

  // 주사위 값 추출: 첫 번째 = roll, 두 번째 = skill값
  const rollSpans = rollEl.querySelectorAll('.sheet-coc-roll__roll .inlinerollresult');
  const rollValue = parseInt(rollSpans[0]?.textContent || '0', 10);
  const skillValue = parseInt(rollSpans[1]?.textContent || '0', 10);

  let successLevel;
  if (isFailed) {
    // 대실패: skill < 50이면 96~100, skill >= 50이면 100
    const isFumble = skillValue < 50 ? rollValue >= 96 : rollValue === 100;
    successLevel = isFumble ? '대실패' : '실패';
  } else {
    if (rollValue <= Math.floor(skillValue / 5)) {
      successLevel = '대성공';
    } else if (rollValue <= Math.floor(skillValue / 2)) {
      successLevel = '어려운 성공';
    } else {
      successLevel = '성공';
    }
  }

  return { character, skill, successLevel, rollValue, skillValue };
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

    // ZIP에서 추출한 로컬 이미지 맵 우선 적용
    if (!src.startsWith('http')) {
      const key = src.replace(/^\.\//, '');
      if (localImageMap[key]) img.setAttribute('src', localImageMap[key]);
      return;
    }

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

/**
 * Roll20 <style> 블록에서 .sheet-rolltemplate-* 관련 CSS 규칙만 추출
 */
function extractTemplateCss(doc) {
  const styleEl = doc.querySelector('style');
  if (!styleEl) return '';
  const css = styleEl.textContent;
  const result = [];
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
  return result.join('\n');
}

const TEMPLATE_VOID_TAGS = new Set(['br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']);
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
      .map(a => `${a.name}="${(a.value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
      .join(' ');
    if (TEMPLATE_VOID_TAGS.has(tag)) return `<${tag}${attrs ? ' ' + attrs : ''} />`;
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

// Roll20 원본 inline style을 보존해야 하는 클래스
const STYLED_ROLL_CLASSES = ['inlinerollresult', 'basicdiceroll', 'diceresult', 'diceroll'];

// 노드 하나를 HTML 문자열로 변환. dice 관련 요소는 원본 style 그대로 보존.
function nodeToHtml(node) {
  if (node.nodeType === Node.TEXT_NODE) return escHtml(node.textContent);
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.classList.contains('dicegrouping')) {
      // "== $0" 아티팩트 텍스트 스트립, "(" ")" 및 하위 diceroll은 유지
      const parts = [];
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent.replace(/\s*==\s*\$\d+/g, '');
          if (text.trim()) parts.push(escHtml(text));
        } else {
          parts.push(nodeToHtml(child));
        }
      }
      return parts.join('');
    }
    if (node.tagName?.toLowerCase() === 'br') return '<br />';
    if (node.tagName?.toLowerCase() === 'img') {
      const src = (node.getAttribute('src') || '').replace(/"/g, '&quot;');
      const alt = escHtml(node.getAttribute('alt') || '');
      const style = (node.getAttribute('style') || '').replace(/"/g, '&quot;');
      return `<img src="${src}" alt="${alt}"${style ? ` style="${style}"` : ''} />`;
    }
    const isRollEl = STYLED_ROLL_CLASSES.some(cls => node.classList.contains(cls));
    if (isRollEl) {
      let style = (node.getAttribute('style') || '').replace(/"/g, '&quot;');
      // inlinerollresult에 inline style이 없으면 Roll20 기본 스타일 폴백
      if (node.classList.contains('inlinerollresult') && !style) {
        style = 'background-color:#FEF68E;border:2px solid #FEF68E;font-weight:bold;padding:0 2px;';
      }
      const inner = Array.from(node.childNodes).map(nodeToHtml).join('');
      return `<span style="${style}">${inner}</span>`;
    }
    return Array.from(node.childNodes).map(nodeToHtml).join('');
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
      parts.push(escHtml(node.textContent));
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const shouldSkip = skipClasses.some(cls => node.classList.contains(cls));
      if (!shouldSkip) {
        parts.push(nodeToHtml(node));
      }
    }
  }
  return parts.join('').trim();
}
