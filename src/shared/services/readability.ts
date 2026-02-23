import { Readability } from '@mozilla/readability'

type ReadableResult = {
  title: string
  byline: string | null
  excerpt: string | null
  content: string
}

export const extractReadable = (html: string, baseUrl?: string): ReadableResult | null => {
  if (!html) return null
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  if (baseUrl) {
    const base = doc.querySelector('base') || doc.createElement('base')
    base.setAttribute('href', baseUrl)
    if (!doc.head) {
      const head = doc.createElement('head')
      doc.documentElement.insertBefore(head, doc.body)
    }
    if (!base.parentElement) doc.head.prepend(base)
  }

  const reader = new Readability(doc)
  const article = reader.parse()
  if (!article || !article.content) return null

  return {
    title: article.title || '',
    byline: article.byline || null,
    excerpt: article.excerpt || null,
    content: article.content,
  }
}
