import type { Track } from "./track";

export interface MinimapBounds {
  minX: number;
  minZ: number;
  scale: number;
  offX: number;
  offZ: number;
}

/** Anything with a world position and heading can be drawn on the map. */
export interface MinimapEntity {
  color: number;
  physics: { pos: { x: number; z: number }; yaw: number };
}

export interface MinimapScene {
  track: Track;
  cars: MinimapEntity[];
  player: MinimapEntity | null;
  /** World position of the ghost car, when one is visible. */
  ghost: { x: number; z: number } | null;
}

/** Fits the whole circuit into a canvas of `w` x `h` with a small margin. */
export function computeMinimapBounds(track: Track, w: number, h: number, pad = 16): MinimapBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of track.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanZ = Math.max(1e-6, maxZ - minZ);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
  return {
    minX,
    minZ,
    scale,
    offX: (w - spanX * scale) / 2,
    offZ: (h - spanZ * scale) / 2,
  };
}

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

/** Draws the circuit, sector ticks, rivals, ghost and the player arrow. */
export function drawMinimap(canvas: HTMLCanvasElement, scene: MinimapScene, bounds: MinimapBounds): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { track, cars, player, ghost } = scene;
  const W = canvas.width;
  const H = canvas.height;
  const sx = (x: number) => bounds.offX + (x - bounds.minX) * bounds.scale;
  const sz = (z: number) => bounds.offZ + (z - bounds.minZ) * bounds.scale;

  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const pts = track.points;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 4) {
    const x = sx(pts[i].x);
    const z = sz(pts[i].z);
    if (i === 0) ctx.moveTo(x, z);
    else ctx.lineTo(x, z);
  }
  ctx.closePath();
  ctx.strokeStyle = "rgba(30, 20, 14, 0.6)";
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = "rgba(236, 214, 178, 0.95)";
  ctx.lineWidth = 5;
  ctx.stroke();

  // sector ticks
  for (const s of track.sectorStarts) {
    const p = pts[s];
    const r = track.rights[s];
    ctx.beginPath();
    ctx.moveTo(sx(p.x - r.x * 7), sz(p.z - r.z * 7));
    ctx.lineTo(sx(p.x + r.x * 7), sz(p.z + r.z * 7));
    ctx.strokeStyle = "rgba(42,37,34,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // start line
  const p0 = pts[0];
  const r0 = track.rights[0];
  ctx.beginPath();
  ctx.moveTo(sx(p0.x - r0.x * 10), sz(p0.z - r0.z * 10));
  ctx.lineTo(sx(p0.x + r0.x * 10), sz(p0.z + r0.z * 10));
  ctx.strokeStyle = "#2a2522";
  ctx.lineWidth = 3;
  ctx.stroke();

  if (ghost) {
    ctx.beginPath();
    ctx.arc(sx(ghost.x), sz(ghost.z), 3.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(159,214,255,0.85)";
    ctx.fill();
  }

  for (const e of cars) {
    if (e === player) continue;
    ctx.beginPath();
    ctx.arc(sx(e.physics.pos.x), sz(e.physics.pos.z), 4.5, 0, Math.PI * 2);
    ctx.fillStyle = hex(e.color);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(20,14,10,0.8)";
    ctx.stroke();
  }

  if (!player) return;
  ctx.save();
  ctx.translate(sx(player.physics.pos.x), sz(player.physics.pos.z));
  ctx.rotate(-player.physics.yaw + Math.PI);
  ctx.beginPath();
  ctx.moveTo(0, -7.5);
  ctx.lineTo(5.2, 5.5);
  ctx.lineTo(0, 2.6);
  ctx.lineTo(-5.2, 5.5);
  ctx.closePath();
  ctx.fillStyle = hex(player.color);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fff6e8";
  ctx.stroke();
  ctx.restore();
}
