import * as THREE from 'three';
import { Entity, GroundItem, TouchIndicator, HeadgearId } from './types';
import { AnimationStateMachine } from './animationStateMachine';

export class GameRenderer {
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // Helper to draw a glowing grid ground
  createGroundMap() {
    // 1. Solid grassland plane
    const groundGeo = new THREE.PlaneGeometry(160, 160);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x145a32, // Dark deep moss green
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. Neon grid lines overlay
    const grid = new THREE.GridHelper(160, 80, 0x0ea5e9, 0x1e293b); // Sky blue primary grid lines
    grid.position.y = 0.01;
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    this.scene.add(grid);

    // 3. Center spawning runic portal disc (Visual flair)
    const portalGeo = new THREE.RingGeometry(2.5, 3.0, 32);
    const portalMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4
    });
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.rotation.x = -Math.PI / 2;
    portal.position.set(0, 0.02, 0);
    this.scene.add(portal);

    // Add some random decorative rocks or columns
    for (let i = 0; i < 20; i++) {
      const rx = (Math.random() - 0.5) * 80;
      const rz = (Math.random() - 0.5) * 80;
      if (Math.abs(rx) < 6 && Math.abs(rz) < 6) continue; // Keep spawn center clear

      const h = 2 + Math.random() * 5;
      const colGeo = new THREE.CylinderGeometry(0.5, 0.6, h, 8);
      const colMat = new THREE.MeshStandardMaterial({
        color: 0x334155, // slate rock columns
        roughness: 0.8
      });
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(rx, h / 2, rz);
      col.castShadow = true;
      col.receiveShadow = true;
      this.scene.add(col);
    }
  }

  // Creates the billboard sprite canvas/texture for entities dynamically!
  // This lets us draw beautiful 2D pixel-style designs on the fly using HTML Cannvases.
  createEntityTexture(entity: Entity, headgear: HeadgearId) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw background placeholder or sprite
    ctx.clearRect(0, 0, 128, 128);

    const f = entity.animationFrame;

    // 1. Lazy initialize the animation state machine
    if (!entity.animMachine) {
      entity.animMachine = new AnimationStateMachine(entity.state as any);
    } else {
      entity.animMachine.transitionTo(entity.state as any);
    }

    // 2. Calculate dynamic delta time per rendering pass for fluid animations
    const nowTimestamp = performance.now();
    const lastUpdateTimestamp = (entity as any)._lastAnimUpdateTime || nowTimestamp;
    const renderDt = Math.min(0.08, (nowTimestamp - lastUpdateTimestamp) / 1000);
    (entity as any)._lastAnimUpdateTime = nowTimestamp;

    // 3. Update state machine
    entity.animMachine.update(renderDt || 0.016);

    const metrics = entity.animMachine.getMetrics();
    ctx.globalAlpha = metrics.opacity;

    if (entity.type === 'player') {
      // Draw standard cute Ragnarok Lord Knight / High Priest style sprite
      ctx.fillStyle = '#f8fafc'; // pale white outfit body
      
      // Face facing directions flipping
      const flip = entity.facing === 'left' ? -1 : 1;
      
      // Draw shadow base oval on the floor (always grounded)
      ctx.save();
      ctx.translate(64, 64);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 48, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Transform matrices with dynamic squash-and-stretch and spring physics!
      ctx.save();
      ctx.translate(64, 64 + metrics.visualOffsetY);
      ctx.scale(flip * metrics.scaleX, metrics.scaleY);
      ctx.rotate(metrics.rotation);

      const bounceY = 0; // Handed off and fully handled by physical matrix translation!
      const hitColor = entity.state === 'hit' ? '#ef4444' : undefined;

      // Body dress/outfit
      ctx.fillStyle = hitColor || (entity.job === 'Lord Knight' ? '#dc2626' : 
                                   entity.job === 'High Priest' ? '#10b981' :
                                   entity.job === 'Assassin Cross' ? '#7c3aed' : '#0ea5e9');
      ctx.beginPath();
      ctx.moveTo(-16, 40);
      ctx.lineTo(16, 40);
      ctx.lineTo(8, 0 - bounceY);
      ctx.lineTo(-8, 0 - bounceY);
      ctx.closePath();
      ctx.fill();

      // Shield or sword details
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-20, 20 - bounceY);
      ctx.lineTo(-20, -10 - bounceY);
      ctx.stroke();

      // Cute head circles
      ctx.fillStyle = hitColor || '#fbcfe8'; // peach/skin
      ctx.beginPath();
      ctx.arc(0, -14 - bounceY, 14, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(4, -15 - bounceY, 2, 0, Math.PI * 2);
      ctx.arc(-4, -15 - bounceY, 2, 0, Math.PI * 2);
      ctx.fill();

      // Hair (Ragnarok spiky yellow wig!)
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.moveTo(-16, -20 - bounceY);
      ctx.lineTo(-10, -32 - bounceY);
      ctx.lineTo(0, -25 - bounceY);
      ctx.lineTo(10, -32 - bounceY);
      ctx.lineTo(16, -20 - bounceY);
      ctx.closePath();
      ctx.fill();

      // Equippable Headgear!
      if (headgear !== 'none') {
        ctx.fillStyle = headgear === 'goggles' ? '#334155' : 
                        headgear === 'magician_hat' ? '#4f46e5' : 
                        headgear === 'bunny_band' ? '#ffffff' : '#f59e0b'; // crown

        if (headgear === 'bunny_band') {
          // Bunny ears!
          ctx.beginPath();
          ctx.ellipse(-8, -36 - bounceY, 5, 12, -0.2, 0, Math.PI * 2);
          ctx.ellipse(8, -36 - bounceY, 5, 12, 0.2, 0, Math.PI * 2);
          ctx.fill();
          // Ear pink inner
          ctx.fillStyle = '#fda4af';
          ctx.beginPath();
          ctx.ellipse(-8, -35 - bounceY, 2, 8, -0.2, 0, Math.PI * 2);
          ctx.ellipse(8, -35 - bounceY, 2, 8, 0.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (headgear === 'ragnarok_crown') {
          // Glorious Golden Crown
          ctx.beginPath();
          ctx.moveTo(-12, -26 - bounceY);
          ctx.lineTo(-14, -36 - bounceY);
          ctx.lineTo(-6, -30 - bounceY);
          ctx.lineTo(0, -42 - bounceY);
          ctx.lineTo(6, -30 - bounceY);
          ctx.lineTo(14, -36 - bounceY);
          ctx.lineTo(12, -26 - bounceY);
          ctx.closePath();
          ctx.fill();
          // Crown jewel rubies!
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(0, -34 - bounceY, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (headgear === 'magician_hat') {
          // Tall blue wizard hat
          ctx.beginPath();
          ctx.moveTo(-16, -26 - bounceY);
          ctx.lineTo(16, -26 - bounceY);
          ctx.lineTo(8, -44 - bounceY);
          ctx.lineTo(-6, -42 - bounceY);
          ctx.closePath();
          ctx.fill();
        } else if (headgear === 'goggles') {
          // Cool steam goggles overlay
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(-12, -22 - bounceY, 24, 7);
          ctx.fillStyle = '#38bdf8'; // glowing blue glass lenses
          ctx.beginPath();
          ctx.arc(-5, -18 - bounceY, 4, 0, Math.PI * 2);
          ctx.arc(5, -18 - bounceY, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

    } else if (entity.type === 'npc') {
      // Draw signature Ragnarok style high-contrast custom NPC characters
      const flip = entity.facing === 'left' ? -1 : 1;
      ctx.save();
      ctx.translate(64, 64);
      ctx.scale(flip, 1);

      const bounceY = Math.abs(Math.sin(performance.now() * 0.005)) * 4.5; // soft idle breathing

      // Shadow base
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 48, 20, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (entity.npcType === 'kafra') {
        // Kafra Clarice: Elegant apron blue maid wear, white headband ribbon, fiery orange hair
        // Dress apron
        ctx.fillStyle = '#1e3a8a'; // Royal velvet blue
        ctx.beginPath();
        ctx.moveTo(-14, 40);
        ctx.lineTo(14, 40);
        ctx.lineTo(8, 0 - bounceY);
        ctx.lineTo(-8, 0 - bounceY);
        ctx.closePath();
        ctx.fill();

        // White front corset lace-overlay
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-8, 40);
        ctx.lineTo(8, 40);
        ctx.lineTo(5, 12 - bounceY);
        ctx.lineTo(-5, 12 - bounceY);
        ctx.closePath();
        ctx.fill();

        // Shoulder straps
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-6, 12 - bounceY);
        ctx.lineTo(-8, 0 - bounceY);
        ctx.moveTo(6, 12 - bounceY);
        ctx.lineTo(8, 0 - bounceY);
        ctx.stroke();

        // Peach skin texture head
        ctx.fillStyle = '#fbcfe8';
        ctx.beginPath();
        ctx.arc(0, -10 - bounceY, 11, 0, Math.PI * 2);
        ctx.fill();

        // Beautiful Orange hairdo with bangs
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(-14, -13 - bounceY);
        ctx.lineTo(-11, -23 - bounceY);
        ctx.lineTo(0, -17 - bounceY);
        ctx.lineTo(11, -23 - bounceY);
        ctx.lineTo(14, -13 - bounceY);
        ctx.closePath();
        ctx.fill();

        // Maid headband
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-8, -22 - bounceY, 16, 4);
        ctx.beginPath();
        ctx.arc(-8, -20 - bounceY, 3, 0, Math.PI * 2);
        ctx.arc(8, -20 - bounceY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Smiling anime eyes
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(3, -11 - bounceY, 1.5, 0, Math.PI * 2);
        ctx.arc(-3, -11 - bounceY, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Blush cheeks
        ctx.fillStyle = 'rgba(244, 63, 94, 0.6)';
        ctx.beginPath();
        ctx.arc(-6, -8 - bounceY, 2.5, 0, Math.PI * 2);
        ctx.arc(6, -8 - bounceY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Swordsman Trainer Kurt: Metallic shining iron plates on a massive crusader red cape
        // Red cape
        ctx.fillStyle = '#be123c'; 
        ctx.beginPath();
        ctx.moveTo(-18, 42);
        ctx.lineTo(18, 42);
        ctx.lineTo(0, -2 - bounceY);
        ctx.closePath();
        ctx.fill();

        // Heavy steel iron plate chest armor
        ctx.fillStyle = '#cbd5e1'; 
        ctx.beginPath();
        ctx.moveTo(-13, 40);
        ctx.lineTo(13, 40);
        ctx.lineTo(9, 1 - bounceY);
        ctx.lineTo(-9, 1 - bounceY);
        ctx.closePath();
        ctx.fill();

        // Golden cross design
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-2.5, 12 - bounceY, 5, 14);
        ctx.fillRect(-6.5, 16 - bounceY, 13, 4.5);

        // Neck protection neckplate
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(-6, 0 - bounceY, 12, 4);

        // Peach face/head
        ctx.fillStyle = '#fbcfe8';
        ctx.beginPath();
        ctx.arc(0, -10 - bounceY, 11, 0, Math.PI * 2);
        ctx.fill();

        // Heavy Iron Helmet
        ctx.fillStyle = '#475569'; // steel armor helmet
        ctx.beginPath();
        ctx.moveTo(-12, -15 - bounceY);
        ctx.lineTo(-8, -25 - bounceY);
        ctx.lineTo(0, -21 - bounceY);
        ctx.lineTo(8, -25 - bounceY);
        ctx.lineTo(12, -15 - bounceY);
        ctx.closePath();
        ctx.fill();

        // Helm plume
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.ellipse(0, -26 - bounceY, 4, 8, 0.45, 0, Math.PI * 2);
        ctx.fill();

        // Visor slit
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-6, -13 - bounceY, 12, 3);
      }

      ctx.restore();
    } else {
      // This is a Monster Mob sprite
      const flip = entity.facing === 'left' ? -1 : 1;
      const hitColor = entity.state === 'hit' ? '#ef4444' : undefined;
      const isDead = entity.state === 'death';

      // 1. Draw flat shadow on the floor (always grounded)
      ctx.save();
      ctx.translate(64, 64);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 48, entity.type === 'boss_mvp' ? 40 : 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Translate, Scale and Rotate body according to spring meters
      ctx.save();
      ctx.translate(64, 64 + metrics.visualOffsetY);
      ctx.scale(flip * metrics.scaleX, metrics.scaleY);
      ctx.rotate(metrics.rotation);

      const bounceY = 0; // Completely offloaded to spring-damper matrix transform!
      const squashIdx = 1.0; // Handled dynamically in physics metrics scaling!

      if (entity.mobType === 'poring') {
         // CUTE JELLY PINK PORING! (A bouncing squishy blob)
         ctx.fillStyle = hitColor || '#fda4af'; // light rosy pink
         ctx.beginPath();
         // Squishy scaling
         ctx.ellipse(0, 24 - bounceY, 24 * squashIdx, 20 / squashIdx, 0, 0, Math.PI * 2);
         ctx.fill();

        // Blush cheeks
        if (!isDead) {
          ctx.fillStyle = 'rgba(244, 63, 94, 0.5)';
          ctx.beginPath();
          ctx.arc(-12, 26 - bounceY, 4, 0, Math.PI * 2);
          ctx.arc(12, 26 - bounceY, 4, 0, Math.PI * 2);
          ctx.fill();

          // Black beaded eyes
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(-7, 20 - bounceY, 2.5, 0, Math.PI * 2);
          ctx.arc(7, 20 - bounceY, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Cute smile
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 24 - bounceY, 3, 0, Math.PI);
          ctx.stroke();
        }
      } else if (entity.mobType === 'poporing') {
        // GREEN SQUISHY POPORING! (With small toxic leaf crown)
        ctx.fillStyle = hitColor || '#4ade80'; // soft poison green
        ctx.beginPath();
        const squashIdx = isDead ? 0.4 : 1.05;
        ctx.ellipse(0, 24 - bounceY, 24 * squashIdx, 20 / squashIdx, 0, 0, Math.PI * 2);
        ctx.fill();

        if (!isDead) {
          // Leaf hat!
          ctx.fillStyle = '#15803d'; // dark leaf
          ctx.beginPath();
          ctx.ellipse(0, 4 - bounceY, 5, 10, 0.4, 0, Math.PI * 2);
          ctx.fill();

          // Beaded eyes & smile
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(-7, 20 - bounceY, 2.5, 0, Math.PI * 2);
          ctx.arc(7, 20 - bounceY, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (entity.mobType === 'pecopeco') {
        // PECOPECO: A fast running desert ostrich yellow bird
        ctx.fillStyle = hitColor || '#fbbf24'; // ostrich golden amber yellow
        
        // Large round body
        ctx.beginPath();
        ctx.arc(0, 20 - bounceY, 18, 0, Math.PI * 2);
        ctx.fill();

        // Long spidery stick bird legs
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-6, 32);
        ctx.lineTo(-10 + (bounceY * 0.4), 48);
        ctx.moveTo(6, 32);
        ctx.lineTo(8 - (bounceY * 0.4), 48);
        ctx.stroke();

        if (!isDead) {
          // Ostrich plume neck
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(8, 12 - bounceY);
          ctx.lineTo(24, -12 - bounceY);
          ctx.lineTo(16, -15 - bounceY);
          ctx.closePath();
          ctx.fill();

          // Beak!
          ctx.fillStyle = '#dc2626'; // flaming red beak
          ctx.beginPath();
          ctx.moveTo(20, -14 - bounceY);
          ctx.lineTo(32, -8 - bounceY);
          ctx.lineTo(22, -4 - bounceY);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        // MONSTROUS BAPHOMET (The Ragnarok Signature Goat Devil Boss MVP!)
        ctx.fillStyle = hitColor || '#1e293b'; // demonic dark navy-black shadow
        
        // Tall colossal devil body
        ctx.beginPath();
        ctx.moveTo(-24, 40);
        ctx.lineTo(24, 40);
        ctx.lineTo(16, -20 - bounceY);
        ctx.lineTo(-16, -20 - bounceY);
        ctx.closePath();
        ctx.fill();

        // Giant curved goat ivory skull horns!
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 5;
        ctx.beginPath();
        // Left curving sweeping horn
        ctx.moveTo(-12, -20 - bounceY);
        ctx.quadraticCurveTo(-38, -36 - bounceY, -26, -6 - bounceY);
        // Right curving sweeping horn
        ctx.moveTo(12, -20 - bounceY);
        ctx.quadraticCurveTo(38, -36 - bounceY, 26, -6 - bounceY);
        ctx.stroke();

        // Massive terrifying scythe stick!
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(24, 45);
        ctx.lineTo(24, -40 - bounceY); // handle shaft staff
        ctx.stroke();

        // Blade of scythe
        ctx.fillStyle = '#38bdf8'; // neon blue scythe blade
        ctx.beginPath();
        ctx.moveTo(24, -36 - bounceY);
        ctx.lineTo(-24, -48 - bounceY);
        ctx.lineTo(24, -22 - bounceY);
        ctx.closePath();
        ctx.fill();

        // Red glowing demonic eyes of the MVP boss
        if (!isDead) {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(-6, -11 - bounceY, 3, 0, Math.PI * 2);
          ctx.arc(6, -11 - bounceY, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  // Visual effects mesh generator helper
  spawnTouchIndicator(touch: TouchIndicator) {
    const geo = new THREE.RingGeometry(0.15, 0.45, 16);
    const color = touch.type === 'move' ? 0x0ea5e9 : // Blue move ring click
                  touch.type === 'target' ? 0xf43f5e : 0xeab308; // Red target ring, Yellow skill crosshair
    
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(touch.x, 0.05, touch.z);
    this.scene.add(mesh);
    return mesh;
  }

  // Create physical visual drop on the floor
  spawnDropItemMesh(item: GroundItem): THREE.Mesh {
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.1);
    const mat = new THREE.MeshStandardMaterial({
      color: item.itemId === 'mvp_coin' ? 0xf59e0b : 0xf43f5e, // gold for coins, red for potion boxes
      metalness: 0.7,
      roughness: 0.2
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(item.x, 0.25, item.z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  // Spawn visual spell meshes on character triggers
  createSkillVisualMesh(type: string, x: number, z: number, y: number): THREE.Object3D {
    const spellGroup = new THREE.Group();

    if (type === 'heal') {
      // Golden circle with rising cylinders
      const circleGeo = new THREE.RingGeometry(0.2, 1.4, 32);
      const circleMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(circleGeo, circleMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      spellGroup.add(ring);

      // Sparkly rising lines
      const lineGeo = new THREE.CylinderGeometry(0.04, 0.04, 3, 4);
      const lineMat = new THREE.MeshBasicMaterial({
        color: 0xa7f3d0,
        transparent: true,
        opacity: 0.6
      });
      for (let i = 0; i < 6; i++) {
        const line = new THREE.Mesh(lineGeo, lineMat);
        const theta = (i / 6) * Math.PI * 2;
        line.position.set(Math.cos(theta) * 0.9, 1.5, Math.sin(theta) * 0.9);
        spellGroup.add(line);
      }
    } else if (type === 'bash' || type === 'sonic_blow') {
      // Sweeping sharp slashing red/purple sword crescent mesh!
      const slashGeo = new THREE.RingGeometry(0.5, 2.0, 16, 1, 0, Math.PI * 1.2);
      const slashMat = new THREE.MeshBasicMaterial({
        color: type === 'bash' ? 0xf59e0b : 0x8b5cf6, // orange for bash, purple slash for sonic blow
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      });
      const slash = new THREE.Mesh(slashGeo, slashMat);
      slash.position.y = 1.0;
      slash.rotation.y = Math.random() * Math.PI;
      spellGroup.add(slash);
    } else if (type === 'thunder_storm') {
      // Towering lightning high-voltage clouds cylinders columns
      const cylGeo = new THREE.CylinderGeometry(1.5, 1.8, 12, 16);
      const cylMat = new THREE.MeshBasicMaterial({
        color: 0x0ea5e9, // lightning electric blue
        transparent: true,
        opacity: 0.45,
        wireframe: true
      });
      const cyl = new THREE.Mesh(cylGeo, cylMat);
      cyl.position.y = 6.0;
      spellGroup.add(cyl);
    } else if (type === 'level_up') {
      // Golden fireworks flare particle ring!
      const pCount = 50;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 2;
        pos[i * 3 + 1] = Math.random() * 4;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 2;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xeab308, // Pure golden level up shimmer!
        size: 0.25,
        transparent: true,
        opacity: 0.9
      });
      const points = new THREE.Points(geo, mat);
      spellGroup.add(points);
    }

    spellGroup.position.set(x, y, z);
    this.scene.add(spellGroup);
    return spellGroup;
  }

  // Draw flying physics projectile meshes in Three.js
  spawnProjectileMesh(type: string, x: number, y: number, z: number): THREE.Object3D {
    const projGroup = new THREE.Group();
    if (type === 'arrow') {
      // Glow yellow streak cylinder representant
      const geo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2; // Lie flat aligned
      projGroup.add(mesh);
    } else if (type === 'holy_light') {
      // Golden bright magical sphere
      const geo = new THREE.SphereGeometry(0.24, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const mesh = new THREE.Mesh(geo, mat);
      projGroup.add(mesh);

      const ringGeo = new THREE.RingGeometry(0.1, 0.4, 8);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      projGroup.add(ring);
    } else if (type === 'poison_dart') {
      // Toxic green glowing orb
      const geo = new THREE.SphereGeometry(0.18, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
      const mesh = new THREE.Mesh(geo, mat);
      projGroup.add(mesh);
    } else {
      // dark_energy orb
      const geo = new THREE.SphereGeometry(0.32, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
      const mesh = new THREE.Mesh(geo, mat);
      projGroup.add(mesh);
    }
    projGroup.position.set(x, y, z);
    this.scene.add(projGroup);
    return projGroup;
  }
}
