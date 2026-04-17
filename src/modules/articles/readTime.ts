const HTML_TAG_RE = /<[^>]*>/g
const WHITESPACE_RE = /\s+/g
const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g
const LATIN_WORD_RE = /[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g

const stripHtml = (content: string) => content.replace(HTML_TAG_RE, ' ')

const normalizeText = (content: string) => {
  const base = stripHtml(content || '')
  return base.replace(WHITESPACE_RE, ' ').trim()
}

export const estimateReadMinutesFromContent = (content: string) => {
  const text = normalizeText(content)
  if (!text) return 1

  const cjkCount = (text.match(CJK_CHAR_RE) || []).length
  const latinWordCount = (text.match(LATIN_WORD_RE) || []).length

  const cjkMinutes = cjkCount / 300
  const latinMinutes = latinWordCount / 200
  const estimatedMinutes = cjkMinutes + latinMinutes

  return Math.max(1, Math.ceil(estimatedMinutes))
}

export const formatReadTimeMinutes = (minutes: number) => `${Math.max(1, Math.floor(minutes))} min`
