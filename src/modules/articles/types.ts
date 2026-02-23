export type ArticleRecord = {
  id: number
  externalId: string
  feedId: number
  feedName: string
  title: string
  summary: string
  date: string
  publishedAt?: string
  author: string
  image?: string
  content: string
  link?: string
  isRead: boolean
  isStarred: boolean
  readTime: string
}
