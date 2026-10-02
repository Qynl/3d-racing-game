import { CarInput } from "./car";
import { clamp } from "./noise";

export type InputAction = "pause" | "restart" | "respawn" | "camera" | "mute" | "confirm" | "back";

export interface TouchState {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
  boost: boolean;
  handbrake: boolean;
  /** -1..1 from the analog steering pad, or null when unused. */
  axis: number | null;
}

export interface ReadOptions {
  /** Multiplies keyboard/touch steering authority. */
  sensitivity: number;
  /** Allow tilt steering to contribute. */
  tilt: boolean;
}

const KEYS_TO_SWALLOW = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "shift"]);

export class InputManager {
  keys = new Set<string>();
  touch: TouchState = {
    left: false,
    right: false,
    gas: false,
    brake: false,
    boost: false,
    handbrake: false,
    axis: null,
  };
  /** Device-orientation steering, -1..1. */
  tiltAxis = 0;
  tiltAvailable = false;
  gamepadConnected = false;
  /** True while the player is holding the look-behind control. */
  lookBack = false;
  /** When false we never call preventDefault — keeps menus keyboard-accessible. */
  captureKeys = false;

  onAction: ((action: InputAction) => void) | null = null;
  onGamepadChange: ((connected: boolean) => void) | null = null;

  private steerSmoothed = 0;
  private tiltZero: number | null = null;
  private padIndex: number | null = null;
  private prevPadButtons: boolean[] = [];

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    const target = e.target as HTMLElement | null;
    const typing =
      !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (typing) return;
    // Only swallow gameplay keys while actually driving, so menus stay usable
    // (space/enter must keep activating focused buttons).
    if (this.captureKeys && KEYS_TO_SWALLOW.has(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    if (k === "escape") this.onAction?.(this.captureKeys ? "pause" : "back");
    else if (k === "p") this.onAction?.("pause");
    else if (k === "r") this.onAction?.(this.captureKeys ? "respawn" : "restart");
    else if (k === "c") this.onAction?.("camera");
    else if (k === "m") this.onAction?.("mute");
    else if (k === "enter" && !this.captureKeys) {
      // Let Enter activate a focused button instead of double-firing.
      const active = document.activeElement;
      if (!active || active === document.body) this.onAction?.("confirm");
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = () => {
    this.keys.clear();
    this.resetTouch();
  };

  private onGamepadConnected = (e: GamepadEvent) => {
    this.padIndex = e.gamepad.index;
    this.gamepadConnected = true;
    this.onGamepadChange?.(true);
  };

  private onGamepadDisconnected = (e: GamepadEvent) => {
    if (this.padIndex === e.gamepad.index) {
      this.padIndex = null;
      this.gamepadConnected = false;
      this.onGamepadChange?.(false);
    }
  };

  private onOrientation = (e: DeviceOrientationEvent) => {
    if (e.gamma === null || e.gamma === undefined) return;
    this.tiltAvailable = true;
    const portrait = Math.abs(window.orientation ?? 0) !== 90;
    const raw = portrait ? e.gamma : (e.beta ?? 0) * (((window.orientation as number) ?? 0) > 0 ? -1 : 1);
    if (this.tiltZero === null) this.tiltZero = raw;
    this.tiltAxis = clamp((raw - this.tiltZero) / 26, -1, 1);
  };

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("gamepadconnected", this.onGamepadConnected);
    window.addEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    window.addEventListener("deviceorientation", this.onOrientation);
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("gamepadconnected", this.onGamepadConnected);
    window.removeEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    window.removeEventListener("deviceorientation", this.onOrientation);
  }

  resetTouch() {
    this.touch.left = false;
    this.touch.right = false;
    this.touch.gas = false;
    this.touch.brake = false;
    this.touch.boost = false;
    this.touch.handbrake = false;
    this.touch.axis = null;
  }

  /** Re-zero tilt steering to however the phone is being held right now. */
  calibrateTilt() {
    this.tiltZero = null;
  }

  /** iOS requires a user gesture before motion events are delivered. */
  async requestTiltPermission(): Promise<boolean> {
    const anyDO = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof anyDO?.requestPermission !== "function") return true;
    try {
      const res = await anyDO.requestPermission();
      return res === "granted";
    } catch {
      return false;
    }
  }

  rumble(strength: number, ms: number) {
    if (this.padIndex === null) return;
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads[this.padIndex];
    const actuator = (
      pad as unknown as {
        vibrationActuator?: {
          playEffect(type: string, opts: Record<string, number>): Promise<unknown>;
        };
      }
    )?.vibrationActuator;
    if (!actuator?.playEffect) return;
    void actuator
      .playEffect("dual-rumble", {
        duration: ms,
        strongMagnitude: clamp(strength, 0, 1),
        weakMagnitude: clamp(strength * 0.7, 0, 1),
      })
      .catch(() => undefined);
  }

  read(dt: number, opts: ReadOptions): CarInput {
    const k = this.keys;
    const sens = opts.sensitivity;
    let steerTarget = 0;
    if (k.has("arrowleft") || k.has("a") || this.touch.left) steerTarget -= 1;
    if (k.has("arrowright") || k.has("d") || this.touch.right) steerTarget += 1;
    let throttle = k.has("arrowup") || k.has("w") || this.touch.gas ? 1 : 0;
    let brake = k.has("arrowdown") || k.has("s") || this.touch.brake ? 1 : 0;
    let handbrake = k.has(" ") || this.touch.handbrake;
    let boost = k.has("shift") || this.touch.boost;
    this.lookBack = k.has("b");

    let analog = false;
    if (this.touch.axis !== null) {
      steerTarget = clamp(this.touch.axis, -1, 1);
      analog = true;
    } else if (opts.tilt && this.tiltAvailable) {
      steerTarget = clamp(this.tiltAxis, -1, 1);
      analog = true;
    }

    // ---- gamepad
    const pads = navigator.getGamepads?.() ?? [];
    let pad: Gamepad | null = null;
    if (this.padIndex !== null) pad = pads[this.padIndex] ?? null;
    if (!pad) {
      for (const p of pads) {
        if (p) {
          pad = p;
          this.padIndex = p.index;
          if (!this.gamepadConnected) {
            this.gamepadConnected = true;
            this.onGamepadChange?.(true);
          }
          break;
        }
      }
    }
    if (pad) {
      const dead = 0.12;
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > dead) {
        const scaled = (Math.abs(ax) - dead) / (1 - dead);
        steerTarget = clamp(Math.sign(ax) * scaled, -1, 1);
        analog = true;
      }
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      if (rt > 0.05) throttle = Math.max(throttle, rt);
      if (lt > 0.05) brake = Math.max(brake, lt);
      if (pad.buttons[0]?.pressed) throttle = 1;
      if (pad.buttons[1]?.pressed) handbrake = true;
      if (pad.buttons[2]?.pressed || pad.buttons[5]?.pressed) boost = true;
      if (pad.buttons[4]?.pressed) this.lookBack = true;

      const edge = (i: number) => {
        const now = !!pad!.buttons[i]?.pressed;
        const was = this.prevPadButtons[i] ?? false;
        this.prevPadButtons[i] = now;
        return now && !was;
      };
      if (edge(9)) this.onAction?.("pause");
      if (edge(8)) this.onAction?.(this.captureKeys ? "respawn" : "restart");
      if (edge(3)) this.onAction?.("camera");
      // keep edge state fresh for buttons we poll but don't edge-trigger
      for (const i of [0, 1, 2, 4, 5, 6, 7]) this.prevPadButtons[i] = !!pad.buttons[i]?.pressed;
    }

    if (analog) {
      this.steerSmoothed = clamp(steerTarget * sens, -1, 1);
    } else {
      const target = steerTarget * Math.min(1, sens);
      const rate = (steerTarget !== 0 ? 5.5 : 9) * sens;
      const diff = target - this.steerSmoothed;
      const maxStep = rate * dt;
      this.steerSmoothed += clamp(diff, -maxStep, maxStep);
    }
    return {
      throttle,
      brake,
      steer: clamp(this.steerSmoothed, -1, 1),
      handbrake,
      boost,
    };
  }

  reset() {
    this.steerSmoothed = 0;
    this.lookBack = false;
    this.resetTouch();
  }
}
