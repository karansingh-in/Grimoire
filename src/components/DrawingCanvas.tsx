import { useCallback, useEffect, useRef, useState } from "react"
import {
  Check,
  Eraser,
  Maximize,
  Minus,
  MoreHorizontal,
  PenLine,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react"
import { IconButton } from "./ui"
import { makeId } from "../lib/storage"
import type { Stroke, StrokePoint } from "../types"

const LIGHT_INKS = ["#1c1c1e", "#007aff", "#c20e2d", "#1a7a3c"]
const DARK_INKS = ["#f5f5f7", "#ffd60a", "#0a84ff", "#ff6961"]
const PEN_WIDTH = 0.006
const ERASER_WIDTH = 0.024
const MAX_POINTS = 600

function isDarkCanvas(): boolean {
  const theme = document.documentElement.dataset.theme
  if (theme === "dark") return true
  if (theme === "light") return false
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
}

function paintStroke(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stroke: Stroke,
) {
  if (stroke.points.length === 0 || stroke.eraser) return
  ctx.save()
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = Math.max(1.5, stroke.width * w)
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.beginPath()
  const [first, ...rest] = stroke.points
  ctx.moveTo(first.x * w, first.y * h)
  for (const point of rest) {
    ctx.lineTo(point.x * w, point.y * h)
  }
  ctx.stroke()
  ctx.restore()
}

export default function DrawingCanvas({
  strokes,
  docked,
  onMore,
  onChange,
}: {
  strokes: Stroke[]
  docked?: boolean
  onMore?: () => void
  onChange: (strokes: Stroke[]) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [ink, setInk] = useState<string | null>(null)
  const [eraser, setEraser] = useState(false)
  const [clearArmed, setClearArmed] = useState(false)
  const activeRef = useRef<Stroke | null>(null)
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 })
  const viewRef = useRef(view)
  viewRef.current = view
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{
    distance: number
    scale: number
    midX: number
    midY: number
    tx: number
    ty: number
  } | null>(null)

  const applyView = (next: { scale: number; tx: number; ty: number }) => {
    viewRef.current = next
    setView(next)
  }

  const zoomBy = (factor: number, centerX?: number, centerY?: number) => {
    const v = viewRef.current
    const scale = Math.min(4, Math.max(1, v.scale * factor))
    const px = centerX ?? box.w / 2
    const py = centerY ?? box.h / 2
    applyView({
      scale,
      tx: px - ((px - v.tx) * scale) / v.scale,
      ty: py - ((py - v.ty) * scale) / v.scale,
    })
  }
  const [palette] = useState(() => (isDarkCanvas() ? DARK_INKS : LIGHT_INKS))
  const activeInk = ink ?? palette[0]

  const replay = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || box.w === 0 || box.h === 0) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const v = viewRef.current
    ctx.save()
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.tx, dpr * v.ty)
    ctx.clearRect(
      -v.tx / v.scale,
      -v.ty / v.scale,
      box.w / v.scale,
      box.h / v.scale,
    )
    for (const stroke of strokes) {
      if (stroke.eraser) {
        // Eraser strokes cut through to the tinted note background.
        ctx.save()
        ctx.globalCompositeOperation = "destination-out"
        ctx.strokeStyle = "rgba(0,0,0,1)"
        ctx.lineWidth = Math.max(2, stroke.width * box.w)
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        ctx.beginPath()
        const [first, ...rest] = stroke.points
        if (first) {
          ctx.moveTo(first.x * box.w, first.y * box.h)
          for (const point of rest) {
            ctx.lineTo(point.x * box.w, point.y * box.h)
          }
          ctx.stroke()
        }
        ctx.restore()
      } else {
        paintStroke(ctx, box.w, box.h, stroke)
      }
    }
    const active = activeRef.current
    if (active) {
      if (active.eraser) {
        // preview handled on commit; skip live eraser preview
      } else {
        paintStroke(ctx, box.w, box.h, active)
      }
    }
    ctx.restore()
  }, [box, strokes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const v = viewRef.current
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
      const scale = Math.min(4, Math.max(1, v.scale * factor))
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const next = {
        scale,
        tx: px - ((px - v.tx) * scale) / v.scale,
        ty: py - ((py - v.ty) * scale) / v.scale,
      }
      viewRef.current = next
      setView(next)
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) {
        setBox({ w: Math.round(rect.width), h: Math.round(rect.height) })
      }
    })
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || box.w === 0 || box.h === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(box.w * dpr)
    canvas.height = Math.round(box.h * dpr)
    replay()
  }, [replay, box])

  useEffect(() => {
    setClearArmed(false)
  }, [strokes])

  const toPoint = (event: React.PointerEvent): StrokePoint | null => {
    const canvas = canvasRef.current
    if (!canvas || box.w === 0) return null
    const rect = canvas.getBoundingClientRect()
    const view = viewRef.current
    return {
      x: ((event.clientX - rect.left) / rect.width - view.tx / box.w) / view.scale,
      y: ((event.clientY - rect.top) / rect.height - view.ty / box.h) / view.scale,
    }
  }

  const begin = (event: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas || box.w === 0) return
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    const rect = canvas.getBoundingClientRect()
    pointers.current.set(event.pointerId, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      activeRef.current = null
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: viewRef.current.scale,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        tx: viewRef.current.tx,
        ty: viewRef.current.ty,
      }
      replay()
      return
    }
    if (pointers.current.size > 2) return
    const point = toPoint(event)
    if (!point) return
    activeRef.current = {
      id: makeId(),
      color: activeInk,
      width: eraser ? ERASER_WIDTH : PEN_WIDTH,
      eraser,
      points: [point],
    }
    replay()
  }

  const move = (event: React.PointerEvent) => {
    const tracked = pointers.current.get(event.pointerId)
    if (tracked) {
      const canvas = canvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        tracked.x = event.clientX - rect.left
        tracked.y = event.clientY - rect.top
      }
    }
    const gesture = pinch.current
    if (gesture && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      const scale = Math.min(4, Math.max(1, (gesture.scale * distance) / gesture.distance))
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      // Keep the content under the fingers: scale about the start midpoint,
      // then shift by how far the midpoint travelled.
      const anchored =
        (gesture.midX - gesture.tx) * (scale / gesture.scale) + gesture.tx
      const anchoredY =
        (gesture.midY - gesture.ty) * (scale / gesture.scale) + gesture.ty
      applyView({
        scale,
        tx: anchored + (midX - gesture.midX),
        ty: anchoredY + (midY - gesture.midY),
      })
      event.preventDefault()
      return
    }
    const active = activeRef.current
    if (!active) return
    const point = toPoint(event)
    if (!point) return
    event.preventDefault()
    if (active.points.length < MAX_POINTS) {
      active.points.push(point)
      replay()
    }
  }

  const end = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size >= 2) return
    pinch.current = null
    const active = activeRef.current
    activeRef.current = null
    if (active && active.points.length > 0) {
      onChange([...strokes, active])
    } else {
      replay()
    }
  }

  const undo = () => {
    if (!strokes.length) return
    onChange(strokes.slice(0, -1))
  }

  return (
    <div className="drawing-wrap">
      <div className="drawing-canvas-holder" ref={wrapRef}>
        <div className="zoom-cluster" role="toolbar" aria-label="Canvas zoom">
          <IconButton label="Zoom in" onClick={() => zoomBy(1.3)}>
            <Plus size={16} />
          </IconButton>
          <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.3)}>
            <Minus size={16} />
          </IconButton>
          <IconButton
            label="Reset zoom"
            disabled={view.scale === 1 && view.tx === 0 && view.ty === 0}
            onClick={() => applyView({ scale: 1, tx: 0, ty: 0 })}
          >
            <Maximize size={15} />
          </IconButton>
        </div>
        {box.w > 0 && box.h > 0 && (
          <canvas
            aria-label="Drawing canvas. Drag to draw."
            className="drawing-canvas"
            height={box.h}
            onPointerCancel={end}
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={end}
            ref={canvasRef}
            role="img"
            width={box.w}
          />
        )}
      </div>
      <div
        className={`drawing-tools${docked ? " drawing-tools--docked" : ""}`}
        role="toolbar"
        aria-label="Drawing tools"
      >
        <div className="ink-row">
          <button
            aria-label="Pen"
            aria-pressed={!eraser}
            className={`ink-dot ink-dot--tool ${!eraser ? "is-selected" : ""}`}
            onClick={() => setEraser(false)}
            type="button"
          >
            <PenLine size={15} />
          </button>
          {palette.map((color) => (
            <button
              aria-label={`Ink ${color}`}
              aria-pressed={!eraser && activeInk === color}
              className={`ink-dot ${
                !eraser && activeInk === color ? "is-selected" : ""
              }`}
              key={color}
              onClick={() => {
                setInk(color)
                setEraser(false)
              }}
              style={{ background: color }}
              type="button"
            >
              {!eraser && activeInk === color && <Check size={13} />}
            </button>
          ))}
          <button
            aria-label="Eraser"
            aria-pressed={eraser}
            className={`ink-dot ink-dot--tool ${eraser ? "is-selected" : ""}`}
            onClick={() => setEraser(true)}
            type="button"
          >
            <Eraser size={15} />
          </button>
        </div>
        <div className="drawing-actions">
          <IconButton
            disabled={strokes.length === 0}
            label="Undo last stroke"
            onClick={undo}
          >
            <Undo2 size={18} />
          </IconButton>
          <IconButton
            disabled={strokes.length === 0}
            label={clearArmed ? "Tap again to clear the drawing" : "Clear drawing"}
            onClick={() => {
              if (clearArmed) {
                onChange([])
                setClearArmed(false)
              } else {
                setClearArmed(true)
              }
            }}
          >
            <Trash2 size={18} />
          </IconButton>
          {onMore && (
            <IconButton label="More actions" onClick={onMore}>
              <MoreHorizontal size={18} />
            </IconButton>
          )}
        </div>
      </div>
      {clearArmed && strokes.length > 0 && (
        <p className="drawing-hint" role="status">
          Tap trash again to clear the whole drawing.
        </p>
      )}
    </div>
  )
}

export function DrawingThumb({ strokes }: { strokes: Stroke[] }) {  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || strokes.length === 0) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!width || !height) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr)
    for (const stroke of strokes) {
      if (stroke.points.length === 0) continue
      ctx.save()
      ctx.globalCompositeOperation = stroke.eraser
        ? "destination-out"
        : "source-over"
      ctx.strokeStyle = stroke.eraser ? "rgba(0,0,0,1)" : stroke.color
      ctx.lineWidth = Math.max(1, stroke.width * width)
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.beginPath()
      const [first, ...rest] = stroke.points
      ctx.moveTo(first.x * width, first.y * height)
      for (const point of rest) {
        ctx.lineTo(point.x * width, point.y * height)
      }
      ctx.stroke()
      ctx.restore()
    }
  }, [strokes])

  if (strokes.length === 0) return null
  return <canvas aria-hidden="true" className="drawing-thumb" ref={ref} />
}

/** Render strokes to a PNG data URL (for print/export), cropped to content. */
export function rasterizeStrokes(
  strokes: Stroke[],
  width: number,
): { url: string; aspect: number } | null {
  const live = strokes.filter((stroke) => stroke.points.length > 0)
  if (live.length === 0) return null
  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0
  for (const stroke of live) {
    for (const point of stroke.points) {
      if (point.x < minX) minX = point.x
      if (point.y < minY) minY = point.y
      if (point.x > maxX) maxX = point.x
      if (point.y > maxY) maxY = point.y
    }
  }
  const pad = 0.04
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(1, maxX + pad)
  maxY = Math.min(1, maxY + pad)
  const height = Math.max(
    1,
    Math.round((width * (maxY - minY)) / Math.max(0.001, maxX - minX)),
  )
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)
  const paint = (stroke: Stroke) => {
    ctx.save()
    ctx.globalCompositeOperation = stroke.eraser
      ? "destination-out"
      : "source-over"
    ctx.strokeStyle = stroke.eraser ? "rgba(0,0,0,1)" : stroke.color
    ctx.lineWidth = Math.max(1.5, stroke.width * width)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    const [first, ...rest] = stroke.points
    ctx.moveTo(
      ((first.x - minX) / (maxX - minX)) * width,
      ((first.y - minY) / (maxY - minY)) * height,
    )
    for (const point of rest) {
      ctx.lineTo(
        ((point.x - minX) / (maxX - minX)) * width,
        ((point.y - minY) / (maxY - minY)) * height,
      )
    }
    ctx.stroke()
    ctx.restore()
  }
  for (const stroke of live) paint(stroke)
  return { url: canvas.toDataURL("image/png"), aspect: height / width }
}
