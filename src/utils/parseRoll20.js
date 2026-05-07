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
export function parseRoll20Html(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
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
    const speaker = byEl ? byEl.textContent.replace(/:$/, '').trim() : '';

    if (speaker) {
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

      // 본문 추출
      let content = '';
      if (roll) {
        // 판정 블록이 있으면 roll 블록 외 텍스트만 추출
        const clone = el.cloneNode(true);
        clone.querySelector('.sheet-rolltemplate-callofcthulhu')?.remove();
        const byClone = clone.querySelector('.by');
        if (byClone) {
          const parts = [];
          let node = byClone.nextSibling;
          while (node) { parts.push(node.textContent); node = node.nextSibling; }
          content = parts.join('').trim();
        }
      } else if (byEl) {
        // .by 이후 노드들을 순회해서 텍스트 수집
        // inline 주사위 결과(<span class="inlinerollresult">) 등도 textContent로 포함
        const parts = [];
        let node = byEl.nextSibling;
        while (node) {
          parts.push(node.textContent);
          node = node.nextSibling;
        }
        content = parts.join('').trim();
      } else {
        // 연속 메시지: avatar/tstamp/by 없이 텍스트만 있는 구조
        content = el.textContent.trim();
      }

      if (content === 'This message has been hidden.' && !roll) continue;

      messages.push({
        id,
        type: isHidden ? 'hidden' : 'general',
        isSadam,
        isYou,
        speaker: speaker || lastSpeaker,
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
    }
  }

  return messages;
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
 * el의 자식 노드를 순회하되, skipClasses에 해당하는 element는 건너뜀
 * 나머지 텍스트를 합쳐서 반환
 */
function extractTextSkippingChildren(el, skipClasses) {
  const parts = [];
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const shouldSkip = skipClasses.some(cls => node.classList.contains(cls));
      if (!shouldSkip) {
        parts.push(node.textContent);
      }
    }
  }
  return parts.join('').trim();
}
