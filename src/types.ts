export type NoteColor = "neutral" | "sand" | "blush" | "peach" | "sage" | "sky" | "lavender"

export type NoteStatus = "active" | "archived" | "trashed"
export type NoteKind = "text" | "checklist" | "drawing"

export type StrokePoint = { x: number; y: number }

export type Stroke = {
  id: string
  color: string
  width: number
  eraser: boolean
  points: StrokePoint[]
}
export type AppView =
  | "notes"
  | "archive"
  | "labels"
  | "trash"
  | "contact"
  | "reminders"
  | "settings"

export type ChecklistItem = {
  id: string
  text: string
  completed: boolean
  order: number
}

export type StoredImage = {
  width: number
  height: number
}

export type Note = {
  id: string
  kind: NoteKind
  title: string
  body: string
  checklistItems: ChecklistItem[]
  strokes: Stroke[]
  imageIds: string[]
  reminderAt: string | null
  labelIds: string[]
  color: NoteColor
  pinned: boolean
  status: NoteStatus
  createdAt: string
  updatedAt: string
  trashedAt: string | null
}

export type Label = {
  id: string
  name: string
  createdAt: string
}

export type Preferences = {
  theme: "system" | "light" | "dark"
  layout: "grid" | "list"
  sort: "updated" | "created" | "title"
  hasSeededDemoContent: boolean
  biometricLock: boolean
  pinHash: string | null
  pinSalt: string
  encrypted: boolean
}

export type BioStatus = {
  available: boolean
  deviceSecure: boolean
  label: string
}

export type PersistedState = {
  schemaVersion: 1
  notes: Note[]
  labels: Label[]
  images: Record<string, StoredImage>
  preferences: Preferences
}
