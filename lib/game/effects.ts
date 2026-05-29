import * as THREE from 'three';
import { TouchIndicator } from './types';

// ============================================================================
// EFFECTS SYSTEM - Efectos visuales, texto flotante, indicadores
// ============================================================================

export interface FloatingText {
  id: string;
  text: string;
  color: string;
  size: number;
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  age: number;
  maxAge: number;
}

export interface ActiveEffect {
  id: string;
  type: string;
  mesh: THREE.Object3D;
  age: number;
  maxAge: number;
  x: number;
  z: number;
}

export interface TouchIndicatorInstance {
  id: string;
  data: TouchIndicator;
  mesh: THREE.Mesh;
}

export class EffectsSystem {
  private scene: THREE.Scene;
  private floatingTexts: FloatingText[] = [];
  private activeEffects: ActiveEffect[] = [];
  private touchIndicators: TouchIndicatorInstance[] = [];
  private effectMeshes: Record<string, THREE.Object3D> = {};

  private spawnEffectMesh?: (type: string, x: number, z: number, scale: number) => THREE.Object3D;
  private spawnTouchMesh?: (data: TouchIndicator) => THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setMeshSpawners(callbacks: {
    spawnEffectMesh?: (type: string, x: number, z: number, scale: number) => THREE.Object3D;
    spawnTouchMesh?: (data: TouchIndicator) => THREE.Mesh;
  }) {
    this.spawnEffectMesh = callbacks.spawnEffectMesh;
    this.spawnTouchMesh = callbacks.spawnTouchMesh;
  }

  // --- FLOATING TEXT ---
  spawnFloatingText(text: string, color: string, scaleSize: number, x: number, y: number, z: number) {
    const instance: FloatingText = {
      id: `txt_${Math.random()}_${Date.now()}`,
      text, color, size: scaleSize,
      x, y, z,
      velX: (Math.random() - 0.5) * 0.065,
      velY: 0.16 + Math.random() * 0.08,
      velZ: (Math.random() - 0.5) * 0.065,
      age: 0, maxAge: 38
    };
    this.floatingTexts.push(instance);
  }

  // --- EFFECTS ---
  spawnEffect(type: string, x: number, z: number) {
    if (!this.spawnEffectMesh) return;

    const mesh = this.spawnEffectMesh(type, x, z, 0.05);
    this.activeEffects.push({
      id: `fx_${Math.random()}_${Date.now()}`,
      type, mesh, age: 0,
      maxAge: type === 'thunder_storm' ? 45 : 25,
      x, z
    });
  }

  // --- TOUCH INDICATORS ---
  spawnTouchIndicator(x: number, z: number, type: TouchIndicator['type']) {
    if (!this.spawnTouchMesh) return;

    const data: TouchIndicator = {
      id: `indic_${Math.random()}`,
      x, y: 0.05, z,
      age: 0,
      maxAge: type === 'target' ? 120 : 22,
      type
    };

    const mesh = this.spawnTouchMesh(data);
    this.touchIndicators.push({ id: data.id, data, mesh });
  }

  // --- UPDATE (llamado desde renderTick) ---
  update(delta: number, targetEntityId: string | null, getTargetPos: (id: string) => { x: number; z: number } | null) {
    const frameScale = delta * 60;

    // Floating texts
    this.updateFloatingTexts(delta, frameScale);

    // Touch indicators
    this.updateTouchIndicators(delta, targetEntityId, getTargetPos);

    // Active effects
    this.updateActiveEffects(delta);
  }

  private updateFloatingTexts(delta: number, frameScale: number) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const txt = this.floatingTexts[i];
      txt.age += frameScale;
      txt.x += txt.velX * frameScale;
      txt.y += txt.velY * frameScale;
      txt.z += txt.velZ * frameScale;
      txt.velY -= 0.0125 * frameScale;

      let sprite = this.effectMeshes[txt.id] as any;
      if (!sprite) {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 160, 48);
          ctx.font = `bold ${Math.floor(26 * txt.size)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillStyle = txt.color;
          ctx.strokeStyle = '#020617';
          ctx.lineWidth = 4;
          ctx.strokeText(txt.text, 80, 32);
          ctx.fillText(txt.text, 80, 32);
        }
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        sprite = new THREE.Sprite(mat);
        sprite.scale.set(3, 1, 1);
        this.scene.add(sprite);
        this.effectMeshes[txt.id] = sprite;
      }

      sprite.position.set(txt.x, txt.y, txt.z);

      if (txt.age >= txt.maxAge) {
        this.scene.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
        delete this.effectMeshes[txt.id];
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  private updateTouchIndicators(
    delta: number,
    targetEntityId: string | null,
    getTargetPos: (id: string) => { x: number; z: number } | null
  ) {
    for (let i = this.touchIndicators.length - 1; i >= 0; i--) {
      const indObj = this.touchIndicators[i];
      const data = indObj.data;
      const mesh = indObj.mesh;
      data.age += delta * 60;

      if (data.type === 'move') {
        const progress = data.age / data.maxAge;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 1.0 - progress;
        mesh.scale.set(1 + progress * 2.8, 1 + progress * 2.8, 1);
      } else if (data.type === 'target') {
        mesh.rotation.z += 0.03;
        const scaleFreq = 1.0 + Math.sin(performance.now() * 0.01) * 0.15;
        mesh.scale.set(scaleFreq * 1.5, scaleFreq * 1.5, 1);

        if (targetEntityId) {
          const pos = getTargetPos(targetEntityId);
          if (pos) {
            mesh.position.set(pos.x, 0.05, pos.z);
          } else {
            data.age = data.maxAge;
          }
        } else {
          data.age = data.maxAge;
        }
      }

      if (data.age >= data.maxAge) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.touchIndicators.splice(i, 1);
      }
    }
  }

  private updateActiveEffects(delta: number) {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const fx = this.activeEffects[i];
      fx.age += delta * 60;
      const progress = fx.age / fx.maxAge;
      const mesh = fx.mesh;

      if (fx.type === 'heal') {
        const ring = mesh.children[0] as THREE.Mesh;
        if (ring) {
          (ring.material as THREE.Material).opacity = (1 - progress) * 0.7;
          ring.scale.set(1 + progress * 2.1, 1 + progress * 2.1, 1);
        }
        mesh.children.slice(1).forEach((lineObj) => {
          lineObj.position.y += 0.035 * (delta * 60);
          (lineObj as any).material.opacity = (1 - progress) * 0.65;
        });
      } else if (fx.type === 'bash' || fx.type === 'sonic_blow') {
        const slash = mesh.children[0] as THREE.Mesh;
        if (slash) {
          (slash.material as THREE.Material).opacity = (1 - progress) * 0.85;
          slash.rotation.z += 0.12 * (delta * 60);
          slash.scale.set(1 + progress, 1 + progress, 1);
        }
      } else if (fx.type === 'thunder_storm') {
        mesh.rotation.y += 0.05 * (delta * 60);
        const cyl = mesh.children[0] as THREE.Mesh;
        if (cyl) {
          (cyl.material as THREE.Material).opacity = (1 - progress) * 0.5;
          cyl.scale.set(1 + progress * 0.4, 1, 1 + progress * 0.4);
        }
      } else if (fx.type === 'level_up') {
        const points = mesh.children[0] as THREE.Points;
        if (points) {
          (points.material as THREE.Material).opacity = 1 - progress;
          points.position.y += 0.065 * (delta * 60);
        }
      }

      if (fx.age >= fx.maxAge) {
        this.scene.remove(mesh);
        mesh.traverse((node: any) => {
          if (node.geometry) node.geometry.dispose();
          if (node.material) {
            if (Array.isArray(node.material)) node.material.forEach((m: any) => m.dispose());
            else node.material.dispose();
          }
        });
        this.activeEffects.splice(i, 1);
      }
    }
  }

  // --- LIFECYCLE ---
  destroy() {
    this.floatingTexts = [];
    this.activeEffects = [];
    this.touchIndicators = [];
    this.effectMeshes = {};
  }

  getFloatingTexts() { return this.floatingTexts; }
  getActiveEffects() { return this.activeEffects; }
  getTouchIndicators() { return this.touchIndicators; }
}
