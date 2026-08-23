/** base64 이미지를 canvas로 리사이즈+JPEG 압축 (블로그 붙여넣기용 용량 절감) */
export function compressBase64Img(src, quality = 0.82, bgColor = '#ffffff', maxW = 400, maxH = 400) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1)
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(src) // 실패 시 원본 유지
    img.src = src
  })
}

/** clipboard API 우선, 실패 시 textarea+execCommand 폴백 */
export async function copyHtmlToClipboard(html) {
  try {
    await navigator.clipboard.writeText(html)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = html
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}
