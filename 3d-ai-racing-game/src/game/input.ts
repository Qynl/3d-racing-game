import { CarInput } from "./car";
import { clamp } from "./noise";

export interface TouchState {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
}

export class InputManager {
  keys = new Set<string>();
  touch: TouchState = { left: false, right: false, gas: false, brake: false };
  private steerSmoothed = 0;
  onAction: ((action: "pause" | "restart" | "camera" | "mute") => void) | null = null;
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    if (k === "escape" || k === "p") this.onAction?.("pause");
    if (k === "r") this.onAction?.("restart");
    if (k === "c") this.onAction?.("camera");
    if (k === "m") this.onAction?.("mute");
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private onBlur = () => {
    this.keys.clear();
  };

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  read(dt: number): CarInput {
    const k = this.keys;
    let steerTarget = 0;
    if (k.has("arrowleft") || k.has("a") || this.touch.left) steerTarget -= 1;
    if (k.has("arrowright") || k.has("d") || this.touch.right) steerTarget += 1;
    let throttle = k.has("arrowup") || k.has("w") || this.touch.gas ? 1 : 0;
    let brake = k.has("arrowdown") || k.has("s") || this.touch.brake ? 1 : 0;
    const handbrake = k.has(" ") || k.has("shift");

    // gamepad
    let analog = false;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p) continue;
        const ax = p.axes[0] || 0;
        if (Math.abs(ax) > 0.12) {
          steerTarget = clamp(ax, -1, 1);
          analog = true;
        }
        const rt = p.buttons[7]?.value || 0;
        const lt = p.buttons[6]?.value || 0;
        if (rt > 0.05) throttle = Math.max(throttle, rt);
        if (lt > 0.05) brake = Math.max(brake, lt);
        if (p.buttons[0]?.pressed) throttle = Math.max(throttle, 1);
        if (p.buttons[1]?.pressed) brake = Math.max(brake, 1);
        break;
      }
    } catch {
      /* ignore */
    }

    if (analog) {
      this.steerSmoothed = steerTarget;
    } else {
      const rate = steerTarget !== 0 ? 5.5 : 9;
      const diff = steerTarget - this.steerSmoothed;
      const maxStep = rate * dt;
      this.steerSmoothed += clamp(diff, -maxStep, maxStep);
    }
    return { throttle, brake, steer: clamp(this.steerSmoothed, -1, 1), handbrake };
  }

  reset() {
    this.steerSmoothed = 0;
  }
}
