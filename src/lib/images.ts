import { useEffect, useState } from "react"
import { Directory, Filesystem } from "@capacitor/filesystem"
import { decryptText, encryptText, looksEncrypted } from "./crypto"
import { makeId } from "./storage"

export const MAX_IMAGES_PER_NOTE = 8
const MAX_DIMENSION = 1600

const cache = new Map<string, string>()
let imageKey: CryptoKey | null = null

/** The data key when encryption is on; null means plaintext files. */
export function setImageKey(key: CryptoKey | null) {
  imageKey = key
  cache.clear()
}

export const imagePath = (id: string) => `images/${id}.jpg`
export const newImageId = () => makeId()

/** Downscale to a sane bound and re-encode as JPEG. Returns raw base64. */
export async function processImage(
  file: File,
): Promise<{ base64: string; width: number; height: number } | null> {
  const decoded = await decodeImage(file)
  if (!decoded) return null
  try {
    const { bitmap, width, height } = decoded
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(width, height),
    )
    const outWidth = Math.max(1, Math.round(width * scale))
    const outHeight = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = outWidth
    canvas.height = outHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, outWidth, outHeight)
    if ("close" in bitmap && typeof bitmap.close === "function") {
      ;(bitmap as ImageBitmap).close()
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.82),
    )
    if (!blob) return null
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error("unreadable"))
      reader.readAsDataURL(blob)
    })
    return {
      base64: dataUrl.split(",")[1] ?? "",
      width: outWidth,
      height: outHeight,
    }
  } catch {
    return null
  }
}

async function decodeImage(
  file: File,
): Promise<{ bitmap: CanvasImageSource; width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    })
    return { bitmap, width: bitmap.width, height: bitmap.height }
  } catch {
    // Some gallery/camera formats defeat createImageBitmap; retry via <img>.
    try {
      const url = URL.createObjectURL(file)
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const element = new Image()
          element.onload = () => resolve(element)
          element.onerror = () => reject(new Error("undecodable"))
          element.src = url
        })
        if (!img.naturalWidth || !img.naturalHeight) return null
        return { bitmap: img, width: img.naturalWidth, height: img.naturalHeight }
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch {
      return null
    }
  }
}

export async function saveImage(id: string, base64: string): Promise<void> {
  cache.delete(id)
  let stored = base64
  if (imageKey) {
    stored = btoa(await encryptText(imageKey, base64))
  }
  await Filesystem.writeFile({
    path: imagePath(id),
    data: stored,
    directory: Directory.Data,
    recursive: true,
  })
}

/** Plain JPEG base64 regardless of encryption (decrypts when needed). */
export async function readImageBase64(id: string): Promise<string | null> {
  try {
    const { data } = await Filesystem.readFile({
      path: imagePath(id),
      directory: Directory.Data,
    })
    if (typeof data !== "string") return null
    let envelope: string | null = null
    try {
      envelope = atob(data)
    } catch {
      envelope = null
    }
    if (envelope && looksEncrypted(envelope)) {
      if (!imageKey) return null
      return await decryptText(imageKey, envelope)
    }
    return data
  } catch {
    return null
  }
}

export async function readImageDataUrl(id: string): Promise<string | null> {
  const hit = cache.get(id)
  if (hit) return hit
  const jpeg = await readImageBase64(id)
  if (!jpeg) return null
  const url = `data:image/jpeg;base64,${jpeg}`
  cache.set(id, url)
  return url
}

export async function deleteImage(id: string): Promise<void> {
  cache.delete(id)
  try {
    await Filesystem.deleteFile({
      path: imagePath(id),
      directory: Directory.Data,
    })
  } catch {
    // Already gone; the record removal is what matters.
  }
}

export function useImageSrc(id: string): string | null {  const [src, setSrc] = useState<string | null>(() => cache.get(id) ?? null)
  useEffect(() => {
    let live = true
    if (!cache.has(id)) {
      readImageDataUrl(id).then((url) => {
        if (live) setSrc(url)
      })
    }
    return () => {
      live = false
    }
  }, [id])
  return src
}
