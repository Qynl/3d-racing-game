import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Noise, mulberry32 } from "./noise";
import { Track, makeCheckerTexture } from "./track";
import { Terrain, WORLD_RADIUS } from "./terrain";

export interface Collider {
  x: number;
  z: number;
  r: number;
}

export interface PropsResult {
  group: THREE.Group;
  colliders: Collider[];
}

function makeRockGeometry(noise: Noise, seed: number, detail: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g = mergeVertices(g);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const ox = rand() * 100;
  const oz = rand() * 100;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = noise.n2(x * 1.3 + y * 0.7 + ox, z * 1.3 - y * 0.9 + oz);
    const s = 1 + n * 0.32 + (rand() - 0.5) * 0.12;
    pos.setXYZ(i, x * s, y * s * 0.72, z * s);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

function makeCactusGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.26, 0.36, 3.4, 8);
  trunk.translate(0, 1.7, 0);
  parts.push(trunk);
  const topCap = new THREE.SphereGeometry(0.26, 8, 6);
  topCap.translate(0, 3.4, 0);
  parts.push(topCap);
  const arm = (side: number, h: number, len: number) => {
    const horiz = new THREE.CylinderGeometry(0.18, 0.2, 0.8, 7);
    horiz.rotateZ(Math.PI / 2);
    horiz.translate(side * 0.55, h, 0);
    const vert = new THREE.CylinderGeometry(0.17, 0.2, len, 7);
    vert.translate(side * 0.92, h + len / 2 - 0.1, 0);
    const cap = new THREE.SphereGeometry(0.17, 7, 5);
    cap.translate(side * 0.92, h + len - 0.1, 0);
    const elbow = new THREE.SphereGeometry(0.2, 7, 5);
    elbow.translate(side * 0.92, h, 0);
    parts.push(horiz, vert, cap, elbow);
  };
  arm(1, 1.5, 1.5);
  arm(-1, 2.0, 1.1);
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

function makeShrubGeometry(seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
  g = mergeVertices(g);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const s = 0.8 + rand() * 0.4;
    pos.setXYZ(i, pos.getX(i) * s, Math.max(pos.getY(i) * s * 0.6, -0.1), pos.getZ(i) * s);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

function makeMesaGeometry(
  noise: Noise,
  seed: number,
  rTop: number,
  rBot: number,
  h: number,
): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  let g: THREE.BufferGeometry = new THREE.CylinderGeometry(rTop, rBot, h, 11, 4, false);
  g = mergeVertices(g);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const ox = rand() * 50;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const rr = Math.sqrt(x * x + z * z);
    if (rr > 0.5) {
      const n = noise.n2(Math.cos(ang) * 2.2 + ox, Math.sin(ang) * 2.2 + y * 0.08);
      const s = 1 + n * 0.14;
      pos.setXYZ(i, x * s, y + (rand() - 0.5) * 0.8, z * s);
    }
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  // strata colors per face
  const count = pos.count;
  const p2 = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(count * 3);
  const bands = [
    new THREE.Color(0x9a5a46),
    new THREE.Color(0xb5745a),
    new THREE.Color(0x8a4d3f),
    new THREE.Color(0xc48a68),
  ];
  const top = new THREE.Color(0xc99a72);
  const c = new THREE.Color();
  for (let f = 0; f < count / 3; f++) {
    const y = (p2.getY(f * 3) + p2.getY(f * 3 + 1) + p2.getY(f * 3 + 2)) / 3;
    const ny = Math.abs(
      new THREE.Vector3()
        .subVectors(
          new THREE.Vector3(p2.getX(f * 3 + 1), p2.getY(f * 3 + 1), p2.getZ(f * 3 + 1)),
          new THREE.Vector3(p2.getX(f * 3), p2.getY(f * 3), p2.getZ(f * 3)),
        )
        .cross(
          new THREE.Vector3().subVectors(
            new THREE.Vector3(p2.getX(f * 3 + 2), p2.getY(f * 3 + 2), p2.getZ(f * 3 + 2)),
            new THREE.Vector3(p2.getX(f * 3), p2.getY(f * 3), p2.getZ(f * 3)),
          ),
        )
        .normalize().y,
    );
    const band = bands[Math.floor(((y + h / 2) / h) * 7) % bands.length];
    c.copy(ny > 0.7 ? top : band);
    const v = 0.94 + rand() * 0.12;
    for (let k = 0; k < 3; k++) {
      colors[(f * 3 + k) * 3] = c.r * v;
      colors[(f * 3 + k) * 3 + 1] = c.g * v;
      colors[(f * 3 + k) * 3 + 2] = c.b * v;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

export function buildProps(
  noise: Noise,
  track: Track,
  terrain: Terrain,
  seed: number,
  density = 1,
): PropsResult {
  const rand = mulberry32(seed);
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const hw = track.halfWidth;
  const dens = Math.max(0.15, density);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const startP = track.points[0];

  const nearStart = (x: number, z: number, r: number) => {
    const dx = x - startP.x;
    const dz = z - startP.z;
    return dx * dx + dz * dz < r * r;
  };

  // ---------- Rocks
  const rockGeos = [
    makeRockGeometry(noise, 11, 1),
    makeRockGeometry(noise, 23, 1),
    makeRockGeometry(noise, 37, 2),
  ];
  const rockMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02, flatShading: true });
  const rockPalette = [0x9c6a52, 0x8d7466, 0xa87a5e, 0x7d5a4c, 0xb08a6c];
  const rocksPerVariant = Math.round(210 * dens);
  for (let v = 0; v < rockGeos.length; v++) {
    const mesh = new THREE.InstancedMesh(rockGeos[v], rockMat, rocksPerVariant);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    let placed = 0;
    let tries = 0;
    while (placed < rocksPerVariant && tries < rocksPerVariant * 20) {
      tries++;
      const ang = rand() * Math.PI * 2;
      const rad = 20 + Math.sqrt(rand()) * (WORLD_RADIUS - 10);
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const d = terrain.trackInfoAt(x, z).lateral;
      const isClose = d < 40;
      const big = rand() < 0.18;
      const s = big ? 2.2 + rand() * 2.8 : 0.5 + rand() * 1.4;
      // prefer rocks closer to the track for visual interest, but never on it
      if (d < hw + 1.6 + s * 1.05) continue;
      if (nearStart(x, z, 40)) continue;
      if (!isClose && rand() < 0.35) continue;
      const y = terrain.getHeight(x, z) - s * 0.25;
      dummy.position.set(x, y, z);
      dummy.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI * 2, (rand() - 0.5) * 0.3);
      dummy.scale.set(s * (0.8 + rand() * 0.4), s * (0.7 + rand() * 0.5), s * (0.8 + rand() * 0.4));
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      col.setHex(rockPalette[Math.floor(rand() * rockPalette.length)]);
      col.multiplyScalar(0.9 + rand() * 0.2);
      mesh.setColorAt(placed, col);
      if (s > 1.0 && d < 32) colliders.push({ x, z, r: s * 0.85 });
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  // ---------- Cacti
  const cactusGeo = makeCactusGeometry();
  const cactusMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  const cactusCount = Math.round(170 * dens);
  const cactusMesh = new THREE.InstancedMesh(cactusGeo, cactusMat, cactusCount);
  cactusMesh.castShadow = true;
  cactusMesh.receiveShadow = true;
  {
    let placed = 0;
    let tries = 0;
    while (placed < cactusCount && tries < cactusCount * 20) {
      tries++;
      const ang = rand() * Math.PI * 2;
      const rad = 30 + Math.sqrt(rand()) * (WORLD_RADIUS - 40);
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const d = terrain.trackInfoAt(x, z).lateral;
      if (d < hw + 3) continue;
      if (nearStart(x, z, 40)) continue;
      const h = terrain.getHeight(x, z);
      if (h > 34) continue;
      const s = 0.7 + rand() * 0.8;
      dummy.position.set(x, h - 0.1, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      cactusMesh.setMatrixAt(placed, dummy.matrix);
      col.setHex(rand() < 0.5 ? 0x5e7a4b : 0x6c8757);
      col.multiplyScalar(0.9 + rand() * 0.2);
      cactusMesh.setColorAt(placed, col);
      if (d < 30) colliders.push({ x, z, r: 0.55 * s });
      placed++;
    }
    cactusMesh.count = placed;
    cactusMesh.instanceMatrix.needsUpdate = true;
    if (cactusMesh.instanceColor) cactusMesh.instanceColor.needsUpdate = true;
    group.add(cactusMesh);
  }

  // ---------- Shrubs
  const shrubGeo = makeShrubGeometry(5);
  const shrubMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
  const shrubCount = Math.round(650 * dens);
  const shrubMesh = new THREE.InstancedMesh(shrubGeo, shrubMat, shrubCount);
  shrubMesh.castShadow = true;
  shrubMesh.receiveShadow = true;
  {
    let placed = 0;
    let tries = 0;
    const palette = [0x8c8a58, 0x9a9262, 0x7f8a5a, 0xa39a6a, 0x6f7a4e];
    while (placed < shrubCount && tries < shrubCount * 10) {
      tries++;
      const ang = rand() * Math.PI * 2;
      const rad = 15 + Math.sqrt(rand()) * (WORLD_RADIUS - 20);
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const d = terrain.trackInfoAt(x, z).lateral;
      if (d < hw + 1.6) continue;
      if (nearStart(x, z, 30)) continue;
      const h = terrain.getHeight(x, z);
      if (h > 40) continue;
      const s = 0.5 + rand() * 1.1;
      dummy.position.set(x, h + s * 0.15, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(s, s * (0.7 + rand() * 0.4), s);
      dummy.updateMatrix();
      shrubMesh.setMatrixAt(placed, dummy.matrix);
      col.setHex(palette[Math.floor(rand() * palette.length)]);
      col.multiplyScalar(0.88 + rand() * 0.24);
      shrubMesh.setColorAt(placed, col);
      placed++;
    }
    shrubMesh.count = placed;
    shrubMesh.instanceMatrix.needsUpdate = true;
    if (shrubMesh.instanceColor) shrubMesh.instanceColor.needsUpdate = true;
    group.add(shrubMesh);
  }

  // ---------- Mesas
  {
    const mesaMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      flatShading: true,
    });
    const placedMesas: { x: number; z: number; r: number }[] = [];
    let tries = 0;
    let idx = 0;
    while (placedMesas.length < Math.round(7 * Math.min(1.3, dens)) && tries < 400) {
      tries++;
      const ang = rand() * Math.PI * 2;
      const rad = 60 + rand() * 170;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const rBot = 22 + rand() * 26;
      const rTop = rBot * (0.55 + rand() * 0.25);
      const h = 18 + rand() * 24;
      const near = track.nearest(x, z, rBot + 30);
      if (near.index >= 0 && near.dist < rBot + 14) continue;
      if (nearStart(x, z, rBot + 50)) continue;
      let overlap = false;
      for (const m of placedMesas) {
        const dx = m.x - x;
        const dz = m.z - z;
        if (Math.sqrt(dx * dx + dz * dz) < m.r + rBot + 10) overlap = true;
      }
      if (overlap) continue;
      const geo = makeMesaGeometry(noise, 100 + idx, rTop, rBot, h);
      const mesh = new THREE.Mesh(geo, mesaMat);
      mesh.position.set(x, terrain.getHeight(x, z) + h / 2 - 6, z);
      mesh.rotation.y = rand() * Math.PI * 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      placedMesas.push({ x, z, r: rBot });
      colliders.push({ x, z, r: rBot * 0.92 });
      idx++;
    }
  }

  // ---------- Track posts
  {
    const postGeo = new THREE.CylinderGeometry(0.11, 0.14, 1.1, 6);
    postGeo.translate(0, 0.55, 0);
    const postMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const every = 24;
    const n = Math.floor(track.count / every) * 2;
    const posts = new THREE.InstancedMesh(postGeo, postMat, n);
    posts.castShadow = true;
    let k = 0;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < track.count; i += every) {
      for (const side of [-1, 1]) {
        track.offsetPoint(i, side * (hw + 1.0), tmp);
        dummy.position.set(tmp.x, terrain.getHeight(tmp.x, tmp.z), tmp.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        posts.setMatrixAt(k, dummy.matrix);
        col.setHex((i / every) % 2 === 0 ? 0xede4d3 : 0xb5473a);
        posts.setColorAt(k, col);
        k++;
      }
    }
    posts.count = k;
    posts.instanceMatrix.needsUpdate = true;
    if (posts.instanceColor) posts.instanceColor.needsUpdate = true;
    group.add(posts);
  }

  // ---------- Tire barriers on the outside of corners
  {
    const tireGeo = new THREE.TorusGeometry(0.55, 0.24, 7, 12);
    tireGeo.rotateX(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.9 });
    const spots: { i: number; side: number }[] = [];
    for (let i = 0; i < track.count; i += 5) {
      const k = track.curvature[i];
      if (Math.abs(k) > 1 / 48) spots.push({ i, side: k > 0 ? -1 : 1 });
    }
    const tires = new THREE.InstancedMesh(tireGeo, tireMat, spots.length * 2);
    tires.castShadow = true;
    tires.receiveShadow = true;
    const tmp = new THREE.Vector3();
    let k = 0;
    for (const s of spots) {
      track.offsetPoint(s.i, s.side * (hw + 2.4), tmp);
      const y = terrain.getHeight(tmp.x, tmp.z);
      for (let level = 0; level < 2; level++) {
        dummy.position.set(tmp.x, y + 0.25 + level * 0.46, tmp.z);
        dummy.rotation.set(0, rand() * Math.PI, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        tires.setMatrixAt(k, dummy.matrix);
        col.setHex(level === 0 ? 0x2b2a28 : rand() < 0.3 ? 0xe4dccb : 0x2b2a28);
        tires.setColorAt(k, col);
        k++;
      }
      colliders.push({ x: tmp.x, z: tmp.z, r: 0.95 });
    }
    tires.count = k;
    tires.instanceMatrix.needsUpdate = true;
    if (tires.instanceColor) tires.instanceColor.needsUpdate = true;
    group.add(tires);
  }

  // ---------- Start gate
  {
    const gate = new THREE.Group();
    const p = track.points[0];
    const y = terrain.getHeight(p.x, p.z);
    gate.position.set(p.x, y, p.z);
    gate.rotation.y = track.yawAt(0);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.6, metalness: 0.3 });
    const pillarGeo = new THREE.BoxGeometry(0.9, 7.5, 0.9);
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(side * (hw + 1.6), 3.75, 0);
      pillar.castShadow = true;
      gate.add(pillar);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), pillarMat);
      base.position.set(side * (hw + 1.6), 0.25, 0);
      base.castShadow = true;
      gate.add(base);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 4.1, 1.5, 0.9), pillarMat);
    beam.position.set(0, 7.2, 0);
    beam.castShadow = true;
    gate.add(beam);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2 + 3.2, 1.2),
      new THREE.MeshStandardMaterial({
        map: makeCheckerTexture(24, 2),
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    banner.position.set(0, 7.2, 0.46);
    gate.add(banner);
    const banner2 = banner.clone();
    banner2.position.z = -0.46;
    banner2.rotation.y = Math.PI;
    gate.add(banner2);
    // small flags on the beam
    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xc2553a,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const flagMat2 = new THREE.MeshStandardMaterial({
      color: 0xe9e2d2,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    for (let i = -3; i <= 3; i++) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), pillarMat);
      pole.position.set(i * 2.6, 8.7, 0);
      gate.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), i % 2 === 0 ? flagMat : flagMat2);
      flag.position.set(i * 2.6 + 0.47, 9.2, 0);
      gate.add(flag);
    }
    group.add(gate);
  }

  // ---------- Grandstand near start
  {
    const stand = new THREE.Group();
    const i0 = (track.count - 40 + track.count) % track.count;
    const tmp = new THREE.Vector3();
    track.offsetPoint(i0, -(hw + 9), tmp);
    const y = terrain.getHeight(tmp.x, tmp.z);
    stand.position.set(tmp.x, y, tmp.z);
    stand.rotation.y = track.yawAt(i0);
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8a7d70, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xb8502f, roughness: 0.7 });
    for (let t = 0; t < 4; t++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(26, 1.0, 2.4), concrete);
      tier.position.set(0, 0.5 + t * 1.0, -t * 2.2);
      tier.castShadow = true;
      tier.receiveShadow = true;
      stand.add(tier);
    }
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(27, 7, 10.5), concrete);
    foundation.position.set(0, -3.4, -3.3);
    foundation.receiveShadow = true;
    stand.add(foundation);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(27, 0.3, 10), roofMat);
    roof.position.set(0, 7, -3.5);
    roof.rotation.x = 0.12;
    roof.castShadow = true;
    stand.add(roof);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.6 });
    for (const sx of [-12.5, 0, 12.5]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 6), poleMat);
      pole.position.set(sx, 3.5, -8);
      stand.add(pole);
    }
    // spectators
    const crowdGeo = new THREE.CapsuleGeometry(0.22, 0.6, 2, 6);
    crowdGeo.translate(0, 0.5, 0);
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const crowdCount = Math.round(120 * dens);
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdCount);
    crowd.castShadow = true;
    const crowdPalette = [0xd9c7a9, 0x6c4a3a, 0x3e4a5c, 0xb5473a, 0x5f6e4a, 0xe3d6c0, 0x2f2f33, 0xd1a03c];
    for (let i = 0; i < crowdCount; i++) {
      const t = Math.floor(rand() * 4);
      dummy.position.set((rand() - 0.5) * 24, 1.0 + t * 1.0, -t * 2.2 + (rand() - 0.5) * 0.8);
      dummy.rotation.set(0, (rand() - 0.5) * 0.6, 0);
      const s = 0.9 + rand() * 0.25;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
      col.setHex(crowdPalette[Math.floor(rand() * crowdPalette.length)]);
      crowd.setColorAt(i, col);
    }
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    stand.add(crowd);
    group.add(stand);
    for (let k = -2; k <= 2; k++) {
      const idx = (i0 + k * 8 + track.count) % track.count;
      track.offsetPoint(idx, -(hw + 9.5), tmp);
      colliders.push({ x: tmp.x, z: tmp.z, r: 4.2 });
    }
  }

  return { group, colliders };
}
