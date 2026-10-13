import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  AtSign,
  Bell,
  Brush,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Delete,
  FileDown,
  FileUp,
  Fingerprint,
  Globe,
  Hash,
  House,
  ImagePlus,
  Info,
  Lightbulb,
  ListChecks,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  Palette,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  SquarePen,
  Tag,
  Trash2,
  Undo2,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react"
import {
  Button,
  Divider,
  IconButton,
  Switch,
  TextArea,
  TextInput,
  Title,
} from "./components/ui"
import DrawingCanvas, { DrawingThumb } from "./components/DrawingCanvas"
import { shareNotePdf } from "./lib/pdf"
import {
  MAX_IMAGES_PER_NOTE,
  deleteImage,
  newImageId,
  processImage,
  readImageBase64,
  saveImage,
  setImageKey,
  useImageSrc,
} from "./lib/images"
import Alarm from "./lib/alarm-plugin"
import {
  mirrorReminders,
  resyncAlarms,
  takePendingNote,
} from "./lib/alarm"
import {
  decryptText,
  dropKey,
  encryptText,
  ensureKey,
  loadKey,
  looksEncrypted,
} from "./lib/crypto"
import {
  downloadBackup,
  downloadRaw,
  initialState,
  loadStored,
  makeId,
  parseBackup,
  readRaw,
  saveState,
  toPersistedState,
  writeRaw,
} from "./lib/storage"
import type {
  AppView,
  BioStatus,
  ChecklistItem,
  Note,
  NoteColor,
  NoteKind,
  PersistedState,
  StoredImage,
} from "./types"
import { App as CapApp } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import { Haptics, ImpactStyle } from "@capacitor/haptics"
import {
  BiometricAuth,
  BiometryErrorType,
  BiometryType,
} from "@aparajita/capacitor-biometric-auth"

const COLORS: NoteColor[] = [
  "neutral",
  "sand",
  "blush",
  "peach",
  "sage",
  "sky",
  "lavender",
]

const colorNames: Record<NoteColor, string> = {
  neutral: "Paper",
  sand: "Yellow",
  blush: "Coral",
  peach: "Peach",
  sage: "Green",
  sky: "Blue",
  lavender: "Purple",
}

type ToastState = {
  message: string
  actionLabel?: string
  onAction?: () => void
}

type ConfirmState = {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

function bioLabel(type: BiometryType): string {
  switch (type) {
    case BiometryType.fingerprintAuthentication:
      return "Fingerprint"
    case BiometryType.faceAuthentication:
      return "Face unlock"
    case BiometryType.irisAuthentication:
      return "Iris unlock"
    case BiometryType.touchId:
      return "Touch ID"
    case BiometryType.faceId:
      return "Face ID"
    default:
      return "Biometrics"
  }
}

async function checkBioStatus(): Promise<BioStatus> {
  try {
    const result = await BiometricAuth.checkBiometry()
    return {
      available: result.isAvailable,
      deviceSecure: result.deviceIsSecure,
      label: bioLabel(result.biometryType),
    }
  } catch {
    return { available: false, deviceSecure: false, label: "Biometrics" }
  }
}

function friendlyBioError(code: unknown): string {  switch (code) {
    case BiometryErrorType.biometryLockout:
      return "Too many attempts. Try again later or use your device passcode."
    case BiometryErrorType.biometryNotEnrolled:
      return "No biometrics enrolled on this device."
    case BiometryErrorType.biometryNotAvailable:
      return "Biometric authentication isn’t available."
    case BiometryErrorType.passcodeNotSet:
    case BiometryErrorType.noDeviceCredential:
      return "Set a device passcode, PIN, or pattern first."
    case BiometryErrorType.authenticationFailed:
      return "Not recognized. Try again."
    default:
      return ""
  }
}

async function buzz(style: ImpactStyle = ImpactStyle.Light): Promise<void> {
  try {
    await Haptics.impact({ style })
  } catch {
    // Haptics unavailable (web preview); touch feedback is a nicety.
  }
}

function makeSalt(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto?.getRandomValues?.(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function hashPin(salt: string, pin: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${pin}`),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/** Focus the dialog's close control on open, close on Escape, trap Tab
 *  focus inside, and return focus to the trigger on close. */
function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const container = containerRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    const closeControl = container?.querySelector<HTMLButtonElement>(
      "button[data-autofocus]",
    )
    closeControl?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab" || !container) return
      const focusables = container.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      )
      const visible = [...focusables].filter(
        (element) => !element.hasAttribute("disabled"),
      )
      if (!visible.length) return
      const first = visible[0]
      const last = visible[visible.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      previouslyFocused?.focus?.()
    }
  }, [containerRef])
}

function createNote(kind: NoteKind): Note {
  const timestamp = new Date().toISOString()
  return {
    id: makeId(),
    kind,
    title: "",
    body: "",
    checklistItems:
      kind === "checklist"
        ? [{ id: makeId(), text: "", completed: false, order: 0 }]
        : [],
    strokes: [],
    imageIds: [],
    reminderAt: null,
    labelIds: [],
    color: "neutral",
    pinned: false,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    trashedAt: null,
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function editorStats(note: Note): string {
  if (note.kind === "drawing") {
    const count = note.strokes.length
    return count === 0 ? "No strokes yet" : `${count} ${count === 1 ? "stroke" : "strokes"}`
  }
  if (note.kind === "checklist") {
    const done = note.checklistItems.filter((item) => item.completed).length
    return `${done}/${note.checklistItems.length} done`
  }
  const words = countWords(`${note.title} ${note.body}`)
  return words === 0
    ? "No words yet"
    : `${words} ${words === 1 ? "word" : "words"}`
}

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim()
  if (!needle) return <>{text}</>
  const index = text.toLowerCase().indexOf(needle.toLowerCase())
  if (index === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="search-mark">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  )
}

export default function App() {
  const [boot, setBoot] = useState<"loading" | "ready" | "key-locked">(
    "loading",
  )
  const [lockedRaw, setLockedRaw] = useState<string | null>(null)
  const [data, setData] = useState<PersistedState>(initialState)
  const [storageIssue, setStorageIssue] = useState<string | null>(null)
  const [view, setView] = useState<AppView>("notes")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [reminderOnCreate, setReminderOnCreate] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [cardMenuNote, setCardMenuNote] = useState<Note | null>(null)
  const [pendingImport, setPendingImport] = useState<{
    state: PersistedState
    imagesData: Record<string, string>
  } | null>(null)
  const [bio, setBio] = useState<BioStatus | null>(null)
  const [locked, setLocked] = useState(false)
  const [lockError, setLockError] = useState("")
  const [pinSheet, setPinSheet] = useState<"setup" | "manage" | null>(null)
  const [labelDraft, setLabelDraft] = useState("")
  const importRef = useRef<HTMLInputElement>(null)
  const snapshotRef = useRef<PersistedState | null>(null)
  const prefsRef = useRef(data.preferences)
  prefsRef.current = data.preferences
  const dataRef = useRef(data)
  dataRef.current = data
  const keyRef = useRef<CryptoKey | null>(null)
  const saveKeyWarning = useRef(false)
  const overlayRef = useRef({
    confirm: false,
    pendingImport: false,
    cardMenu: false,
    settings: false,
    menu: false,
    compose: false,
    editing: false,
  })
  overlayRef.current = {
    confirm: confirm !== null,
    pendingImport: pendingImport !== null,
    cardMenu: cardMenuNote !== null,
    settings: settingsOpen,
    menu: menuOpen,
    compose: composeOpen,
    editing: editingId !== null,
  }
  const leaveEditorRef = useRef(() => {})

  useEffect(() => {
    checkBioStatus().then(setBio)
  }, [])

  useEffect(() => {
    let appHandle: { remove: () => void } | null = null
    let backHandle: { remove: () => void } | null = null
    CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive && prefsRef.current.biometricLock) setLocked(true)
      if (isActive) openPendingRef.current()
    })
      .then((listener) => {
        appHandle = listener
      })
      .catch(() => {
        // Web preview: the App plugin has no native bridge.
      })
    CapApp.addListener("backButton", () => {
      const overlay = overlayRef.current
      if (overlay.confirm) setConfirm(null)
      else if (overlay.pendingImport) setPendingImport(null)
      else if (overlay.cardMenu) setCardMenuNote(null)
      else if (overlay.settings) setSettingsOpen(false)
      else if (overlay.menu) setMenuOpen(false)
      else if (overlay.compose) setComposeOpen(false)
      else if (overlay.editing) leaveEditorRef.current()
      else void CapApp.exitApp().catch(() => {})
    })
      .then((listener) => {
        backHandle = listener
      })
      .catch(() => {
        // Web preview: no hardware back button.
      })
    return () => {
      appHandle?.remove()
      backHandle?.remove()
    }
  }, [])

  const persist = useCallback(
    (state: PersistedState) => {
      if (state.preferences.encrypted) {
        const key = keyRef.current
        if (!key) {
          if (!saveKeyWarning.current) {
            saveKeyWarning.current = true
            setToast({
              message: "Encryption key unavailable — changes kept in memory",
            })
          }
          return
        }
        saveKeyWarning.current = false
        const snapshot = JSON.stringify(state)
        void encryptText(key, snapshot)
          .then(writeRaw)
          .catch(() =>
            setToast({ message: "Couldn’t save — storage may be full" }),
          )
      } else {
        saveState(state)
      }
    },
    [],
  )

  useEffect(() => {
    let live = true
    void (async () => {
      const raw = readRaw()
      if (!looksEncrypted(raw)) {
        const stored = loadStored()
        keyRef.current = null
        setImageKey(null)
        if (!live) return
        setData(stored.data)
        setLocked(stored.data.preferences.biometricLock)
        setStorageIssue(stored.corrupted ? stored.raw : "__EMPTY__")
        setBoot("ready")
        return
      }
      const key = await loadKey()
      if (!key) {
        if (live) {
          setLockedRaw(raw)
          setBoot("key-locked")
        }
        return
      }
      try {
        const normalized = toPersistedState(
          JSON.parse(await decryptText(key, raw as string)),
        )
        if (!normalized) throw new Error("unreadable")
        keyRef.current = key
        setImageKey(key)
        if (!live) return
        setData(normalized)
        setLocked(normalized.preferences.biometricLock)
        setStorageIssue(null)
        setBoot("ready")
      } catch {
        if (live) {
          setLockedRaw(raw)
          setBoot("key-locked")
        }
      }
    })()
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (boot !== "ready") return
    const timer = window.setTimeout(() => persist(data), 180)
    return () => window.clearTimeout(timer)
  }, [data, boot, persist])

  useEffect(() => {
    const onHide = () => {
      if (boot !== "ready") return
      persist(dataRef.current)
    }
    document.addEventListener("visibilitychange", onHide)
    return () => document.removeEventListener("visibilitychange", onHide)
  }, [boot, persist])

  useEffect(() => {
    document.documentElement.dataset.theme = data.preferences.theme
  }, [data.preferences.theme])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(
      () => setToast(null),
      toast.onAction ? 5000 : 2400,
    )
    return () => window.clearTimeout(timer)
  }, [toast])

  const editingNote = data.notes.find((note) => note.id === editingId) ?? null

  const visibleNotes = useMemo(() => {
    const status =
      view === "archive" ? "archived" : view === "trash" ? "trashed" : "active"
    const needle = search.trim().toLowerCase()
    const sortMode = data.preferences.sort
    return data.notes
      .filter((note) => note.status === status)
      .filter((note) => !activeLabel || note.labelIds.includes(activeLabel))
      .filter((note) => {
        if (!needle) return true
        const labels = data.labels
          .filter((label) => note.labelIds.includes(label.id))
          .map((label) => label.name)
          .join(" ")
        return [note.title, note.body, labels]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => {
        const pinOrder = Number(b.pinned) - Number(a.pinned)
        if (pinOrder !== 0) return pinOrder
        if (sortMode === "created") {
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        }
        if (sortMode === "title") {
          return (
            (a.title || "Untitled note").localeCompare(
              b.title || "Untitled note",
            ) ||
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
        }
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      })
  }, [
    activeLabel,
    data.labels,
    data.notes,
    data.preferences.sort,
    search,
    view,
  ])

  const counts = useMemo(() => {
    const of = (status: Note["status"]) =>
      data.notes.filter((note) => note.status === status).length
    return { active: of("active"), archived: of("archived"), trashed: of("trashed") }
  }, [data.notes])

  const reminderNotes = useMemo(
    () =>
      data.notes
        .filter((note) => note.status === "active" && note.reminderAt)
        .sort(
          (a, b) =>
            new Date(a.reminderAt as string).getTime() -
            new Date(b.reminderAt as string).getTime(),
        ),
    [data.notes],
  )

  const updateNote = (id: string, patch: Partial<Note>) => {
    setData((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === id
          ? { ...note, ...patch, updatedAt: new Date().toISOString() }
          : note,
      ),
    }))
  }

  const openPendingNote = useCallback(() => {
    void takePendingNote().then((id) => {
      if (!id) return
      const note = dataRef.current.notes.find(
        (candidate) => candidate.id === id && candidate.status === "active",
      )
      if (note) {
        setActiveLabel(null)
        setSearch("")
        setView("notes")
        setEditingId(id)
      }
    })
  }, [])
  const openPendingRef = useRef(() => {})
  openPendingRef.current = openPendingNote

  const [alarmHealth, setAlarmHealth] = useState<{
    bridge: boolean
    exact: boolean
    notifications: boolean
  } | null>(null)

  const checkAlarmHealth = useCallback(async () => {
    try {
      await Alarm.ping()
      const status = await Alarm.status()
      setAlarmHealth({ bridge: true, ...status })
    } catch {
      setAlarmHealth({ bridge: false, exact: false, notifications: false })
    }
  }, [])

  const testAlarm = () => {
    void Alarm.schedule({
      id: "grimoire-test",
      at: Date.now() + 10000,
      title: "Test alarm",
    })
      .then(() => setToast({ message: "Test alarm rings in 10 seconds" }))
      .catch(() => setToast({ message: "Alarm service didn’t respond" }))
  }

  const saveReminder = (noteId: string, iso: string | null) => {
    const next: PersistedState = {
      ...dataRef.current,
      notes: dataRef.current.notes.map((note) =>
        note.id === noteId
          ? {
              ...note,
              reminderAt: iso,
              updatedAt: new Date().toISOString(),
            }
          : note,
      ),
    }
    setData(next)
    void resyncAlarms(next)
    setToast({
      message: iso ? "Reminder set" : "Reminder removed",
    })
  }

  useEffect(() => {
    if (boot !== "ready") return
    openPendingNote()
  }, [data, boot, openPendingNote])

  useEffect(() => {
    if (boot !== "ready") return
    const timer = window.setTimeout(() => {
      void resyncAlarms(data)
      void mirrorReminders(data)
      void checkAlarmHealth()
    }, 500)
    return () => window.clearTimeout(timer)
  }, [data, boot, checkAlarmHealth])

  const showUndoToast = (message: string) => {
    const snapshot = snapshotRef.current
    if (!snapshot) {
      setToast({ message })
      return
    }
    setToast({
      message,
      actionLabel: "Undo",
      onAction: () => {
        setData(snapshot)
        snapshotRef.current = null
      },
    })
  }

  const addNote = (kind: NoteKind, opts?: { reminder?: boolean }) => {
    void buzz(ImpactStyle.Medium)
    const note = createNote(kind)
    setData((current) => ({ ...current, notes: [note, ...current.notes] }))
    setEditingId(note.id)
    setComposeOpen(false)
    setReminderOnCreate(opts?.reminder === true)
  }

  const leaveEditor = () => {
    if (
      editingNote &&
      !editingNote.title.trim() &&
      !editingNote.body.trim() &&
      !editingNote.checklistItems.some((item) => item.text.trim()) &&
      editingNote.strokes.length === 0
    ) {
      setData((current) => ({
        ...current,
        notes: current.notes.filter((note) => note.id !== editingNote.id),
      }))
    }
    setEditingId(null)
    setReminderOnCreate(false)
  }
  leaveEditorRef.current = leaveEditor

  const moveNote = (note: Note, status: Note["status"]) => {
    void buzz(status === "trashed" ? ImpactStyle.Medium : ImpactStyle.Light)
    snapshotRef.current = data
    setData((current) => ({
      ...current,
      notes: current.notes.map((candidate) =>
        candidate.id === note.id
          ? {
              ...candidate,
              status,
              trashedAt:
                status === "trashed" ? new Date().toISOString() : null,
              updatedAt: new Date().toISOString(),
            }
          : candidate,
      ),
    }))
    showUndoToast(
      status === "trashed"
        ? "Moved to Trash"
        : status === "archived"
          ? "Archived"
          : "Restored to Notes",
    )
    setCardMenuNote(null)
    if (editingId === note.id) setEditingId(null)
  }

  const togglePin = (note: Note) => {
    if (note.status === "trashed") return
    void buzz()
    snapshotRef.current = data
    updateNote(note.id, { pinned: !note.pinned })
    window.setTimeout(
      () => showUndoToast(note.pinned ? "Unpinned" : "Pinned"),
      0,
    )
    setCardMenuNote(null)
  }

  const deleteForever = (id: string) => {
    const note = data.notes.find((candidate) => candidate.id === id)
    setConfirm({
      title: "Delete forever?",
      message: `“${note?.title || "Untitled note"}” will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: () => {
        setData((current) => ({
          ...current,
          notes: current.notes.filter((candidate) => candidate.id !== id),
        }))
        setCardMenuNote(null)
        setEditingId(null)
        void buzz(ImpactStyle.Medium)
        setToast({ message: "Note deleted permanently" })
      },
    })
  }

  const duplicateNote = (note: Note) => {
    snapshotRef.current = data
    const timestamp = new Date().toISOString()
    const copy: Note = {
      ...note,
      id: makeId(),
      title: note.title ? `${note.title} (copy)` : "",
      checklistItems: note.checklistItems.map((item) => ({
        ...item,
        id: makeId(),
      })),
      strokes: note.strokes.map((stroke) => ({
        ...stroke,
        id: makeId(),
        points: stroke.points.map((point) => ({ ...point })),
      })),
      imageIds: [...note.imageIds],
      reminderAt: null,
      pinned: false,
      status: "active",
      trashedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    setData((current) => ({ ...current, notes: [copy, ...current.notes] }))
    showUndoToast("Note duplicated")
    setCardMenuNote(null)
  }

  const emptyTrash = () => {
    if (!counts.trashed) return
    setConfirm({
      title: "Empty Trash?",
      message: `${counts.trashed} ${counts.trashed === 1 ? "note" : "notes"} will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Empty Trash",
      danger: true,
      onConfirm: () => {
        setData((current) => ({
          ...current,
          notes: current.notes.filter((note) => note.status !== "trashed"),
        }))
        void buzz(ImpactStyle.Medium)
        setToast({ message: "Trash emptied" })
      },
    })
  }

  const changeView = (next: AppView) => {
    void buzz()
    setView(next)
    setActiveLabel(null)
    setSearch("")
    setMenuOpen(false)
  }

  const focusSearch = () => {
    if (view === "labels") setView("notes")
    window.setTimeout(
      () => document.getElementById("note-search")?.focus(),
      60,
    )
  }

  const createLabel = () => {
    const name = labelDraft.trim()
    if (!name) return
    if (
      data.labels.some(
        (label) => label.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setToast({ message: "That label already exists" })
      return
    }
    setData((current) => ({
      ...current,
      labels: [
        ...current.labels,
        { id: makeId(), name, createdAt: new Date().toISOString() },
      ],
    }))
    setLabelDraft("")
    setToast({ message: `Label “${name}” created` })
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setPendingImport(parseBackup(await file.text()))
    } catch (error) {
      setToast({
        message:
          error instanceof Error ? error.message : "Could not import backup.",
      })
    }
    event.target.value = ""
  }

  const applyImportReplace = () => {
    if (!pendingImport) return
    const { state: imported, imagesData } = pendingImport
    setConfirm({
      title: "Replace all notes?",
      message:
        "Your current notes and labels will be replaced by this backup. Export a backup first if you want to keep them.",
      confirmLabel: "Replace",
      danger: true,
      onConfirm: () => {
        void (async () => {
          // Imported data always lands unencrypted: keys don’t transfer
          // between contexts, so encryption stays off until re-enabled.
          keyRef.current = null
          setImageKey(null)
          await dropKey()
          for (const [id, data] of Object.entries(imagesData)) {
            try {
              await saveImage(id, data)
            } catch {
              // A single bad image never blocks the restore.
            }
          }
          setData({ ...imported, preferences: { ...imported.preferences, encrypted: false } })
          setPendingImport(null)
          setToast({ message: "Backup imported — encryption is off" })
        })()
      },
    })
  }

  const addImages = async (noteId: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    const note = data.notes.find((candidate) => candidate.id === noteId)
    if (!note) return
    const room = MAX_IMAGES_PER_NOTE - note.imageIds.length
    if (room <= 0) {
      setToast({ message: `Up to ${MAX_IMAGES_PER_NOTE} photos per note` })
      return
    }
    const picked = [...files].slice(0, room)
    if (files.length > room) {
      setToast({ message: `Kept ${room} of ${files.length} photos` })
    }
    const added: string[] = []
    const records: Record<string, StoredImage> = {}
    let unreadable = 0
    let unsavable = 0
    for (const file of picked) {
      const processed = await processImage(file)
      if (!processed) {
        unreadable += 1
        continue
      }
      const id = newImageId()
      try {
        await saveImage(id, processed.base64)
      } catch {
        unsavable += 1
        continue
      }
      added.push(id)
      records[id] = { width: processed.width, height: processed.height }
    }
    if (added.length === 0) {
      setToast({
        message:
          unsavable > 0 && unreadable === 0
            ? "Couldn’t save to this device — storage may be full"
            : "Those photos couldn’t be read — try a JPEG or PNG",
      })
      return
    }
    setData((current) => ({
      ...current,
      images: { ...current.images, ...records },
      notes: current.notes.map((candidate) =>
        candidate.id === noteId
          ? {
              ...candidate,
              imageIds: [...candidate.imageIds, ...added],
              updatedAt: new Date().toISOString(),
            }
          : candidate,
      ),
    }))
    setToast({ message: added.length === 1 ? "Photo added" : `${added.length} photos added` })
  }

  const removeImage = (noteId: string, imageId: string) => {
    setData((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === noteId
          ? {
              ...note,
              imageIds: note.imageIds.filter((id) => id !== imageId),
              updatedAt: new Date().toISOString(),
            }
          : note,
      ),
    }))
    void deleteImage(imageId)
  }

  const unlock = async () => {
    setLockError("")
    try {
      await BiometricAuth.authenticate({
        reason: "Unlock Grimoire",
        androidTitle: "Unlock Grimoire",
        androidSubtitle: "Confirm it’s you to see your notes",
        allowDeviceCredential: true,
      })
      setLocked(false)
      void buzz(ImpactStyle.Medium)
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? (error as { code: unknown }).code
          : ""
      if (
        code === BiometryErrorType.userCancel ||
        code === BiometryErrorType.appCancel ||
        code === BiometryErrorType.systemCancel
      ) {
        return
      }
      setLockError(friendlyBioError(code) || "Couldn’t unlock. Try again.")
    }
  }

  const setBioLock = async (enabled: boolean) => {
    const status = bio ?? (await checkBioStatus())
    setBio(status)
    if (enabled && !status.available && !status.deviceSecure) {
      setToast({
        message: "No biometrics or device passcode found on this device",
      })
      return
    }
    try {
      await BiometricAuth.authenticate({
        reason: enabled
          ? "Confirm it’s you to turn on app lock"
          : "Confirm it’s you to turn off app lock",
        androidTitle: enabled ? "Turn on app lock" : "Turn off app lock",
        allowDeviceCredential: true,
      })
    } catch {
      setToast({ message: "Not verified — lock setting unchanged" })
      return
    }
    setData((current) => ({
      ...current,
      preferences: { ...current.preferences, biometricLock: enabled },
    }))
    setToast({
      message: enabled
        ? `${status.label} lock turned on`
        : "App lock turned off",
    })
  }

  const eraseFromLockScreen = () => {
    setConfirm({
      title: "Erase everything?",
      message:
        "All notes, labels, and settings on this device will be permanently deleted and the app lock turned off.",
      confirmLabel: "Erase all",
      danger: true,
      onConfirm: () => {
        void dropKey()
        keyRef.current = null
        setImageKey(null)
        setData(initialState())
        setLocked(false)
        setLockError("")
      },
    })
  }

  const checkPin = async (pin: string): Promise<boolean> => {
    const { pinHash, pinSalt } = data.preferences
    if (!pinHash) return false
    try {
      return (await hashPin(pinSalt, pin)) === pinHash
    } catch {
      return false
    }
  }

  const verifyBiometric = async (): Promise<boolean> => {
    try {
      await BiometricAuth.authenticate({
        reason: "Confirm it’s you",
        androidTitle: "Confirm it’s you",
        allowDeviceCredential: true,
      })
      return true
    } catch {
      return false
    }
  }

  const requestEncryptedChange = (enabled: boolean) => {
    const usable = bio !== null && (bio.available || bio.deviceSecure)
    if (!usable) {
      setConfirm({
        title: enabled ? "Turn on encryption?" : "Turn off encryption?",
        message: enabled
          ? "Notes and photos will be stored encrypted with a key kept in this device’s keystore. Keep an exported backup — without this device, encrypted data cannot be recovered."
          : "Notes and photos will be stored as readable text on this device.",
        confirmLabel: enabled ? "Turn on" : "Turn off",
        onConfirm: () => void applyEncrypted(enabled),
      })
      return
    }
    void (async () => {
      const ok = await verifyBiometric()
      if (!ok) {
        setToast({ message: "Not verified — encryption unchanged" })
        return
      }
      await applyEncrypted(enabled)
    })()
  }

  const applyEncrypted = async (enabled: boolean) => {
    if (enabled) {
      let key: CryptoKey
      try {
        key = await ensureKey()
      } catch {
        setToast({ message: "Couldn’t reach the device keystore" })
        return
      }
      // Re-encrypt existing photo files under the new key.
      const raws: Record<string, string> = {}
      for (const id of Object.keys(data.images)) {
        const jpeg = await readImageBase64(id)
        if (jpeg) raws[id] = jpeg
      }
      keyRef.current = key
      setImageKey(key)
      let failed = 0
      for (const [id, jpeg] of Object.entries(raws)) {
        try {
          await saveImage(id, jpeg)
        } catch {
          failed += 1
        }
      }
      const next: PersistedState = {
        ...dataRef.current,
        preferences: { ...dataRef.current.preferences, encrypted: true },
      }
      setData(next)
      persist(next)
      setToast({
        message:
          failed === 0
            ? "Encryption turned on"
            : `Encryption on — ${failed} ${failed === 1 ? "photo" : "photos"} couldn’t be re-encrypted`,
      })
    } else {
      const raws: Record<string, string> = {}
      for (const id of Object.keys(data.images)) {
        const jpeg = await readImageBase64(id)
        if (jpeg) raws[id] = jpeg
        else {
          setToast({ message: "Couldn’t read encrypted photos — staying on" })
          return
        }
      }
      keyRef.current = null
      setImageKey(null)
      await dropKey()
      for (const [id, jpeg] of Object.entries(raws)) {
        try {
          await saveImage(id, jpeg)
        } catch {
          // Plaintext write failing aborts nothing; the payload flips below
          // and the next export still carries every readable photo.
        }
      }
      const next: PersistedState = {
        ...dataRef.current,
        preferences: { ...dataRef.current.preferences, encrypted: false },
      }
      setData(next)
      persist(next)
      setToast({ message: "Encryption turned off" })
    }
  }

  const savePin = async (pin: string): Promise<boolean> => {
    const salt = makeSalt()
    try {
      const hash = await hashPin(salt, pin)
      setData((current) => ({
        ...current,
        preferences: { ...current.preferences, pinHash: hash, pinSalt: salt },
      }))
      return true
    } catch {
      return false
    }
  }

  if (boot === "loading") {
    return (
      <AppFrame>
        <main className="lock-screen">
          <div className="lock-glyph">
            <span className="boot-mark">G</span>
          </div>
          <h1>Grimoire</h1>
        </main>
      </AppFrame>
    )
  }

  if (boot === "key-locked") {
    return (
      <AppFrame>
        <main className="lock-screen">
          <div className="lock-glyph">
            <LockKeyhole size={40} />
          </div>
          <h1>Can’t unlock</h1>
          <p>
            These notes are encrypted, but this device no longer has the key.
            Without it the contents cannot be read.
          </p>
          <div className="lock-actions">
            {lockedRaw && (
              <Button
                className="lock-unlock"
                onClick={() => downloadRaw(lockedRaw)}
                variant="primary"
              >
                Export raw data
              </Button>
            )}
            <Button
              className="lock-erase"
              onClick={() =>
                setConfirm({
                  title: "Erase everything?",
                  message:
                    "The encrypted data and all photos on this device will be permanently deleted.",
                  confirmLabel: "Erase all",
                  danger: true,
                  onConfirm: () => {
                    void dropKey()
                    keyRef.current = null
                    setImageKey(null)
                    setData(initialState())
                    setLocked(false)
                    setBoot("ready")
                  },
                })
              }
            >
              Erase everything and start over
            </Button>
          </div>
        </main>
        {confirm && (
          <ConfirmDialog confirm={confirm} onCancel={() => setConfirm(null)} />
        )}
      </AppFrame>
    )
  }

  if (locked) {
    return (
      <AppFrame>
        <LockScreen
          bioLabel={bio?.label ?? "Biometrics"}
          bioUsable={bio !== null && (bio.available || bio.deviceSecure)}
          canDisable={bio !== null && !bio.available && !bio.deviceSecure}
          error={lockError}
          pinSet={data.preferences.pinHash !== null}
          onDisable={() => {
            setData((current) => ({
              ...current,
              preferences: { ...current.preferences, biometricLock: false },
            }))
            setLocked(false)
          }}
          onErase={eraseFromLockScreen}
          onUnlock={unlock}
          onPinUnlock={async (pin) => {
            const ok = await checkPin(pin)
            if (ok) {
              setLocked(false)
              setLockError("")
              void buzz(ImpactStyle.Medium)
            }
            return ok
          }}
        />
        {confirm && (
          <ConfirmDialog confirm={confirm} onCancel={() => setConfirm(null)} />
        )}
        {toast && (
          <Toast
            toast={toast}
            onDismiss={() => {
              setToast(null)
              snapshotRef.current = null
            }}
          />
        )}
      </AppFrame>
    )
  }

  if (editingNote) {
    return (
      <AppFrame>
        <NoteEditor
          labels={data.labels}
          images={data.images}
          note={editingNote}
          startWithReminder={reminderOnCreate}
          onBack={leaveEditor}
          onChange={(patch) => updateNote(editingNote.id, patch)}
          onDuplicate={() => duplicateNote(editingNote)}
          onNotify={(message) => setToast({ message })}
          onSaveReminder={(iso) => saveReminder(editingNote.id, iso)}
          onAddImages={(files) => void addImages(editingNote.id, files)}
          onRemoveImage={(imageId) => removeImage(editingNote.id, imageId)}
          onDelete={() =>
            editingNote.status === "trashed"
              ? deleteForever(editingNote.id)
              : moveNote(editingNote, "trashed")
          }
          onArchive={() =>
            moveNote(
              editingNote,
              editingNote.status === "archived" ? "active" : "archived",
            )
          }
          onRestore={() => moveNote(editingNote, "active")}
        />
        {toast && (
          <Toast
            toast={toast}
            onDismiss={() => {
              setToast(null)
              snapshotRef.current = null
            }}
          />
        )}
        {confirm && (
          <ConfirmDialog confirm={confirm} onCancel={() => setConfirm(null)} />
        )}
      </AppFrame>
    )
  }

  const activeLabelName = activeLabel
    ? (data.labels.find((label) => label.id === activeLabel)?.name ?? null)
    : null
  const headerTitle = activeLabelName ?? (
    view === "archive"
      ? "Archive"
      : view === "trash"
        ? "Trash"
        : view === "reminders"
          ? "Reminders"
          : "Notes"
  )
  const headerCount =
    view === "archive"
      ? counts.archived
      : view === "trash"
        ? counts.trashed
        : view === "reminders"
          ? reminderNotes.length
          : counts.active
  const headerDescriptor = activeLabelName
    ? "Label"
    : view === "trash"
      ? "Recently deleted"
      : view === "archive"
        ? "Archived"
        : view === "reminders"
          ? "Scheduled"
          : "On this device"

  return (
    <AppFrame>
      <main className="app-content view-enter" key={`${view}-${activeLabel}`}>
        {view === "contact" ? (
          <ContactPage />
        ) : view === "reminders" ? (
          <>
            <LibraryHeader
              title={headerTitle}
              count={headerCount}
              descriptor={headerDescriptor}
            />
            <ReminderList
              notes={reminderNotes}
              health={alarmHealth}
              onOpen={setEditingId}
              onClear={(id) => saveReminder(id, null)}
              onTest={testAlarm}
            />
          </>
        ) : (
          <>
            <LibraryHeader
              title={headerTitle}
              count={headerCount}
              descriptor={headerDescriptor}
            />

        {storageIssue && storageIssue !== "__EMPTY__" && (
          <div className="recovery-banner" role="alert">
            <Info size={18} />
            <div>
              <strong>Saved data couldn’t be read.</strong>
              <p>
                Your previous notes are still in this browser. Export them
                before resetting, or dismiss to start fresh.
              </p>
              <div className="recovery-actions">
                <Button onClick={() => downloadRaw(storageIssue)} variant="chip">
                  Export raw data
                </Button>
                <Button
                  onClick={() => {
                    void dropKey()
                    keyRef.current = null
                    setImageKey(null)
                    setData(initialState())
                    setStorageIssue(null)
                  }}
                  variant="chip"
                >
                  Reset
                </Button>
                <Button onClick={() => setStorageIssue(null)} variant="chip">
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}

        {view === "labels" ? (
          <LabelsView
            data={data}
            labelDraft={labelDraft}
            onDraftChange={setLabelDraft}
            onCreate={createLabel}
            onOpen={(id) => {
              setActiveLabel(id)
              setView("notes")
            }}
            onDelete={(id) =>
              setData((current) => ({
                ...current,
                labels: current.labels.filter((label) => label.id !== id),
                notes: current.notes.map((note) => ({
                  ...note,
                  labelIds: note.labelIds.filter((labelId) => labelId !== id),
                })),
              }))
            }
          />
        ) : (
          <>
            <label className="search-capsule">
              <Search size={17} />
              <TextInput
                aria-label="Search notes"
                id="note-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
                value={search}
              />
              {search && (
                <IconButton label="Clear search" onClick={() => setSearch("")}>
                  <X size={15} />
                </IconButton>
              )}
            </label>

            {activeLabelName && (
              <div className="filter-token-row">
                <button
                  className="filter-token"
                  onClick={() => setActiveLabel(null)}
                >
                  <Tag size={12} />
                  {activeLabelName}
                  <X size={13} />
                </button>
              </div>
            )}

            {view === "trash" && (
              <div className="trash-info">
                <p>
                  Notes stay here until you delete them. Restore a note to
                  pin or archive it again.
                </p>
                {visibleNotes.length > 0 && (
                  <Button onClick={emptyTrash} variant="danger">
                    <Trash2 size={16} />
                    Empty Trash
                  </Button>
                )}
              </div>
            )}

            <NotesCollection
              layout={data.preferences.layout}
              labels={data.labels}
              notes={visibleNotes}
              searchQuery={search}
              onOpen={setEditingId}
              onMenu={setCardMenuNote}
              view={view}
            />
          </>
        )}
        </>
      )}
      </main>

      <div className="dock">
        {composeOpen && (
          <div className="compose-popover">
            <Button onClick={() => addNote("text")}>
              <PenLine size={18} />
              New note
            </Button>
            <Button onClick={() => addNote("checklist")}>
              <ListChecks size={18} />
              New checklist
            </Button>
            <Button onClick={() => addNote("drawing")}>
              <Brush size={18} />
              New drawing
            </Button>
            <Button onClick={() => addNote("text", { reminder: true })}>
              <Bell size={18} />
              New reminder
            </Button>
          </div>
        )}
        <Button
          aria-expanded={composeOpen}
          className="compose-separate"
          onClick={() => {
            void buzz(ImpactStyle.Medium)
            setComposeOpen((open) => !open)
          }}
          variant="primary"
        >
          {composeOpen ? <X size={20} /> : <SquarePen size={20} />}
          <span>{composeOpen ? "Close" : "New"}</span>
        </Button>
        <div className="dock-bar">
          <IconButton
            label="Home"
            className={view === "notes" && !activeLabel ? "is-active" : ""}
            onClick={() => changeView("notes")}
          >
            <House size={21} />
          </IconButton>
          <IconButton
            label="Options"
            onClick={() => {
              void buzz()
              setMenuOpen(true)
            }}
          >
            <SlidersHorizontal size={21} />
          </IconButton>
          <IconButton label="Search notes" onClick={focusSearch}>
            <Search size={20} />
          </IconButton>
          <IconButton
            label="Reminders"
            className={view === "reminders" ? "is-active" : ""}
            onClick={() => changeView("reminders")}
          >
            <Bell size={20} />
          </IconButton>
          <IconButton
            label="Recently deleted"
            className={view === "trash" ? "is-active" : ""}
            onClick={() => changeView("trash")}
          >
            <Trash2 size={20} />
          </IconButton>
          <IconButton
            label="Contact developer"
            className={view === "contact" ? "is-active" : ""}
            onClick={() => changeView("contact")}
          >
            <Mail size={21} />
          </IconButton>
        </div>
      </div>

      {menuOpen && (
        <MenuSheet
          activeLabel={activeLabel}
          counts={counts}
          data={data}
          onClose={() => setMenuOpen(false)}
          onLayout={(layout) =>
            setData((current) => ({
              ...current,
              preferences: { ...current.preferences, layout },
            }))
          }
          onSelectLabel={(id) => {
            setActiveLabel(id)
            setView("notes")
            setMenuOpen(false)
          }}
          onSettings={() => {
            setMenuOpen(false)
            setSettingsOpen(true)
          }}
          onSort={(sort) =>
            setData((current) => ({
              ...current,
              preferences: { ...current.preferences, sort },
            }))
          }
          onView={changeView}
          view={view}
        />
      )}

      {cardMenuNote && (
        <CardMenuSheet
          note={cardMenuNote}
          onClose={() => setCardMenuNote(null)}
          onPin={() => togglePin(cardMenuNote)}
          onDuplicate={() => duplicateNote(cardMenuNote)}
          onPdf={() =>
            void shareNotePdf(cardMenuNote, data.images).then((ok) => {
              if (!ok) setToast({ message: "Couldn’t create the PDF" })
            })
          }
          onArchive={() =>
            moveNote(
              cardMenuNote,
              cardMenuNote.status === "archived" ? "active" : "archived",
            )
          }
          onTrash={() => moveNote(cardMenuNote, "trashed")}
          onRestore={() => moveNote(cardMenuNote, "active")}
          onDelete={() => deleteForever(cardMenuNote.id)}
        />
      )}

      {settingsOpen && (
        <SettingsSheet
          bio={bio}
          data={data}
          lockEnabled={data.preferences.biometricLock}
          pinSet={data.preferences.pinHash !== null}
          onClose={() => setSettingsOpen(false)}
          onChange={setData}
          onToggleLock={setBioLock}
          onToggleEncryption={requestEncryptedChange}
          onManagePin={() =>
            setPinSheet(data.preferences.pinHash ? "manage" : "setup")
          }
          onExport={() => {
            void (async () => {
              try {
                const bytes = await downloadBackup(data)
                const size =
                  bytes > 1048576
                    ? `${(bytes / 1048576).toFixed(1)} MB`
                    : `${Math.max(1, Math.round(bytes / 1024))} KB`
                setToast({ message: `Backup exported (${size})` })
              } catch {
                setToast({ message: "Export failed" })
              }
            })()
          }}
          onImport={() => importRef.current?.click()}
          onTrash={() => {
            setSettingsOpen(false)
            changeView("trash")
          }}
        />
      )}

      {pendingImport && !confirm && (
        <ImportSheet
          imported={pendingImport}
          onClose={() => setPendingImport(null)}
          onReplace={applyImportReplace}
        />
      )}

      {pinSheet && (
        <PinSheet
          initialMode={pinSheet}
          bioLabel={bio?.label ?? "biometrics"}
          bioUsable={bio !== null && (bio.available || bio.deviceSecure)}
          onClose={() => setPinSheet(null)}
          onSavePin={async (pin) => {
            const ok = await savePin(pin)
            setToast({
              message: ok ? "App PIN set" : "Couldn’t set PIN on this device",
            })
            if (ok) setPinSheet(null)
          }}
          onRemovePin={() => {
            setData((current) => ({
              ...current,
              preferences: {
                ...current.preferences,
                pinHash: null,
                pinSalt: "",
              },
            }))
            setToast({ message: "App PIN removed" })
            setPinSheet(null)
          }}
          checkPin={checkPin}
          verifyBiometric={verifyBiometric}
        />
      )}

      <TextInput
        ref={importRef}
        className="file-input"
        type="file"
        accept="application/json"
        onChange={handleImport}
      />
      {confirm && (
        <ConfirmDialog confirm={confirm} onCancel={() => setConfirm(null)} />
      )}
      {toast && (
        <Toast
          toast={toast}
          onDismiss={() => {
            setToast(null)
            snapshotRef.current = null
          }}
        />
      )}
    </AppFrame>
  )
}

function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="viewport">
      <div className="phone-shell">{children}</div>
    </div>
  )
}

function MenuSheet({
  activeLabel,
  counts,
  data,
  onClose,
  onLayout,
  onSelectLabel,
  onSettings,
  onSort,
  onView,
  view,
}: {
  activeLabel: string | null
  counts: { active: number; archived: number; trashed: number }
  data: PersistedState
  onClose: () => void
  onLayout: (layout: "grid" | "list") => void
  onSelectLabel: (id: string) => void
  onSettings: () => void
  onSort: (sort: "updated" | "created" | "title") => void
  onView: (view: AppView) => void
  view: AppView
}) {
  const navRow = (
    target: AppView,
    icon: React.ReactNode,
    label: string,
    count: number | null,
    selected: boolean,
  ) => (
    <Button
      aria-current={selected ? "page" : undefined}
      className={`menu-row ${selected ? "is-selected" : ""}`}
      onClick={() => onView(target)}
    >
      {icon}
      <span>{label}</span>
      {count !== null && <em>{count}</em>}
    </Button>
  )
  return (
    <ActionSheet title="Options" onClose={onClose}>
      <div className="privacy-summary">
        <ShieldCheck size={16} />
        <p>On this device · No account · No cloud</p>
      </div>
      <p className="settings-label">VIEWS</p>
      <div className="sheet-list menu-nav">
        {navRow(
          "notes",
          <PenLine size={19} />,
          "Notes",
          counts.active,
          view === "notes" && !activeLabel,
        )}
        {navRow(
          "archive",
          <Archive size={19} />,
          "Archive",
          counts.archived,
          view === "archive",
        )}
        {navRow(
          "labels",
          <Tag size={19} />,
          "Labels",
          data.labels.length,
          view === "labels",
        )}
        {navRow(
          "trash",
          <Trash2 size={19} />,
          "Recently Deleted",
          counts.trashed,
          view === "trash",
        )}
      </div>
      {view === "notes" && data.labels.length > 0 && (
        <>
          <p className="settings-label">FILTER BY LABEL</p>
          <div className="sheet-list">
            {data.labels.map((label) => (
              <Button
                className={`menu-row ${
                  activeLabel === label.id ? "is-selected" : ""
                }`}
                key={label.id}
                onClick={() => onSelectLabel(label.id)}
              >
                <Tag size={18} />
                <span>{label.name}</span>
                <em>
                  {
                    data.notes.filter((note) =>
                      note.labelIds.includes(label.id),
                    ).length
                  }
                </em>
              </Button>
            ))}
          </div>
        </>
      )}
      <p className="settings-label">SETTINGS</p>
      <div className="sheet-list">
        <Button className="menu-row" onClick={onSettings}>
          <LockKeyhole size={19} />
          <span>Settings & Privacy</span>
          <ChevronRight size={17} />
        </Button>
      </div>
      <p className="settings-label">DISPLAY</p>
      <div className="segmented segmented--two">
        {(["grid", "list"] as const).map((layout) => (
          <Button
            aria-pressed={data.preferences.layout === layout}
            className={data.preferences.layout === layout ? "is-selected" : ""}
            key={layout}
            onClick={() => onLayout(layout)}
          >
            {layout[0].toUpperCase() + layout.slice(1)}
          </Button>
        ))}
      </div>
      <p className="settings-label">SORT BY</p>
      <div className="sheet-list">
        {(
          [
            ["updated", "Last modified"],
            ["created", "Date created"],
            ["title", "Title"],
          ] as const
        ).map(([value, label]) => (
          <Button
            aria-pressed={data.preferences.sort === value}
            className={`menu-row ${
              data.preferences.sort === value ? "is-selected" : ""
            }`}
            key={value}
            onClick={() => onSort(value)}
          >
            <span>{label}</span>
            {data.preferences.sort === value && <Check size={17} />}
          </Button>
        ))}
      </div>
    </ActionSheet>
  )
}

function GithubMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function ContactPage() {
  return (
    <section className="contact-page">
      <div className="contact-mono" aria-hidden="true">
        <GithubMark size={44} />
      </div>
      <Title>Grimoire</Title>
      <p className="page-description">
        A private notebook by karansingh-in — everything stays on this device.
      </p>
      <div className="about-card">
        <strong>About this app</strong>
        <p>
          Grimoire is a notebook that never leaves this device. Every note,
          checklist, drawing, and photo is created and kept right here —
          there is no account to make, no server to reach, and no analytics
          watching. It is free and open source.
        </p>
        <ul>
          <li>
            <Check size={14} />
            No account, no sign-in
          </li>
          <li>
            <Check size={14} />
            No cloud sync or servers
          </li>
          <li>
            <Check size={14} />
            No analytics or ads
          </li>
          <li>
            <Check size={14} />
            Free and open source — github.com/karansingh-in/grimoire
          </li>
        </ul>
        <strong className="about-sub">How your notes are protected</strong>
        <p>
          Notes and photos are encrypted on this device with AES-256. The
          key is generated here and held in the Android keystore — it is
          never in the app’s code and never leaves in a backup. Your
          fingerprint, face, device passcode, or app PIN only opens the
          front door.
        </p>
        <p>
          Honest limits: encryption guards files sitting on the phone, not
          a rooted device or someone you hand the unlocked phone to.
          Exported backups are readable text by design, so keep one
          somewhere safe — without this device and its key, encrypted data
          cannot be recovered.
        </p>
      </div>
      <div className="settings-group contact-links">
        <a
          className="settings-row settings-link"
          href="https://github.com/karansingh-in/grimoire"
          rel="noreferrer"
          target="_blank"
        >
          <span className="settings-icon">
            <Globe size={19} />
          </span>
          <span>
            <strong>GitHub</strong>
            <small>github.com/karansingh-in/grimoire</small>
          </span>
          <ChevronRight size={18} />
        </a>
        <Divider />
        <a
          className="settings-row settings-link"
          href="https://x.com/karansingh_ind"
          rel="noreferrer"
          target="_blank"
        >
          <span className="settings-icon">
            <AtSign size={19} />
          </span>
          <span>
            <strong>X</strong>
            <small>x.com/karansingh_ind</small>
          </span>
          <ChevronRight size={18} />
        </a>
        <Divider />
        <a
          className="settings-row settings-link"
          href="mailto:karannsinggh.work@gmail.com"
        >
          <span className="settings-icon">
            <Mail size={19} />
          </span>
          <span>
            <strong>Email</strong>
            <small>karannsinggh.work@gmail.com</small>
          </span>
          <ChevronRight size={18} />
        </a>
      </div>
      <p className="contact-version">Grimoire · your notes never leave this device</p>
    </section>
  )
}

function LibraryHeader({
  title,
  count,
  descriptor,
}: {
  title: string
  count: number
  descriptor: string
}) {
  return (
    <header className="library-header">
      <Title>{title}</Title>
      <p className="library-status">
        <ShieldCheck size={12} />
        <span>
          {count} {count === 1 ? "note" : "notes"} · {descriptor}
        </span>
      </p>
    </header>
  )
}

function ReminderList({
  notes,
  health,
  onOpen,
  onClear,
  onTest,
}: {
  notes: Note[]
  health: { bridge: boolean; exact: boolean; notifications: boolean } | null
  onOpen: (id: string) => void
  onClear: (id: string) => void
  onTest: () => void
}) {
  const native = Capacitor.isNativePlatform()
  return (
    <>
      {health && !native && (
        <div className="alarm-note" role="note">
          <Info size={16} />
          <p>Alarms ring on the installed app — not in this preview.</p>
        </div>
      )}
      {health && native && !health.bridge && (
        <div className="alarm-note alarm-note--bad" role="alert">
          <Info size={16} />
          <p>
            The alarm service didn’t respond. Reinstall the app, and if it
            persists, export a backup first.
          </p>
        </div>
      )}
      {health?.bridge && native && !health.exact && (
        <div className="alarm-note alarm-note--bad" role="alert">
          <Info size={16} />
          <p>Alarms may ring late without exact timing.</p>
          <Button
            variant="chip"
            onClick={() => void Alarm.openAppSettings()}
          >
            Allow
          </Button>
        </div>
      )}
      {health?.bridge && native && !health.notifications && (
        <div className="alarm-note alarm-note--bad" role="alert">
          <Info size={16} />
          <p>Alarms stay silent with notifications off.</p>
          <Button
            variant="chip"
            onClick={() => void Alarm.openAppSettings()}
          >
            Turn on
          </Button>
        </div>
      )}
      {health?.bridge && native && health.exact && health.notifications && (
        <div className="alarm-note">
          <Check size={16} />
          <p>Alarms are ready on this phone.</p>
          <Button variant="chip" onClick={onTest}>
            Test
          </Button>
        </div>
      )}
      {notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Bell size={26} />
          </div>
          <Title as="h2">No reminders</Title>
          <p>Set one from any note and it will ring here on time.</p>
        </div>
      ) : (
        <div className="collection reminder-list">
          {notes.map((note) => {
            const at = new Date(note.reminderAt as string)
            const overdue = at.getTime() < Date.now()
            return (
              <div className="reminder-row" key={note.id}>
                <Button className="reminder-main" onClick={() => onOpen(note.id)}>
                  <span
                    className={`reminder-time${overdue ? " is-overdue" : ""}`}
                  >
                    {at.toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>
                    <strong>{note.title || "Untitled note"}</strong>
                    {overdue && <small>Overdue</small>}
                  </span>
                  <ChevronRight size={18} />
                </Button>
                <IconButton
                  label={`Clear reminder for ${note.title || "untitled note"}`}
                  onClick={() => onClear(note.id)}
                >
                  <X size={17} />
                </IconButton>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromParts(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  const at = new Date(year, (month ?? 1) - 1, day, hour ?? 0, minute ?? 0)
  return toLocalInput(at.toISOString())
}

function quickInput(when: "today" | "tomorrow" | "weekend"): string {
  const at = new Date()
  if (when === "today") {
    at.setHours(at.getHours() + 2, 0, 0, 0)
  } else if (when === "tomorrow") {
    at.setDate(at.getDate() + 1)
    at.setHours(9, 0, 0, 0)
  } else {
    const daysUntilSaturday = (6 - at.getDay() + 7) % 7 || 7
    at.setDate(at.getDate() + daysUntilSaturday)
    at.setHours(9, 0, 0, 0)
  }
  return toLocalInput(at.toISOString())
}

function ReminderSheet({
  initial,
  onClose,
  onSave,
  onClear,
}: {
  initial: string | null
  onClose: () => void
  onSave: (iso: string) => void
  onClear: () => void
}) {
  const [value, setValue] = useState(initial ? toLocalInput(initial) : "")
  const [error, setError] = useState("")
  const [datePart, timePart = ""] = value.split("T")
  const pick = (when: "today" | "tomorrow" | "weekend") => {
    setValue(quickInput(when))
    setError("")
  }
  const time = value ? new Date(value).getTime() : NaN
  const summary = Number.isFinite(time)
    ? new Date(time).toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : ""
  const save = () => {
    if (!value || !Number.isFinite(time)) {
      setError("Pick a date and time first.")
      return
    }
    if (time <= Date.now()) {
      setError("Pick a time in the future.")
      return
    }
    onSave(new Date(time).toISOString())
  }
  return (
    <ActionSheet title="Reminder" onClose={onClose}>
      <div className="quick-row" role="group" aria-label="Quick times">
        <Button
          variant="chip"
          onClick={() => pick("today")}
        >
          Today
        </Button>
        <Button
          variant="chip"
          onClick={() => pick("tomorrow")}
        >
          Tomorrow
        </Button>
        <Button
          variant="chip"
          onClick={() => pick("weekend")}
        >
          This weekend
        </Button>
      </div>
      <div className="datetime-row">
        <label className="datetime-field">
          <span>Date</span>
          <input
            aria-label="Reminder date"
            type="date"
            value={datePart ?? ""}
            onChange={(event) => {
              setValue(fromParts(event.target.value, timePart || "09:00"))
              setError("")
            }}
          />
        </label>
        <label className="datetime-field">
          <span>Time</span>
          <input
            aria-label="Reminder time"
            type="time"
            value={timePart}
            onChange={(event) => {
              const today = new Date()
              const pad = (n: number) => String(n).padStart(2, "0")
              const fallback = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
              setValue(fromParts(datePart || fallback, event.target.value))
              setError("")
            }}
          />
        </label>
      </div>
      {summary && (
        <p className="reminder-summary" aria-live="polite">
          Rings {summary}
        </p>
      )}
      {error && (
        <p className="lock-error pin-error" role="alert">
          {error}
        </p>
      )}
      {initial ? (
        <div className="confirm-actions">
          <Button onClick={onClear} variant="danger">
            Remove
          </Button>
          <Button disabled={!value} onClick={save} variant="primary">
            Update
          </Button>
        </div>
      ) : (
        <Button
          className="reset-button reminder-save"
          disabled={!value}
          onClick={save}
          variant="primary"
        >
          Set reminder
        </Button>
      )}
      <p className="page-description pin-note">
        Rings once with sound, even on the lock screen.
      </p>
    </ActionSheet>
  )
}

function NotesCollection({
  notes,
  labels,
  layout,
  searchQuery,
  onOpen,
  onMenu,
  view,
}: {
  notes: Note[]
  labels: PersistedState["labels"]
  layout: "grid" | "list"
  searchQuery: string
  onOpen: (id: string) => void
  onMenu: (note: Note) => void
  view: AppView
}) {
  if (!notes.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          {view === "trash" ? (
            <Trash2 />
          ) : view === "archive" ? (
            <Archive />
          ) : (
            <Lightbulb />
          )}
        </div>
        <Title as="h2">
          {searchQuery.trim()
            ? "No matching notes"
            : view === "trash"
              ? "Trash is empty"
              : view === "archive"
                ? "Nothing archived"
                : "A quiet place to think"}
        </Title>
        <p>
          {searchQuery.trim()
            ? `Nothing here matches “${searchQuery.trim()}”.`
            : view === "trash"
              ? "Deleted notes will appear here until you remove them."
              : view === "archive"
                ? "Notes you archive stay out of the way, but close at hand."
                : "Create a note, checklist, or drawing. It stays right here on your device."}
        </p>
      </div>
    )
  }

  const pinned = notes.filter((note) => note.pinned)
  const others = notes.filter((note) => !note.pinned)
  return (
    <div className="collection">
      {pinned.length > 0 && (
        <NoteSection
          label="Pinned"
          labels={labels}
          layout={layout}
          notes={pinned}
          searchQuery={searchQuery}
          onOpen={onOpen}
          onMenu={onMenu}
        />
      )}
      {others.length > 0 && (
        <NoteSection
          label={pinned.length ? "Others" : ""}
          labels={labels}
          layout={layout}
          notes={others}
          searchQuery={searchQuery}
          onOpen={onOpen}
          onMenu={onMenu}
        />
      )}
    </div>
  )
}

function CardThumb({ id }: { id: string }) {
  const src = useImageSrc(id)
  if (!src) return null
  return <img alt="" aria-hidden="true" className="note-thumb" src={src} />
}

function EditorImage({
  id,
  onRemove,
}: {
  id: string
  onRemove?: (id: string) => void
}) {
  const src = useImageSrc(id)
  if (!src) return null
  return (
    <div className="note-image">
      <img alt="Attached photo" src={src} />
      {onRemove && (
        <IconButton label="Remove photo" onClick={() => onRemove(id)}>
          <X size={15} />
        </IconButton>
      )}
    </div>
  )
}

function NoteImages({
  ids,
  onRemove,
}: {
  ids: string[]
  onRemove?: (id: string) => void
}) {
  if (ids.length === 0) return null
  return (
    <div className="note-images">
      {ids.map((id) => (
        <EditorImage key={id} id={id} onRemove={onRemove} />
      ))}
    </div>
  )
}

function NoteSection({
  label,
  notes,
  labels,
  layout,
  searchQuery,
  onOpen,
  onMenu,
}: {
  label: string
  notes: Note[]
  labels: PersistedState["labels"]
  layout: "grid" | "list"
  searchQuery: string
  onOpen: (id: string) => void
  onMenu: (note: Note) => void
}) {
  const [pressId, setPressId] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const firedRef = useRef(false)

  const clearPress = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setPressId(null)
  }

  const beginPress = (event: React.PointerEvent, note: Note) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    firedRef.current = false
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true
      timerRef.current = null
      setPressId(null)
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        void buzz(ImpactStyle.Medium)
      }
      onMenu(note)
    }, 450)
    setPressId(note.id)
  }

  return (
    <section className="note-section">
      {label && <p className="section-label">{label}</p>}
      <div className={`notes-layout notes-layout--${layout}`}>
        {notes.map((note) => {
          const labelNames = note.labelIds
            .map((id) => labels.find((label) => label.id === id)?.name)
            .filter((name): name is string => !!name)
          return (
            <article
              className={`note-card note-card--${note.color} ${
                pressId === note.id ? "is-pressing" : ""
              }`}
              key={note.id}
              onClick={() => {
                if (firedRef.current) {
                  firedRef.current = false
                  return
                }
                onOpen(note.id)
              }}
              onPointerCancel={clearPress}
              onPointerDown={(event) => beginPress(event, note)}
              onPointerLeave={clearPress}
              onPointerMove={(event) => {
                if (event.buttons !== 0) clearPress()
              }}
              onPointerUp={clearPress}
            >
              <div className="note-card__head">
                <Title as="h3">
                  <Highlight
                    text={note.title || "Untitled note"}
                    query={searchQuery}
                  />
                </Title>
                <IconButton
                  label={`Options for ${note.title || "untitled note"}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onMenu(note)
                  }}
                >
                  <MoreHorizontal size={16} />
                </IconButton>
              </div>
              {note.kind === "text" && note.body && (
                <p className="note-preview">
                  <Highlight text={note.body} query={searchQuery} />
                </p>
              )}
              {note.imageIds.length > 0 && (
                <CardThumb id={note.imageIds[0]} />
              )}
              {note.kind === "checklist" && (
                <div className="check-preview">
                  {note.checklistItems.slice(0, 4).map((item) => (
                    <div
                      className={item.completed ? "is-complete" : ""}
                      key={item.id}
                    >
                      <span className="mini-check">
                        {item.completed && <Check size={10} />}
                      </span>
                      <span>{item.text || "List item"}</span>
                    </div>
                  ))}
                </div>
              )}
              {note.kind === "drawing" && note.strokes.length > 0 && (
                <DrawingThumb strokes={note.strokes} />
              )}
              {note.kind === "drawing" && note.strokes.length === 0 && (
                <p className="note-preview">No drawing yet</p>
              )}
              <div className="note-card__foot">
                {note.pinned && (
                  <span className="pin-badge" aria-label="Pinned">
                    <PinIcon />
                  </span>
                )}
                {labelNames.length > 0 && (
                  <span className="foot-label">
                    {labelNames[0]}
                    {labelNames.length > 1 && ` +${labelNames.length - 1}`}
                  </span>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M16 3a1 1 0 0 1 .7.3l4 4a1 1 0 0 1-.3 1.7l-2.5 1-2.6 2.6.9 4.6a1 1 0 0 1-1.6 1L12 16.7l-4.3 4.3a1 1 0 0 1-1.4-1.4l4.3-4.3-1.6-2.6a1 1 0 0 1 1-1.6l4.6.9L17.2 9l1-2.5A1 1 0 0 1 16 3Z" />
    </svg>
  )
}

function CardMenuSheet({
  note,
  onClose,
  onPin,
  onDuplicate,
  onPdf,
  onArchive,
  onTrash,
  onRestore,
  onDelete,
}: {
  note: Note
  onClose: () => void
  onPin: () => void
  onDuplicate: () => void
  onPdf: () => void
  onArchive: () => void
  onTrash: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  const trashed = note.status === "trashed"
  return (
    <ActionSheet title={note.title || "Untitled note"} onClose={onClose}>
      <div className="sheet-list">
        {!trashed && (
          <Button className="sheet-row" onClick={onPin}>
            <PinIcon />
            {note.pinned ? "Unpin" : "Pin"}
          </Button>
        )}
        <Button className="sheet-row" onClick={onDuplicate}>
          <Copy size={18} />
          Duplicate
        </Button>
        <Button
          className="sheet-row"
          onClick={() => {
            onClose()
            onPdf()
          }}
        >
          <FileDown size={18} />
          Export as PDF
        </Button>
        {!trashed && (
          <Button className="sheet-row" onClick={onArchive}>
            {note.status === "archived" ? (
              <ArchiveRestore size={18} />
            ) : (
              <Archive size={18} />
            )}
            {note.status === "archived" ? "Unarchive" : "Archive"}
          </Button>
        )}
        {trashed ? (
          <Button className="sheet-row" onClick={onRestore}>
            <RotateCcw size={18} />
            Restore
          </Button>
        ) : (
          <Button className="sheet-row" onClick={onTrash}>
            <Trash2 size={18} />
            Move to Trash
          </Button>
        )}
        {trashed && (
          <Button className="sheet-row sheet-row--danger" onClick={onDelete}>
            <Trash2 size={18} />
            Delete forever
          </Button>
        )}
      </div>
    </ActionSheet>
  )
}

function NoteEditor({
  note,
  labels,
  images,
  startWithReminder,
  onBack,
  onChange,
  onDuplicate,
  onNotify,
  onSaveReminder,
  onAddImages,
  onRemoveImage,
  onDelete,
  onArchive,
  onRestore,
}: {
  note: Note
  labels: PersistedState["labels"]
  images: PersistedState["images"]
  startWithReminder: boolean
  onBack: () => void
  onChange: (patch: Partial<Note>) => void
  onDuplicate: () => void
  onNotify: (message: string) => void
  onSaveReminder: (iso: string | null) => void
  onAddImages: (files: FileList | null) => void
  onRemoveImage: (imageId: string) => void
  onDelete: () => void
  onArchive: () => void
  onRestore: () => void
}) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(startWithReminder)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const trashed = note.status === "trashed"

  const updateItem = (id: string, patch: Partial<ChecklistItem>) => {
    onChange({
      checklistItems: note.checklistItems.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })
  }

  const moveItem = (id: string, direction: -1 | 1) => {
    const index = note.checklistItems.findIndex((item) => item.id === id)
    const next = index + direction
    if (index < 0 || next < 0 || next >= note.checklistItems.length) return
    const items = [...note.checklistItems]
    const [moved] = items.splice(index, 1)
    items.splice(next, 0, moved)
    onChange({
      checklistItems: items.map((item, order) => ({ ...item, order })),
    })
  }

  const addItem = () =>
    onChange({
      checklistItems: [
        ...note.checklistItems,
        {
          id: makeId(),
          text: "",
          completed: false,
          order: note.checklistItems.length,
        },
      ],
    })

  const activeItems = note.checklistItems.filter((item) => !item.completed)
  const completedItems = note.checklistItems.filter((item) => item.completed)

  const renderRow = (item: ChecklistItem, position: string) => (
    <div className="checklist-row" key={item.id}>
      <IconButton
        className={
          item.completed ? "check-control is-complete" : "check-control"
        }
        label={item.completed ? "Mark incomplete" : "Mark complete"}
        onClick={() => {
          void buzz()
          updateItem(item.id, { completed: !item.completed })
        }}
      >
        {item.completed && <Check size={14} />}
      </IconButton>
      <TextInput
        aria-label={`Checklist item ${position}`}
        className={item.completed ? "is-complete" : ""}
        onChange={(event) => updateItem(item.id, { text: event.target.value })}
        placeholder="List item"
        value={item.text}
      />
      <div className="row-actions">
        <IconButton
          label={`Move ${item.text || "item"} up`}
          onClick={() => moveItem(item.id, -1)}
        >
          <ChevronUp size={15} />
        </IconButton>
        <IconButton
          label={`Move ${item.text || "item"} down`}
          onClick={() => moveItem(item.id, 1)}
        >
          <ChevronDown size={15} />
        </IconButton>
        <IconButton
          label={`Remove ${item.text || "item"}`}
          onClick={() =>
            onChange({
              checklistItems: note.checklistItems.filter(
                (candidate) => candidate.id !== item.id,
              ),
            })
          }
        >
          <X size={15} />
        </IconButton>
      </div>
    </div>
  )

  return (
    <main className={`editor editor--${note.color}`}>
      <header className="editor-topbar">
        <IconButton label="Back to notes" onClick={onBack}>
          <ArrowLeft size={22} />
        </IconButton>
        <span className="saved-status">
          <Check size={13} />
          Saved · {editorStats(note)}
        </span>
      </header>

      <div className="editor-body">
        <p className="editor-date">
          {new Date(note.updatedAt).toLocaleString([], {
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
        <TextInput
          aria-label="Note title"
          className="editor-title"
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Title"
          value={note.title}
        />
        <NoteImages
          ids={note.imageIds}
          onRemove={trashed ? undefined : onRemoveImage}
        />
        <input
          accept="image/*"
          aria-label="Add photos"
          className="file-input"
          multiple
          onChange={(event) => {
            onAddImages(event.target.files)
            event.target.value = ""
          }}
          ref={imageInputRef}
          type="file"
        />
        {note.kind === "text" && (
          <TextArea
            aria-label="Note body"
            autoFocus={!note.title}
            className="editor-text"
            onChange={(event) => onChange({ body: event.target.value })}
            placeholder="Start writing…"
            value={note.body}
          />
        )}
        {note.kind === "checklist" && (
          <div className="checklist-editor">
            {activeItems.map((item, index) => renderRow(item, `${index + 1}`))}
            {completedItems.length > 0 && (
              <>
                <p className="section-label checklist-completed-label">
                  Completed · {completedItems.length}
                </p>
                {completedItems.map((item) => renderRow(item, "completed"))}
              </>
            )}
            <Button className="add-item" onClick={addItem}>
              <Plus size={17} />
              Add item
            </Button>
          </div>
        )}
        {note.kind === "drawing" && (
          <DrawingCanvas
            docked={!trashed}
            strokes={note.strokes}
            onChange={(strokes) => onChange({ strokes })}
            onMore={() => setMoreOpen(true)}
          />
        )}
      </div>

      {trashed ? (
        <div className="editor-toolbar editor-toolbar--trashed">
          <Button onClick={onRestore}>
            <RotateCcw size={18} />
            Restore
          </Button>
          <Button onClick={onDelete} variant="danger">
            <Trash2 size={18} />
            Delete Forever
          </Button>
        </div>
      ) : note.kind === "drawing" ? null : (
        <div className="editor-toolbar">
          <IconButton label="Choose color" onClick={() => setPaletteOpen(true)}>
            <Palette size={20} />
          </IconButton>
          <IconButton label="Manage labels" onClick={() => setLabelsOpen(true)}>
            <Tag size={20} />
          </IconButton>
          <IconButton
            label="Add photos"
            onClick={() =>
              window.setTimeout(() => imageInputRef.current?.click(), 60)
            }
          >
            <ImagePlus size={20} />
          </IconButton>
          <IconButton label="Move to Trash" onClick={onDelete}>
            <Trash2 size={20} />
          </IconButton>
          <span className="toolbar-spacer" />
          <IconButton label="More actions" onClick={() => setMoreOpen(true)}>
            <MoreHorizontal size={20} />
          </IconButton>
        </div>
      )}

      {moreOpen && (
        <ActionSheet title="Note actions" onClose={() => setMoreOpen(false)}>
          <div className="sheet-list">
            {!trashed && (
              <Button
                className="sheet-row"
                onClick={() => {
                  onChange({ pinned: !note.pinned })
                  setMoreOpen(false)
                }}
              >
                <PinIcon />
                {note.pinned ? "Unpin" : "Pin"}
              </Button>
            )}
            {!trashed && (
              <Button
                className="sheet-row"
                onClick={() => {
                  onArchive()
                  setMoreOpen(false)
                }}
              >
                {note.status === "archived" ? (
                  <ArchiveRestore size={18} />
                ) : (
                  <Archive size={18} />
                )}
                {note.status === "archived" ? "Unarchive" : "Archive"}
              </Button>
            )}
            <Button
              className="sheet-row"
              onClick={() => {
                onDuplicate()
                setMoreOpen(false)
              }}
            >
              <Copy size={18} />
              Duplicate
            </Button>
            {!trashed && (
              <Button
                className="sheet-row"
                onClick={() => {
                  setMoreOpen(false)
                  setReminderOpen(true)
                }}
              >
                <Clock size={18} />
                {note.reminderAt ? "Change reminder" : "Remind me"}
              </Button>
            )}
            <Button
              className="sheet-row"
              onClick={() => {
                setMoreOpen(false)
                void shareNotePdf(note, images).then((ok) => {
                  if (!ok) onNotify("Couldn’t create the PDF")
                })
              }}
            >
              <FileDown size={18} />
              Export as PDF
            </Button>
            {!trashed && note.kind === "drawing" && (
              <Button
                className="sheet-row"
                onClick={() => {
                  setMoreOpen(false)
                  window.setTimeout(
                    () => imageInputRef.current?.click(),
                    120,
                  )
                }}
              >
                <ImagePlus size={18} />
                Add photos
              </Button>
            )}
            {note.kind === "drawing" && !trashed && (
              <>
                <Button
                  className="sheet-row"
                  onClick={() => {
                    setMoreOpen(false)
                    setPaletteOpen(true)
                  }}
                >
                  <Palette size={18} />
                  Note color
                </Button>
                <Button
                  className="sheet-row"
                  onClick={() => {
                    setMoreOpen(false)
                    setLabelsOpen(true)
                  }}
                >
                  <Tag size={18} />
                  Labels
                </Button>
              </>
            )}
            {trashed ? (
              <Button
                className="sheet-row"
                onClick={() => {
                  onRestore()
                  setMoreOpen(false)
                }}
              >
                <RotateCcw size={18} />
                Restore
              </Button>
            ) : (
              <Button
                className="sheet-row"
                onClick={() => {
                  onDelete()
                  setMoreOpen(false)
                }}
              >
                <Trash2 size={18} />
                Move to Trash
              </Button>
            )}
            {trashed && (
              <Button
                className="sheet-row sheet-row--danger"
                onClick={() => {
                  onDelete()
                  setMoreOpen(false)
                }}
              >
                <Trash2 size={18} />
                Delete forever
              </Button>
            )}
          </div>
        </ActionSheet>
      )}

      {reminderOpen && (
        <ReminderSheet
          initial={note.reminderAt}
          onClose={() => setReminderOpen(false)}
          onSave={(iso) => {
            onSaveReminder(iso)
            setReminderOpen(false)
          }}
          onClear={() => {
            onSaveReminder(null)
            setReminderOpen(false)
          }}
        />
      )}

      {paletteOpen && (
        <ActionSheet title="Note color" onClose={() => setPaletteOpen(false)}>
          <div className="swatch-grid">
            {COLORS.map((color) => (
              <button
                aria-label={colorNames[color]}
                aria-pressed={note.color === color}
                className={`swatch swatch--${color} ${
                  note.color === color ? "is-selected" : ""
                }`}
                key={color}
                onClick={() => {
                  onChange({ color })
                  setPaletteOpen(false)
                }}
                title={colorNames[color]}
                type="button"
              >
                {note.color === color && <Check size={16} />}
              </button>
            ))}
          </div>
          <p className="swatch-name">
            {colorNames[note.color]} · Color is decorative only
          </p>
        </ActionSheet>
      )}

      {labelsOpen && (
        <ActionSheet title="Labels" onClose={() => setLabelsOpen(false)}>
          <div className="sheet-list">
            {labels.length === 0 && (
              <p className="page-description">
                No labels yet. Create one from the Labels view.
              </p>
            )}
            {labels.map((label) => {
              const selected = note.labelIds.includes(label.id)
              return (
                <Button
                  className="sheet-row"
                  key={label.id}
                  onClick={() =>
                    onChange({
                      labelIds: selected
                        ? note.labelIds.filter((id) => id !== label.id)
                        : [...note.labelIds, label.id],
                    })
                  }
                >
                  <span
                    className={selected ? "check-box is-selected" : "check-box"}
                  >
                    {selected && <Check size={13} />}
                  </span>
                  {label.name}
                </Button>
              )
            })}
          </div>
        </ActionSheet>
      )}
    </main>
  )
}

function LabelsView({
  data,
  labelDraft,
  onDraftChange,
  onCreate,
  onOpen,
  onDelete,
}: {
  data: PersistedState
  labelDraft: string
  onDraftChange: (value: string) => void
  onCreate: () => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <section className="labels-view">
      <p className="eyebrow">Organize</p>
      <Title>Labels</Title>
      <p className="page-description">
        Group notes without moving them from your library.
      </p>
      <div className="create-label">
        <TextInput
          aria-label="New label name"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && onCreate()}
          placeholder="New label"
          value={labelDraft}
        />
        <Button
          disabled={!labelDraft.trim()}
          onClick={onCreate}
          variant="primary"
        >
          Add
        </Button>
      </div>
      <div className="settings-group">
        {data.labels.length === 0 && (
          <p className="page-description label-empty">
            No labels yet. Create your first one above.
          </p>
        )}
        {data.labels.map((label, index) => (
          <div key={label.id}>
            <div className="label-row">
              <Button className="label-main" onClick={() => onOpen(label.id)}>
                <span className="label-icon">
                  <Tag size={18} />
                </span>
                <span>
                  <strong>{label.name}</strong>
                  <small>
                    {
                      data.notes.filter((note) =>
                        note.labelIds.includes(label.id),
                      ).length
                    }{" "}
                    notes
                  </small>
                </span>
                <ChevronRight size={18} />
              </Button>
              <IconButton
                label={`Delete ${label.name}`}
                onClick={() => onDelete(label.id)}
              >
                <Trash2 size={17} />
              </IconButton>
            </div>
            {index < data.labels.length - 1 && <Divider />}
          </div>
        ))}
      </div>
    </section>
  )
}

function SettingsSheet({
  bio,
  data,
  lockEnabled,
  pinSet,
  onClose,
  onChange,
  onToggleLock,
  onManagePin,
  onToggleEncryption,
  onExport,
  onImport,
  onTrash,
}: {
  bio: BioStatus | null
  data: PersistedState
  lockEnabled: boolean
  pinSet: boolean
  onClose: () => void
  onChange: (data: PersistedState) => void
  onToggleLock: (enabled: boolean) => void
  onManagePin: () => void
  onToggleEncryption: (enabled: boolean) => void
  onExport: () => void
  onImport: () => void
  onTrash: () => void
}) {
  const bioHint = !bio
    ? "Checking this device…"
    : bio.available
      ? `Uses ${bio.label} or your device passcode`
      : bio.deviceSecure
        ? "Uses your device passcode, PIN, or pattern"
        : "No biometrics or passcode found on this device"
  return (
    <ActionSheet title="Settings & privacy" onClose={onClose}>
      <div className="privacy-card">
        <div className="privacy-card__icon">
          <LockKeyhole size={22} />
        </div>
        <div>
          <strong>Your notes stay with you.</strong>
          <p>
            No account, no cloud sync, and no analytics. Everything is saved
            in this browser on this device unless you export it. Notes are
            not separately encrypted — turn on app lock above to keep them
            behind your fingerprint or passcode.
          </p>
        </div>
      </div>

      <p className="settings-label">Appearance</p>
      <div className="segmented">
        {(["system", "light", "dark"] as const).map((theme) => (
          <Button
            className={data.preferences.theme === theme ? "is-selected" : ""}
            key={theme}
            onClick={() =>
              onChange({
                ...data,
                preferences: { ...data.preferences, theme },
              })
            }
          >
            {theme[0].toUpperCase() + theme.slice(1)}
          </Button>
        ))}
      </div>

      <p className="settings-label">Default layout</p>
      <div className="segmented segmented--two">
        {(["grid", "list"] as const).map((layout) => (
          <Button
            className={data.preferences.layout === layout ? "is-selected" : ""}
            key={layout}
            onClick={() =>
              onChange({
                ...data,
                preferences: { ...data.preferences, layout },
              })
            }
          >
            {layout[0].toUpperCase() + layout.slice(1)}
          </Button>
        ))}
      </div>

      <p className="settings-label">App lock</p>
      <div className="settings-group">
        <div className="bio-row">
          <span className="settings-icon">
            <Fingerprint size={19} />
          </span>
          <span>
            <strong>Require {bio?.label ?? "biometrics"} to open</strong>
            <small>{bioHint}</small>
          </span>
          <Switch
            checked={lockEnabled}
            disabled={!bio || (!bio.available && !bio.deviceSecure)}
            label="Require biometrics to open the app"
            onChange={onToggleLock}
          />
        </div>
        <Divider />
        <Button className="settings-row" onClick={onManagePin}>
          <span className="settings-icon">
            <Hash size={19} />
          </span>
          <span>
            <strong>App PIN</strong>
            <small>
              {pinSet
                ? "Set — fallback when biometrics fail"
                : "Off — a fallback unlock when biometrics fail"}
            </small>
          </span>
          <ChevronRight size={18} />
        </Button>
      </div>

      <p className="settings-label">Encryption</p>
      <div className="settings-group">
        <div className="bio-row">
          <span className="settings-icon">
            <ShieldCheck size={19} />
          </span>
          <span>
            <strong>Encrypt notes on this device</strong>
            <small>
              {data.preferences.encrypted
                ? "On — AES-256, key in the device keystore"
                : "Off — notes stored as readable text"}
            </small>
          </span>
          <Switch
            checked={data.preferences.encrypted}
            label="Encrypt notes on this device"
            onChange={onToggleEncryption}
          />
        </div>
      </div>
      <div className="local-info">
        <Info size={17} />
        <p>
          Encryption protects files on this device, not rooted phones.
          Exports are always readable text — keep one before enabling, since
          data without its key cannot be recovered.
        </p>
      </div>

      <p className="settings-label">Your data</p>
      <div className="settings-group">
        <Button className="settings-row" onClick={onExport}>
          <span className="settings-icon">
            <FileDown size={19} />
          </span>
          <span>
            <strong>Export backup</strong>
            <small>Download a readable JSON file</small>
          </span>
          <ChevronRight size={18} />
        </Button>
        <Divider />
        <Button className="settings-row" onClick={onImport}>
          <span className="settings-icon">
            <FileUp size={19} />
          </span>
          <span>
            <strong>Import backup</strong>
            <small>Replace current notes from a file</small>
          </span>
          <ChevronRight size={18} />
        </Button>
        <Divider />
        <Button className="settings-row" onClick={onTrash}>
          <span className="settings-icon">
            <Trash2 size={19} />
          </span>
          <span>
            <strong>Recently deleted</strong>
            <small>
              {data.notes.filter((note) => note.status === "trashed").length}{" "}
              notes
            </small>
          </span>
          <ChevronRight size={18} />
        </Button>
      </div>

      <div className="local-info">
        <Info size={17} />
        <p>
          Clearing this browser’s data will erase notes that have not been
          exported. Exported files are not encrypted.
        </p>
      </div>
    </ActionSheet>
  )
}

function ImportSheet({
  imported,
  onClose,
  onReplace,
}: {
  imported: { state: PersistedState; imagesData: Record<string, string> }
  onClose: () => void
  onReplace: () => void
}) {
  const notes = imported.state.notes.length
  const labels = imported.state.labels.length
  const photos = Object.keys(imported.imagesData).length
  return (
    <ActionSheet title="Import backup" onClose={onClose}>
      <p className="page-description">
        This file holds {notes} {notes === 1 ? "note" : "notes"},{" "}
        {labels} {labels === 1 ? "label" : "labels"}
        {photos > 0 &&
          ` and ${photos} ${photos === 1 ? "photo" : "photos"}`}. Importing
        replaces everything currently on this device.
      </p>
      <div className="confirm-actions import-single">
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onReplace} variant="danger">
          Replace
        </Button>
      </div>
    </ActionSheet>
  )
}

function PinPad({
  onDigit,
  onBackspace,
}: {
  onDigit: (digit: string) => void
  onBackspace: () => void
}) {
  return (
    <div className="pin-pad" role="group" aria-label="PIN pad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
        <button
          key={digit}
          className="pin-key"
          onClick={() => {
            void buzz()
            onDigit(digit)
          }}
          type="button"
        >
          {digit}
        </button>
      ))}
      <span aria-hidden="true" />
      <button
        className="pin-key"
        onClick={() => {
          void buzz()
          onDigit("0")
        }}
        type="button"
      >
        0
      </button>
      <button
        aria-label="Delete last digit"
        className="pin-key"
        onClick={() => {
          void buzz()
          onBackspace()
        }}
        type="button"
      >
        <Delete size={20} />
      </button>
    </div>
  )
}

function PinDots({ length }: { length: number }) {
  return (
    <div className="pin-dots" aria-hidden="true">
      {Array.from({ length: Math.max(length, 1) }, (_, index) => (
        <span
          key={index}
          className={index < length ? "is-filled" : ""}
        />
      ))}
    </div>
  )
}

function PinSheet({
  initialMode,
  bioLabel,
  bioUsable,
  onClose,
  onSavePin,
  onRemovePin,
  checkPin,
  verifyBiometric,
}: {
  initialMode: "setup" | "manage"
  bioLabel: string
  bioUsable: boolean
  onClose: () => void
  onSavePin: (pin: string) => Promise<void>
  onRemovePin: () => void
  checkPin: (pin: string) => Promise<boolean>
  verifyBiometric: () => Promise<boolean>
}) {
  const [step, setStep] = useState<
    "menu" | "verify" | "verify-pin" | "enter" | "confirm"
  >(initialMode === "setup" ? "enter" : "menu")
  const [pending, setPending] = useState<"change" | "remove" | null>(null)
  const [entry, setEntry] = useState("")
  const [firstPin, setFirstPin] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const resetEntry = () => setEntry("")

  const runVerifyBiometric = async () => {
    setBusy(true)
    setError("")
    const ok = await verifyBiometric()
    setBusy(false)
    if (!ok) {
      setError("Not verified — try again or use your PIN.")
      return
    }
    afterVerify()
  }

  const afterVerify = () => {
    resetEntry()
    setError("")
    if (pending === "remove") {
      onRemovePin()
    } else {
      setStep("enter")
    }
  }

  const submitCurrentPin = async () => {
    if (entry.length < 4) return
    setBusy(true)
    const ok = await checkPin(entry)
    setBusy(false)
    if (!ok) {
      setError("Wrong PIN — try again.")
      resetEntry()
      return
    }
    afterVerify()
  }

  const submitNewPin = () => {
    if (entry.length < 4) {
      setError("Use at least 4 digits.")
      return
    }
    setFirstPin(entry)
    resetEntry()
    setError("")
    setStep("confirm")
  }

  const submitConfirm = async () => {
    if (entry !== firstPin) {
      setError("PINs don’t match — start over.")
      resetEntry()
      setFirstPin("")
      setStep("enter")
      return
    }
    setBusy(true)
    await onSavePin(entry)
    setBusy(false)
  }

  const titles: Record<string, { title: string; hint: string }> = {
    menu: { title: "App PIN", hint: "A fallback unlock when biometrics fail." },
    verify: { title: "Confirm it’s you", hint: "Verify to continue." },
    "verify-pin": { title: "Enter current PIN", hint: "" },
    enter: { title: pending === "change" ? "New PIN" : "Set app PIN", hint: "At least 4 digits." },
    confirm: { title: "Confirm PIN", hint: "Enter it once more." },
  }
  const { title, hint } = titles[step]

  return (
    <ActionSheet title={title} onClose={onClose}>
      {hint && <p className="page-description pin-hint">{hint}</p>}
      {step === "menu" && (
        <div className="sheet-list">
          <Button
            className="sheet-row"
            onClick={() => {
              setPending("change")
              setStep("verify")
            }}
          >
            <Hash size={18} />
            Change app PIN
          </Button>
          <Button
            className="sheet-row sheet-row--danger"
            onClick={() => {
              setPending("remove")
              setStep("verify")
            }}
          >
            <Trash2 size={18} />
            Remove app PIN
          </Button>
        </div>
      )}
      {step === "verify" && (
        <div className="sheet-list">
          {bioUsable && (
            <Button
              className="sheet-row"
              disabled={busy}
              onClick={() => void runVerifyBiometric()}
            >
              <Fingerprint size={18} />
              Verify with {bioLabel}
            </Button>
          )}
          <Button
            className="sheet-row"
            onClick={() => {
              resetEntry()
              setError("")
              setStep("verify-pin")
            }}
          >
            <Hash size={18} />
            Use current PIN instead
          </Button>
        </div>
      )}
      {(step === "enter" || step === "confirm" || step === "verify-pin") && (
        <>
          <PinDots length={entry.length} />
          <PinPad
            onBackspace={() => {
              setError("")
              setEntry((current) => current.slice(0, -1))
            }}
            onDigit={(digit) =>
              setEntry((current) =>
                current.length < 12 ? current + digit : current,
              )
            }
          />
          {step !== "verify-pin" ? (
            <Button
              className="pin-continue"
              disabled={entry.length < 4 || busy}
              onClick={() =>
                step === "enter" ? submitNewPin() : void submitConfirm()
              }
              variant="primary"
            >
              Continue
            </Button>
          ) : (
            <Button
              className="pin-continue"
              disabled={entry.length < 4 || busy}
              onClick={() => void submitCurrentPin()}
              variant="primary"
            >
              Verify
            </Button>
          )}
        </>
      )}
      {error && (
        <p className="lock-error pin-error" role="alert">
          {error}
        </p>
      )}
      <p className="page-description pin-note">
        The PIN is a convenience gate for casual snooping — it is not
        encryption.
      </p>
    </ActionSheet>
  )
}

function LockScreen({
  bioLabel,
  bioUsable,
  canDisable,
  error,
  pinSet,
  onDisable,
  onErase,
  onUnlock,
  onPinUnlock,
}: {
  bioLabel: string
  bioUsable: boolean
  canDisable: boolean
  error: string
  pinSet: boolean
  onDisable: () => void
  onErase: () => void
  onUnlock: () => void
  onPinUnlock: (pin: string) => Promise<boolean>
}) {
  const [entry, setEntry] = useState("")
  const [pinError, setPinError] = useState("")
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  const failsRef = useRef(0)
  const autoTried = useRef(false)
  const onUnlockRef = useRef(onUnlock)
  onUnlockRef.current = onUnlock
  const cooling = now < cooldownUntil

  useEffect(() => {
    if (bioUsable && !autoTried.current) {
      autoTried.current = true
      void onUnlockRef.current()
    }
  }, [bioUsable])

  useEffect(() => {
    if (!cooling) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [cooling])

  const submitPin = (pin: string) => {
    if (pin.length < 4 || Date.now() < cooldownUntil) return
    void onPinUnlock(pin).then((ok) => {
      setEntry("")
      if (ok) {
        failsRef.current = 0
        return
      }
      failsRef.current += 1
      if (failsRef.current >= 5) {
        failsRef.current = 0
        setCooldownUntil(Date.now() + 30000)
        setPinError("Too many wrong PINs — wait 30 seconds.")
      } else {
        setPinError(`Wrong PIN — ${5 - failsRef.current} tries left.`)
      }
    })
  }

  useEffect(() => {
    if (entry.length < 4 || cooling) return
    const timer = window.setTimeout(() => submitPin(entry), 700)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, cooling])

  return (
    <main className="lock-screen">
      <div className="lock-glyph">
        <Fingerprint size={42} />
      </div>
      <h1>Grimoire</h1>
      {!pinSet && (
        <p>
          Locked. Use {bioLabel} or your device passcode to see your notes.
        </p>
      )}
      {error && (
        <p className="lock-error" role="alert">
          {error}
        </p>
      )}
      {pinSet ? (
        <>
          <p className="lock-sub">Enter your PIN{cooling ? "" : " or unlock another way"}.</p>
          <PinDots length={entry.length} />
          {pinError && (
            <p className="lock-error" role="alert">
              {pinError}
            </p>
          )}
          {cooling && (
            <p className="lock-error" role="alert">
              Try again in {Math.ceil((cooldownUntil - now) / 1000)}s.
            </p>
          )}
          <div className="lock-pin-wrap">
            <PinPad
              onBackspace={() => setEntry((current) => current.slice(0, -1))}
              onDigit={(digit) => {
                if (cooling) return
                setEntry((current) =>
                  current.length < 12 ? current + digit : current,
                )
                setPinError("")
              }}
            />
          </div>
          <div className="lock-actions lock-actions--pin">
            {bioUsable && (
              <Button className="lock-bio" onClick={onUnlock}>
                <Fingerprint size={18} />
                Use {bioLabel}
              </Button>
            )}
            <Button className="lock-erase" onClick={onErase}>
              Can’t unlock? Erase all notes
            </Button>
          </div>
        </>
      ) : (
        <div className="lock-actions">
          <Button className="lock-unlock" onClick={onUnlock} variant="primary">
            <Fingerprint size={20} />
            Unlock
          </Button>
          {canDisable ? (
            <Button className="lock-erase" onClick={onDisable}>
              This device has no lock method — turn lock off
            </Button>
          ) : (
            <Button className="lock-erase" onClick={onErase}>
              Can’t unlock? Erase all notes
            </Button>
          )}
        </div>
      )}
    </main>
  )
}

function ActionSheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const containerRef = useRef<HTMLElement>(null)
  useDialogFocus(containerRef, onClose)
  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section
        aria-label={title}
        aria-modal="true"
        className="action-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        ref={containerRef}
        role="dialog"
      >
        <div className="sheet-handle" />
        <header className="sheet-header">
          <Title as="h2">{title}</Title>
          <IconButton data-autofocus label="Close" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        <div className="sheet-content">{children}</div>
      </section>
    </div>
  )
}

function ConfirmDialog({
  confirm,
  onCancel,
}: {
  confirm: ConfirmState
  onCancel: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useDialogFocus(containerRef, onCancel)
  return (
    <div className="sheet-backdrop" onMouseDown={onCancel}>
      <div
        aria-label={confirm.title}
        aria-modal="true"
        className="confirm-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={containerRef}
        role="alertdialog"
      >
        <Title as="h2">{confirm.title}</Title>
        <p>{confirm.message}</p>
        <div className="confirm-actions">
          <Button data-autofocus onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              confirm.onConfirm()
              onCancel()
            }}
            variant={confirm.danger ? "danger" : "primary"}
          >
            {confirm.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastState
  onDismiss: () => void
}) {
  return (
    <div className="toast" role="status">
      <Check size={16} />
      <span>{toast.message}</span>
      {toast.onAction && (
        <button className="toast-action" onClick={toast.onAction}>
          <Undo2 size={14} />
          {toast.actionLabel ?? "Undo"}
        </button>
      )}
      <button aria-label="Dismiss" className="toast-dismiss" onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  )
}
