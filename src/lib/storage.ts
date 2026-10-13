import { readImageBase64 } from "./images"
import type {
  ChecklistItem,
  Label,
  Note,
  NoteColor,
  NoteKind,
  NoteStatus,
  PersistedState,
  StoredImage,
  Stroke,
} from "../types"

const STORAGE_KEY = "private-notes:v1"

export const makeId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`

const COLORS: NoteColor[] = [
  "neutral",
  "sand",
  "blush",
  "peach",
  "sage",
  "sky",
  "lavender",
]

const now = new Date().toISOString()

const labels: Label[] = [
  { id: "personal", name: "Personal", createdAt: now },
  { id: "ideas", name: "Ideas", createdAt: now },
  { id: "work", name: "Work", createdAt: now },
]

const seedNotes: Note[] = [
  {
    id: "welcome",
    kind: "text",
    title: "Welcome to Grimoire",
    body: "A calm space for thoughts that stay on this device. No account, no cloud, no tracking.",
    checklistItems: [],
    strokes: [],
    imageIds: [],
    reminderAt: null,
    labelIds: ["personal"],
    color: "sand",
    pinned: true,
    status: "active",
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
  },
  {
    id: "weekend",
    kind: "checklist",
    title: "Slow Saturday",
    body: "",
    checklistItems: [
      {
        id: "market",
        text: "Visit the farmers market",
        completed: true,
        order: 0,
      },
      { id: "book", text: "Pick up a new book", completed: false, order: 1 },
      { id: "pasta", text: "Make fresh pasta", completed: false, order: 2 },
    ],
    strokes: [],
    imageIds: [],
    reminderAt: null,
    labelIds: ["personal"],
    color: "sage",
    pinned: false,
    status: "active",
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
  },
  {
    id: "ideas-note",
    kind: "text",
    title: "Small ideas",
    body: "Keep fewer things, but make each one meaningful.\n\nDesign for calm, not attention.",
    checklistItems: [],
    strokes: [],
    imageIds: [],
    reminderAt: null,
    labelIds: ["ideas"],
    color: "lavender",
    pinned: false,
    status: "active",
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
  },
]

export const initialState = (): PersistedState => ({
  schemaVersion: 1,
  notes: seedNotes,
  labels,
  images: {},
  preferences: {
    theme: "system",
    layout: "grid",
    sort: "updated",
    hasSeededDemoContent: true,
    biometricLock: false,
    pinHash: null,
    pinSalt: "",
    encrypted: false,
  },
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

function normalizeItem(raw: unknown, fallbackOrder: number): ChecklistItem {
  const item = isRecord(raw) ? raw : {}
  return {
    id: typeof item.id === "string" && item.id ? item.id : makeId(),
    text: typeof item.text === "string" ? item.text : "",
    completed: item.completed === true,
    order:
      typeof item.order === "number" && Number.isFinite(item.order)
        ? item.order
        : fallbackOrder,
  }
}

function normalizeNote(raw: unknown): Note | null {
  if (!isRecord(raw)) return null
  const kind: NoteKind =
    raw.kind === "checklist" || raw.kind === "drawing" ? raw.kind : "text"
  const status: NoteStatus =
    raw.status === "archived" || raw.status === "trashed"
      ? raw.status
      : "active"
  const color: NoteColor = COLORS.includes(raw.color as NoteColor)
    ? raw.color as NoteColor
    : "neutral"
  const items = Array.isArray(raw.checklistItems)
    ? raw.checklistItems.map((item, index) => normalizeItem(item, index))
    : []
  const timestamp =
    typeof raw.updatedAt === "string" && raw.updatedAt
      ? raw.updatedAt
      : new Date().toISOString()
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : makeId(),
    kind,
    title: typeof raw.title === "string" ? raw.title : "",
    body: typeof raw.body === "string" ? raw.body : "",
    checklistItems: items,
    strokes: Array.isArray(raw.strokes)
      ? raw.strokes.filter(
          (stroke): stroke is Stroke =>
            isRecord(stroke) && Array.isArray(stroke.points),
        )
      : [],
    imageIds: Array.isArray(raw.imageIds)
      ? raw.imageIds.filter((id): id is string => typeof id === "string")
      : [],
    reminderAt:
      typeof raw.reminderAt === "string" && raw.reminderAt ? raw.reminderAt : null,
    labelIds: Array.isArray(raw.labelIds)
      ? raw.labelIds.filter((id): id is string => typeof id === "string")
      : [],
    color,
    pinned: raw.pinned === true,
    status,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt
        ? raw.createdAt
        : timestamp,
    updatedAt: timestamp,
    trashedAt:
      typeof raw.trashedAt === "string" || raw.trashedAt === null
        ? raw.trashedAt
        : null,
  }
}

function normalizeLabel(raw: unknown): Label | null {
  if (!isRecord(raw)) return null
  if (typeof raw.name !== "string" || !raw.name.trim()) return null
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : makeId(),
    name: raw.name,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt
        ? raw.createdAt
        : new Date().toISOString(),
  }
}

export type StoredPayload = {
  data: PersistedState
  corrupted: boolean
  raw: string | null
}

export function toPersistedState(parsed: unknown): PersistedState | null {
  if (!isRecord(parsed)) return null
  if (parsed.schemaVersion !== 1) return null
  if (!Array.isArray(parsed.notes) || !Array.isArray(parsed.labels)) return null
  if (!isRecord(parsed.preferences)) return null
  const notes = parsed.notes
    .map(normalizeNote)
    .filter((note): note is Note => note !== null)
  const labels = parsed.labels
    .map(normalizeLabel)
    .filter((label): label is Label => label !== null)
  const images: Record<string, StoredImage> = {}
  if (isRecord(parsed.images)) {
    for (const [id, record] of Object.entries(parsed.images)) {
      if (
        isRecord(record) &&
        typeof record.width === "number" &&
        typeof record.height === "number"
      ) {
        images[id] = { width: record.width, height: record.height }
      }
    }
  }
  const preferences = parsed.preferences
  const theme =
    preferences.theme === "light" || preferences.theme === "dark"
      ? preferences.theme
      : "system"
  const layout = preferences.layout === "list" ? "list" : "grid"
  const sort =
    preferences.sort === "created" || preferences.sort === "title"
      ? preferences.sort
      : "updated"
  return {
    schemaVersion: 1,
    notes,
    labels,
    images,
    preferences: {
      theme,
      layout,
      sort,
      hasSeededDemoContent: preferences.hasSeededDemoContent === true,
      biometricLock: preferences.biometricLock === true,
      pinHash:
        typeof preferences.pinHash === "string" && preferences.pinHash
          ? preferences.pinHash
          : null,
      pinSalt: typeof preferences.pinSalt === "string" ? preferences.pinSalt : "",
      encrypted: preferences.encrypted === true,
    },
  }
}

/** Load the stored payload without discarding malformed data. */
export function loadStored(): StoredPayload {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return { data: initialState(), corrupted: true, raw: null }
  }
  if (!raw) return { data: initialState(), corrupted: false, raw: null }
  try {
    const normalized = toPersistedState(JSON.parse(raw))
    if (!normalized) return { data: initialState(), corrupted: true, raw }
    return { data: normalized, corrupted: false, raw: null }
  } catch {
    return { data: initialState(), corrupted: true, raw }
  }
}

export function loadState(): PersistedState {
  return loadStored().data
}

export function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeRaw(raw: string) {
  try {
    localStorage.setItem(STORAGE_KEY, raw)
  } catch {
    // Storage may be unavailable (private mode, quota). The app keeps
    // working in memory; export remains available as a backup path.
  }
}

export function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage may be unavailable (private mode, quota). The app keeps
    // working in memory; export remains available as a backup path.
  }
}

export async function downloadBackup(
  state: PersistedState,
): Promise<number> {
  const imagesData: Record<string, string> = {}
  for (const id of Object.keys(state.images)) {
    const jpeg = await readImageBase64(id)
    if (jpeg) imagesData[id] = jpeg
  }
  const payload = JSON.stringify(
    { ...state, imagesData, exportedAt: new Date().toISOString() },
    null,
    2,
  )
  const blob = new Blob([payload], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `grimoire-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  return blob.size
}

export function downloadRaw(raw: string) {
  const blob = new Blob([raw], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `grimoire-recovery-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function parseBackup(text: string): {
  state: PersistedState
  imagesData: Record<string, string>
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("This file is not valid JSON.")
  }
  const normalized = toPersistedState(parsed)
  if (!normalized) {
    throw new Error("This file is not a valid Grimoire backup.")
  }
  const imagesData: Record<string, string> = {}
  if (isRecord(parsed) && isRecord(parsed.imagesData)) {
    for (const [id, data] of Object.entries(parsed.imagesData)) {
      if (typeof data === "string" && data.length > 0) imagesData[id] = data
    }
  }
  return { state: normalized, imagesData }
}
