import { useCallback, useSyncExternalStore } from 'react'

/**
 * 미디어쿼리 구독. LNB 처럼 «구조»가 바뀌는 분기에만 사용.
 * 단순 크기 조절은 CSS 미디어쿼리로 처리하는 편이 리렌더가 없어 유리함.
 *
 * useEffect + setState 대신 useSyncExternalStore 를 쓰는 이유 = 첫 렌더에
 * 값을 맞추려고 effect 안에서 setState 하면 연쇄 렌더가 생김.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    const mq = window.matchMedia(query)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  // 서버 스냅샷은 쓰지 않지만(SPA) 시그니처상 필요
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
