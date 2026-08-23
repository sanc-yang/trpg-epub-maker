/**
 * 메시지 배열에 연속발언(isContinuation) / 그룹 마지막(isLastInGroup) 플래그 부여.
 * Roll20 · 코코포리아 두 스타일 패널이 같은 규칙을 쓰므로 여기로 모음.
 */
export function annotate(messages, includeSadam) {
  let lastSpeaker = ''
  let lastChannel = ''
  const filtered = messages.filter(msg => !(msg.isSadam && !includeSadam))

  const rows = filtered.map(msg => {
    const isContinuation = !!msg.speaker && msg.speaker === lastSpeaker && (msg.channelName || '') === lastChannel
    lastSpeaker = msg.speaker
    lastChannel = msg.channelName || ''
    return { msg, isContinuation }
  })

  return rows.map((r, i) => ({
    ...r,
    isLastInGroup: i === rows.length - 1 || !rows[i + 1].isContinuation,
  }))
}
