export type RPGAnimationState = 'idle' | 'move' | 'attack' | 'hit' | 'cast' | 'death';

export interface AnimationMetrics {
  scaleX: number;
  scaleY: number;
  rotation: number;
  visualOffsetY: number;
  frameIndex: number;
  opacity: number;
  glowIntensity: number;
}

export class AnimationStateMachine {
  public currentState: RPGAnimationState = 'idle';
  public lastState: RPGAnimationState = 'idle';
  public totalStateTime: number = 0; // in seconds
  
  // Decoupled tick constants
  private frameTimer: number = 0;
  public frameIndex: number = 0;
  
  // Highly fluid dynamic physics metrics
  public currentScaleX: number = 1.0;
  public currentScaleY: number = 1.0;
  public currentRotation: number = 0;
  public currentOffsetY: number = 0;
  public currentGlow: number = 0;
  public currentOpacity: number = 1.0;

  // State Priorities (higher can interrupt lower)
  private static PRIORITIES: Record<RPGAnimationState, number> = {
    idle: 0,
    move: 1,
    cast: 2,
    attack: 3,
    hit: 4,
    death: 5
  };

  constructor(initialState: RPGAnimationState = 'idle') {
    this.currentState = initialState;
    this.lastState = initialState;
  }

  // Requests a state transition based on priority and state rules
  public transitionTo(newState: RPGAnimationState, force: boolean = false): boolean {
    if (this.currentState === 'death') {
      // Cannot transition out of death unless explicitly forced (reborn/revive)
      if (newState !== 'death' && force) {
        this.currentState = newState;
        this.lastState = 'death';
        this.totalStateTime = 0;
        this.currentOpacity = 1.0;
        this.currentScaleY = 1.0;
        this.currentScaleX = 1.0;
        this.currentRotation = 0;
        this.currentOffsetY = 0;
        return true;
      }
      return false;
    }

    if (newState === this.currentState) return true;

    // Compare priorities
    const currentPriority = AnimationStateMachine.PRIORITIES[this.currentState] || 0;
    const newPriority = AnimationStateMachine.PRIORITIES[newState] || 0;

    // Hit interrupts casting, attack transitions need completion or can be interrupted by hits
    if (newPriority >= currentPriority || force || this.isStateFinished()) {
      this.lastState = this.currentState;
      this.currentState = newState;
      this.totalStateTime = 0;
      this.frameTimer = 0;
      this.frameIndex = 0;
      return true;
    }

    return false;
  }

  // Check if temporary states finished their core sequences
  private isStateFinished(): boolean {
    if (this.currentState === 'hit') {
      return this.totalStateTime > 0.35; // 350ms lock
    }
    if (this.currentState === 'attack') {
      return this.totalStateTime > 0.40; // 400ms lock
    }
    return true;
  }

  // Decoupled update loop driving smooth interpolators
  public update(dt: number, speedMultiplier: number = 1.0) {
    this.totalStateTime += dt;

    // 1. UPDATE FRAME TIMERS BASED ON ACTIVE STATE
    let msPerFrame = 120; // Default millisecond speed per frame
    let maxFrames = 4;
    
    if (this.currentState === 'idle') {
      msPerFrame = 160;
      maxFrames = 4;
    } else if (this.currentState === 'move') {
      msPerFrame = Math.max(50, 110 / speedMultiplier); // Leg frequency adapts to speed
      maxFrames = 4;
    } else if (this.currentState === 'attack') {
      msPerFrame = 70;
      maxFrames = 4;
    } else if (this.currentState === 'cast') {
      msPerFrame = 90;
      maxFrames = 4;
    } else if (this.currentState === 'hit') {
      msPerFrame = 100;
      maxFrames = 2;
    } else if (this.currentState === 'death') {
      msPerFrame = 250;
      maxFrames = 1;
    }

    this.frameTimer += dt * 1000;
    if (this.frameTimer >= msPerFrame) {
      this.frameTimer = 0;
      if (this.currentState !== 'death') {
        this.frameIndex = (this.frameIndex + 1) % maxFrames;
      } else {
        this.frameIndex = 0; // Static on fall
      }
    }

    // 2. STRETCH, SQUASH, ROTATION AND HOVER SPRING INTERPOLATORS
    let targetScaleX = 1.0;
    let targetScaleY = 1.0;
    let targetRotation = 0;
    let targetOffsetY = 0;
    let targetGlow = 0;
    let targetOpacity = 1.0;

    const breatheTime = performance.now() * 0.005;

    switch (this.currentState) {
      case 'idle':
        // Mild breathing squash/stretch
        targetScaleX = 1.0 + Math.sin(breatheTime) * 0.02;
        targetScaleY = 1.0 - Math.sin(breatheTime) * 0.02;
        break;

      case 'move':
        // Constant walking bouncy strides
        const strideTime = performance.now() * 0.012 * speedMultiplier;
        targetOffsetY = -Math.abs(Math.sin(strideTime)) * 6; // bounce height
        targetRotation = Math.sin(strideTime) * 0.08; // stride rotate tilt
        targetScaleX = 1.03 + Math.sin(strideTime) * 0.03;
        targetScaleY = 0.97 - Math.sin(strideTime) * 0.03;
        break;

      case 'attack':
        // Fast forward tilt, squash and release
        const attackProgress = Math.min(1.0, this.totalStateTime / 0.4);
        if (attackProgress < 0.25) {
          // Wind up
          targetScaleX = 0.82;
          targetScaleY = 1.18;
          targetRotation = -0.15;
          targetOffsetY = 0;
        } else {
          // Swing forward
          targetScaleX = 1.25;
          targetScaleY = 0.75;
          targetRotation = 0.28;
          targetOffsetY = -5;
        }
        break;

      case 'cast':
        // Spell hover: floating off the floor with rapid magical pulsations
        targetOffsetY = -8 + Math.sin(breatheTime * 2) * 3;
        targetGlow = 0.6 + Math.abs(Math.sin(breatheTime * 1.5)) * 0.4;
        targetScaleX = 0.95 + Math.sin(breatheTime * 3) * 0.02;
        targetScaleY = 1.05 - Math.sin(breatheTime * 3) * 0.02;
        break;

      case 'hit':
        // Immediate stagger shudder, back knockback rotation, and extreme flat squash
        const hitProgress = Math.min(1.0, this.totalStateTime / 0.35);
        const shake = Math.sin(hitProgress * Math.PI * 6) * 5;
        targetScaleX = 1.3;
        targetScaleY = 0.7;
        targetRotation = -0.22;
        targetOffsetY = -2;
        break;

      case 'death':
        // Collapse sideways and flatten down completely
        targetScaleY = 0.15;
        targetScaleX = 1.35;
        targetOffsetY = 16; // sink semi-submerged in floor
        targetRotation = 0.5 * Math.PI; // turn 90-deg sideways
        
        // Dissolve slowly after 1 second of dead state
        if (this.totalStateTime > 1.0) {
          targetOpacity = Math.max(0, 1.0 - (this.totalStateTime - 1.0) * 1.5);
        }
        break;
    }

    // Frame-rate independent exponential smoothing filter (decay factor dampening helper)
    const lerpFactor = 1 - Math.exp(-15 * dt);
    this.currentScaleX += (targetScaleX - this.currentScaleX) * lerpFactor;
    this.currentScaleY += (targetScaleY - this.currentScaleY) * lerpFactor;
    this.currentRotation += (targetRotation - this.currentRotation) * lerpFactor;
    this.currentOffsetY += (targetOffsetY - this.currentOffsetY) * lerpFactor;
    this.currentGlow += (targetGlow - this.currentGlow) * lerpFactor;
    this.currentOpacity += (targetOpacity - this.currentOpacity) * lerpFactor;
  }

  // Output physical metric bundles to draw onto dynamic canvases
  public getMetrics(): AnimationMetrics {
    return {
      scaleX: this.currentScaleX,
      scaleY: this.currentScaleY,
      rotation: this.currentRotation,
      visualOffsetY: this.currentOffsetY,
      frameIndex: this.frameIndex,
      opacity: this.currentOpacity,
      glowIntensity: this.currentGlow
    };
  }
}
