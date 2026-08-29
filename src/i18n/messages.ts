import type { SupportedLocale } from "./locale"

export interface Messages {
  comments: string
  live: string
  offline: string
  loading: string
  waitingSync: string
  noComments: string
  reply: string
  clickToRemove: string
  clickToAdd: string
  reactLabel: string
  addReaction: string
  prev: string
  next: string
  commentAriaLabel: string
  commentPlaceholder: string
  postAriaLabel: string
  postLabel: string
  endpointRequired: string
}

export const messages: Record<SupportedLocale, Messages> = {
  "zh-Hans": {
    comments: "评论",
    live: "实时",
    offline: "未连接",
    loading: "加载中...",
    waitingSync: "等待同步...",
    noComments: "还没有评论",
    reply: "回复",
    clickToRemove: "点击移除",
    clickToAdd: "点击添加",
    reactLabel: "回应:",
    addReaction: "添加",
    prev: "上一页",
    next: "下一页",
    commentAriaLabel: "评论",
    commentPlaceholder: "写下你的评论...",
    postAriaLabel: "发布评论",
    postLabel: "发布",
    endpointRequired: "endpoint, site-id and page-slug are required",
  },
  en: {
    comments: "Comments",
    live: "Live",
    offline: "Offline",
    loading: "Loading...",
    waitingSync: "Waiting for sync...",
    noComments: "No comments yet",
    reply: "reply",
    clickToRemove: "Click to remove",
    clickToAdd: "Click to add",
    reactLabel: "React:",
    addReaction: "Add ",
    prev: "Prev",
    next: "Next",
    commentAriaLabel: "Comment",
    commentPlaceholder: "Write a comment...",
    postAriaLabel: "Post comment",
    postLabel: "Post",
    endpointRequired: "endpoint, site-id and page-slug are required",
  },
}
