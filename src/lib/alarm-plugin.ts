import { registerPlugin } from "@capacitor/core"
import type { AlarmPlugin } from "./alarm-definitions"

const Alarm = registerPlugin<AlarmPlugin>("Alarm", {
  web: () => import("./alarm-web").then((module) => new module.AlarmWeb()),
})

export default Alarm
