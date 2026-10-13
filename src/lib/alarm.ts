import { Preferences } from "@capacitor/preferences"
import Alarm from "./alarm-plugin"
import type { PersistedState } from "../types"

const MIRROR_KEY = "grimoire-reminders"
const PENDING_KEY = "grimoire-pending-note"

type MirrorEntry = { id: string; at: number; title: string }

const tracked = new Set<string>()

function upcoming(state: PersistedState): MirrorEntry[] {
  const now = Date.now()
  return state.notes
    .filter(
      (note) =>
        note.status === "active" &&
        note.reminderAt &&
        new Date(note.reminderAt).getTime() > now,
    )
    .map((note) => ({
      id: note.id,
      at: new Date(note.reminderAt as string).getTime(),
      title: note.title || "Untitled note",
    }))
}

/** Mirror future reminders where the native boot receiver can read them. */
export async function mirrorReminders(state: PersistedState): Promise<void> {
  try {
    await Preferences.set({
      key: MIRROR_KEY,
      value: JSON.stringify(upcoming(state)),
    })
  } catch {
    // Mirror is best effort; the in-app schedule is authoritative.
  }
}

/** Idempotent: same IDs overwrite, stale ones are cancelled. */
export async function resyncAlarms(state: PersistedState): Promise<void> {
  const live = new Set<string>()
  try {
    for (const entry of upcoming(state)) {
      live.add(entry.id)
      tracked.add(entry.id)
      await Alarm.schedule(entry)
    }
    for (const id of tracked) {
      if (!live.has(id)) {
        tracked.delete(id)
        await Alarm.cancel({ id })
      }
    }
  } catch {
    // Alarms need the native bridge; the reminders list still works.
  }
}

/** Note id left by the alarm receiver, if any. Consumes it. */
export async function takePendingNote(): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: PENDING_KEY })
    if (!value) return null
    await Preferences.remove({ key: PENDING_KEY })
    return value
  } catch {
    return null
  }
}
