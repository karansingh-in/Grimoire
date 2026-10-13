import { WebPlugin } from "@capacitor/core"
import type { AlarmPlugin } from "./alarm-definitions"

/** Web preview: alarms need the installed app, so this is a silent no-op. */
export class AlarmWeb extends WebPlugin implements AlarmPlugin {
  async schedule(): Promise<void> {}
  async cancel(): Promise<void> {}
  async ping(): Promise<void> {}
  async status(): Promise<{ exact: boolean; notifications: boolean }> {
    return { exact: false, notifications: false }
  }
  async openAppSettings(): Promise<void> {}
}
