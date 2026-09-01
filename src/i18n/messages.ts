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
  reactorUnknown: string
  andNOthers: string
  andOneOther: string
  reactionAddLabel: string
  reactionRemoveLabel: string
  edit: string
  save: string
  cancel: string
  delete: string
  confirmDelete: string
  deleting: string
  saving: string
  editAriaLabel: string
  deleteAriaLabel: string
  replyAriaLabel: string
  replyingTo: string
  cancelReply: string
  deletedComment: string
  unavailableReference: string
  editPlaceholder: string
  retry: string
  failedToSend: string
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
    reactorUnknown: "未知用户",
    andNOthers: "及其他 {n} 人",
    andOneOther: "及其他 1 人",
    reactionAddLabel: "添加回应",
    reactionRemoveLabel: "移除回应",
    edit: "编辑",
    save: "保存",
    cancel: "取消",
    delete: "删除",
    confirmDelete: "确认删除？",
    deleting: "删除中...",
    saving: "保存中...",
    editAriaLabel: "编辑评论",
    deleteAriaLabel: "删除评论",
    replyAriaLabel: "回复评论",
    replyingTo: "正在回复 {name}",
    cancelReply: "取消回复",
    deletedComment: "该评论已删除",
    unavailableReference: "原评论不可用",
    editPlaceholder: "编辑评论...",
    retry: "重试",
    failedToSend: "发送失败",
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
    reactorUnknown: "Unknown",
    andNOthers: "and {n} others",
    andOneOther: "and 1 other",
    reactionAddLabel: "add reaction",
    reactionRemoveLabel: "remove reaction",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    confirmDelete: "Confirm delete?",
    deleting: "Deleting...",
    saving: "Saving...",
    editAriaLabel: "Edit comment",
    deleteAriaLabel: "Delete comment",
    replyAriaLabel: "Reply to comment",
    replyingTo: "Replying to {name}",
    cancelReply: "Cancel reply",
    deletedComment: "This comment was deleted",
    unavailableReference: "Original comment unavailable",
    editPlaceholder: "Edit comment...",
    retry: "Retry",
    failedToSend: "Failed to send",
  },
}
