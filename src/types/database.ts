export type Category = {
  id: string
  user_id: string
  name: string
}

export type NewsArticle = {
  id: string
  user_id: string
  category_id: string
  url: string
  headline: string
  article_date: string | null
  source: string
  short_summary: string
  full_summary: string
  read: boolean
  saved: boolean
  inserted_at: string
  updated_at: string
}

export type Source = {
  id: string
  user_id: string
  url: string
  use_rss: boolean
  category_id: string | null
  instruction: string
}

export type UserInstructions = {
  id: string
  user_id: string
  instruction: string
}

export type NewsArticleExclusion = {
  category_id: string
  url: string
  excluded_at: string
  why: string | null
}
