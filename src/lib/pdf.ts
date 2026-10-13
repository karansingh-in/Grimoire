import { jsPDF } from "jspdf"
import { Directory, Filesystem } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"
import { readImageBase64 } from "./images"
import { rasterizeStrokes } from "../components/DrawingCanvas"
import type { Note, StoredImage } from "../types"

const MARGIN = 48
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const USABLE = PAGE_WIDTH - MARGIN * 2

/** Build a real PDF file and open the system share sheet. Works anywhere. */
export async function shareNotePdf(
  note: Note,
  images: Record<string, StoredImage>,
): Promise<boolean> {
  try {
    const doc = new jsPDF({ unit: "pt", format: "a4" })
    let y = MARGIN
    const need = (height: number) => {
      if (y + height > PAGE_HEIGHT - MARGIN) {
        doc.addPage()
        y = MARGIN
      }
    }

    doc.setFont("helvetica", "bold")
    doc.setFontSize(20)
    doc.setTextColor(20, 20, 20)
    const titleLines = doc.splitTextToSize(
      note.title || "Untitled note",
      USABLE,
    )
    need(titleLines.length * 24 + 6)
    doc.text(titleLines, MARGIN, y)
    y += titleLines.length * 24

    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(110, 110, 110)
    doc.text(
      `Grimoire · ${new Date(note.updatedAt).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" })}`,
      MARGIN,
      y,
    )
    y += 24

    doc.setFontSize(12)
    doc.setTextColor(20, 20, 20)
    if (note.kind === "text" && note.body) {
      for (const paragraph of note.body.split("\n")) {
        const lines = doc.splitTextToSize(paragraph || " ", USABLE)
        for (const line of lines) {
          need(18)
          doc.text(line, MARGIN, y)
          y += 17
        }
        y += 4
      }
    }

    if (note.kind === "checklist") {
      for (const item of note.checklistItems) {
        const lines = doc.splitTextToSize(item.text || "List item", USABLE - 22)
        need(lines.length * 17 + 6)
        doc.rect(MARGIN, y - 10, 10, 10)
        if (item.completed) {
          doc.setFillColor(20, 20, 20)
          doc.rect(MARGIN, y - 10, 10, 10, "F")
        }
        doc.text(lines, MARGIN + 20, y)
        y += lines.length * 17 + 4
      }
    }

    if (note.kind === "drawing" && note.strokes.length > 0) {
      const raster = rasterizeStrokes(note.strokes, 900)
      if (raster) {
        const height = USABLE * raster.aspect
        need(height)
        doc.addImage(raster.url, "PNG", MARGIN, y, USABLE, height)
        y += height + 12
      }
    }

    for (const id of note.imageIds) {
      const jpeg = await readImageBase64(id)
      const meta = images[id]
      if (!jpeg || !meta) continue
      let width = USABLE
      let height = (USABLE * meta.height) / meta.width
      const maxHeight = PAGE_HEIGHT - MARGIN * 2
      if (height > maxHeight) {
        height = maxHeight
        width = (maxHeight * meta.width) / meta.height
      }
      need(height)
      doc.addImage(`data:image/jpeg;base64,${jpeg}`, "JPEG", MARGIN, y, width, height)
      y += height + 12
    }

    const base64 = doc.output("datauristring").split(",")[1] ?? ""
    if (!base64) return false
    const name = `grimoire-note-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}.pdf`
    await Filesystem.writeFile({
      path: `exports/${name}`,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    })
    const { uri } = await Filesystem.getUri({
      path: `exports/${name}`,
      directory: Directory.Cache,
    })
    await Share.share({
      title: note.title || "Grimoire note",
      dialogTitle: "Share note as PDF",
      files: [uri],
    })
    return true
  } catch {
    return false
  }
}
