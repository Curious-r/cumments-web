export type MediaKind = "image" | "video" | "audio" | "file"

export function mimeToMediaKind(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  return "file"
}
