/**
 * ============================================================================
 * JELLY UI — SOFT-BODY PHYSICS ENGINE & INTERACTIVE SHOWCASE
 * ============================================================================
 * Zero dependencies. Plain HTML, CSS, and Vanilla JavaScript.
 * Implements viscoelastic soft-body mechanics via spring-damper integration,
 * Catmull-Rom/midpoint spline rendering, dynamic optical specular highlights,
 * scroll velocity momentum, and tactile UI components.
 */

'use strict';

/* ============================================================================
   1. TUNABLE CONSTANTS (Easily adjust the jelly feel here)
   ============================================================================ */
const JELLY_CONFIG = {
  // Spring restoring force back to resting shape (higher = stiffer, lower = looser)
  stiffness: 0.12,

  // Velocity damping per step (0.80 = thick pudding, 0.94 = very jiggly water balloon)
  damping: 0.89,

  // Tension between neighboring outline points (maintains smooth contour, prevents spikes)
  perimeterTension: 0.24,

  // Push force exerted by pointer onto jelly vertices
  pointerForce: 1.8,

  // Distance of influence for cursor push (in pixels)
  pointerRadius: 85,

  // Overall multiplier for wobble amplitude (respects prefers-reduced-motion)
  wobbleAmount: 1.0,

  // Idle "breathing" amplitude (in pixels)
  idleAmplitude: 3.0,

  // Idle breathing cycle frequency (speed)
  idleFrequency: 1.6,

  // Spring pull strength when dragging with mouse/finger
  dragSpring: 0.16,

  // Vertical squish / lag impulse generated per pixel of scroll velocity
  scrollReaction: 0.35,

  // Soft collision restitution between jelly shapes in playground
  collisionBounce: 0.55
};

// Check if user prefers reduced motion
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (prefersReducedMotion) {
  JELLY_CONFIG.wobbleAmount = 0.15;
  JELLY_CONFIG.idleAmplitude = 0.5;
}

// Preset feels for the interactive Tuner
const PRESETS = {
  jiggly: {
    stiffness: 0.08,
    damping: 0.93,
    perimeterTension: 0.18,
    pointerForce: 2.3,
    wobbleAmount: 1.4
  },
  classic: {
    stiffness: 0.12,
    damping: 0.89,
    perimeterTension: 0.24,
    pointerForce: 1.8,
    wobbleAmount: 1.0
  },
  firm: {
    stiffness: 0.22,
    damping: 0.82,
    perimeterTension: 0.38,
    pointerForce: 1.2,
    wobbleAmount: 0.6
  },
  gooey: {
    stiffness: 0.06,
    damping: 0.78,
    perimeterTension: 0.15,
    pointerForce: 2.8,
    wobbleAmount: 1.6
  }
};

/* Color Flavors */
const FLAVORS = {
  strawberry: {
    name: 'Strawberry',
    primary: '#ff3b69',
    secondary: '#ff7597',
    deep: '#c9184a',
    glow: 'rgba(255, 59, 105, 0.45)',
    specular: 'rgba(255, 255, 255, 0.92)'
  },
  mint: {
    name: 'Mint',
    primary: '#00d294',
    secondary: '#52f2c2',
    deep: '#00875e',
    glow: 'rgba(0, 210, 148, 0.45)',
    specular: 'rgba(255, 255, 255, 0.92)'
  },
  lemon: {
    name: 'Lemon',
    primary: '#ffb703',
    secondary: '#ffd166',
    deep: '#d48b00',
    glow: 'rgba(255, 183, 3, 0.45)',
    specular: 'rgba(255, 255, 255, 0.92)'
  },
  grape: {
    name: 'Grape',
    primary: '#8a4fff',
    secondary: '#b085ff',
    deep: '#5a189a',
    glow: 'rgba(138, 79, 255, 0.45)',
    specular: 'rgba(255, 255, 255, 0.92)'
  },
  sky: {
    name: 'Sky Blue',
    primary: '#00a6fb',
    secondary: '#5bc8af',
    deep: '#006494',
    glow: 'rgba(0, 166, 251, 0.45)',
    specular: 'rgba(255, 255, 255, 0.92)'
  }
};

/* ============================================================================
   2. GLOBAL INPUT & SCROLL MANAGER
   ============================================================================ */
class InputManager {
  constructor() {
    this.mouse = {
      x: -9999,
      y: -9999,
      prevX: -9999,
      prevY: -9999,
      vx: 0,
      vy: 0,
      speed: 0,
      down: false,
      lastMoveTime: performance.now()
    };

    this.scroll = {
      y: window.scrollY,
      prevY: window.scrollY,
      vy: 0,
      speed: 0,
      lastTime: performance.now()
    };

    this.initEvents();
  }

  initEvents() {
    // Pointer move (Mouse + Touch)
    window.addEventListener('pointermove', (e) => {
      const now = performance.now();
      const dt = Math.max(1, now - this.mouse.lastMoveTime) / 1000;

      if (this.mouse.prevX !== -9999) {
        this.mouse.vx = (e.clientX - this.mouse.prevX) / dt;
        this.mouse.vy = (e.clientY - this.mouse.prevY) / dt;
        this.mouse.speed = Math.hypot(this.mouse.vx, this.mouse.vy);
      }

      this.mouse.prevX = this.mouse.x;
      this.mouse.prevY = this.mouse.y;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.lastMoveTime = now;

      // Update custom cursor
      this.updateCursor(e.clientX, e.clientY);
    }, { passive: true });

    window.addEventListener('pointerdown', (e) => {
      this.mouse.down = true;
      document.body.classList.add('cursor-down');
    });

    window.addEventListener('pointerup', () => {
      this.mouse.down = false;
      document.body.classList.remove('cursor-down');
    });

    window.addEventListener('pointercancel', () => {
      this.mouse.down = false;
      document.body.classList.remove('cursor-down');
    });

    // Scroll kinetics tracking
    window.addEventListener('scroll', () => {
      const now = performance.now();
      const dt = Math.max(1, now - this.scroll.lastTime) / 1000;
      const currentY = window.scrollY;

      this.scroll.vy = (currentY - this.scroll.prevY) / dt;
      this.scroll.speed = Math.abs(this.scroll.vy);
      this.scroll.prevY = currentY;
      this.scroll.lastTime = now;

      // Update active section background color
      this.updateActiveSection();
    }, { passive: true });
  }

  updateCursor(x, y) {
    const cursor = document.getElementById('jelly-cursor');
    if (!cursor) return;

    cursor.style.transform = `translate(${x}px, ${y}px)`;

    // Stretch cursor blob along velocity vector
    const speed = Math.min(this.mouse.speed, 2000);
    const stretch = 1 + (speed / 2000) * 0.7;
    const squish = 1 / Math.sqrt(stretch);
    const angle = Math.atan2(this.mouse.vy, this.mouse.vx);

    const blob = cursor.querySelector('.cursor-blob');
    if (blob) {
      blob.style.transform = `rotate(${angle}rad) scale(${stretch}, ${squish})`;
    }
  }

  updateActiveSection() {
    const sections = document.querySelectorAll('section[data-bg]');
    const scrollMid = window.scrollY + window.innerHeight * 0.45;

    sections.forEach(sec => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      if (scrollMid >= top && scrollMid < top + height) {
        const bg = sec.getAttribute('data-bg');
        document.body.setAttribute('data-section', bg);

        // Update active nav link
        document.querySelectorAll('.site-nav .nav-link').forEach(link => {
          if (link.getAttribute('href') === `#${sec.id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }

  // Decay velocity when cursor stops moving
  decay() {
    this.mouse.vx *= 0.85;
    this.mouse.vy *= 0.85;
    this.mouse.speed *= 0.85;
    this.scroll.vy *= 0.88;
    this.scroll.speed *= 0.88;
  }
}

const input = new InputManager();

/* ============================================================================
   3. CORE SOFT-BODY POINT & JELLY BODY CLASS
   ============================================================================ */

/**
 * A vertex around the contour of a jelly body.
 */
class JellyPoint {
  constructor(baseX, baseY) {
    this.baseX = baseX; // Rest offset from body center
    this.baseY = baseY;
    this.x = baseX;     // Absolute world/canvas coordinate
    this.y = baseY;
    this.vx = 0;
    this.vy = 0;
    this.fx = 0;
    this.fy = 0;
    this.normalX = 0;
    this.normalY = 0;
  }
}

/**
 * JellyBody: Soft-body simulation with spring-damper integration,
 * Catmull-Rom midpoint spline rendering, translucent candy shading,
 * dynamic optical highlights, and drag/fling interaction.
 */
class JellyBody {
  constructor(options = {}) {
    this.cx = options.cx || 200;
    this.cy = options.cy || 200;
    this.targetCx = this.cx;
    this.targetCy = this.cy;
    this.vx = 0;
    this.vy = 0;
    this.mass = options.mass || 1.0;
    this.radius = options.radius || 90;
    this.flavor = options.flavor || FLAVORS.strawberry;
    this.numPoints = options.numPoints || 28;
    this.shapeType = options.shapeType || 'circle'; // 'circle', 'squircle', 'star', 'pill', 'drop'
    this.pillWidth = options.pillWidth || 200;
    this.pillHeight = options.pillHeight || 90;

    this.points = [];
    this.isDragged = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.dragPointerId = null;

    this.idlePhase = Math.random() * Math.PI * 2;
    this.deformationRatio = 0;
    this.kineticEnergy = 0;

    this.initGeometry();
  }

  /**
   * Generates resting outline coordinates for different geometric shapes.
   */
  initGeometry() {
    this.points = [];
    const N = this.numPoints;

    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      let bx = 0;
      let by = 0;

      if (this.shapeType === 'circle') {
        bx = Math.cos(angle) * this.radius;
        by = Math.sin(angle) * this.radius;
      } else if (this.shapeType === 'squircle') {
        // Superellipse: (|cos|^(2/n) * sgn(cos), |sin|^(2/n) * sgn(sin))
        const n = 3.5;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        bx = Math.sign(cosA) * Math.pow(Math.abs(cosA), 2 / n) * this.radius * 1.1;
        by = Math.sign(sinA) * Math.pow(Math.abs(sinA), 2 / n) * this.radius * 1.1;
      } else if (this.shapeType === 'star') {
        // 5-point star with soft inner/outer lobes
        const lobes = 5;
        const rMod = this.radius * (0.8 + 0.32 * Math.cos(lobes * angle));
        bx = Math.cos(angle) * rMod;
        by = Math.sin(angle) * rMod;
      } else if (this.shapeType === 'pill') {
        // Horizontal capsule
        const halfW = (this.pillWidth - this.pillHeight) / 2;
        const r = this.pillHeight / 2;
        if (Math.abs(Math.sin(angle)) < 0.05 && Math.cos(angle) > 0) {
          bx = halfW + r;
          by = 0;
        } else if (angle > -Math.PI / 2 && angle < Math.PI / 2) {
          bx = halfW + Math.cos(angle) * r;
          by = Math.sin(angle) * r;
        } else {
          bx = -halfW + Math.cos(angle) * r;
          by = Math.sin(angle) * r;
        }
      } else if (this.shapeType === 'drop') {
        // Teardrop / egg shape
        const rMod = this.radius * (1 - 0.35 * Math.sin(angle));
        bx = Math.cos(angle) * rMod;
        by = Math.sin(angle) * rMod;
      }

      const p = new JellyPoint(bx, by);
      p.x = this.cx + bx;
      p.y = this.cy + by;
      this.points.push(p);
    }
  }

  /**
   * Physics Integration Step (Hooke's Law + Laplacian surface tension + Cursor forces + Scroll lag)
   */
  update(dt, canvasBounds, localPointer, scrollVy = 0) {
    const N = this.points.length;
    const time = performance.now() / 1000;
    this.idlePhase += dt * JELLY_CONFIG.idleFrequency;

    // 1. Center dragging physics
    if (this.isDragged && localPointer) {
      const targetX = localPointer.x + this.dragOffsetX;
      const targetY = localPointer.y + this.dragOffsetY;
      const pullX = (targetX - this.cx) * JELLY_CONFIG.dragSpring;
      const pullY = (targetY - this.cy) * JELLY_CONFIG.dragSpring;

      this.vx = (this.vx + pullX) * 0.92;
      this.vy = (this.vy + pullY) * 0.92;
      this.cx += this.vx;
      this.cy += this.vy;
    } else {
      // Natural inertia & soft boundary bounce
      this.cx += this.vx * dt * 60;
      this.cy += this.vy * dt * 60;
      this.vx *= 0.97;
      this.vy *= 0.97;
    }

    // Boundary constraints for free-floating shapes (playground)
    if (canvasBounds) {
      const pad = this.radius * 0.8;
      if (this.cx < pad) {
        this.cx = pad;
        this.vx = -this.vx * JELLY_CONFIG.collisionBounce;
        this.applyImpulse(4, 0);
      } else if (this.cx > canvasBounds.width - pad) {
        this.cx = canvasBounds.width - pad;
        this.vx = -this.vx * JELLY_CONFIG.collisionBounce;
        this.applyImpulse(-4, 0);
      }
      if (this.cy < pad) {
        this.cy = pad;
        this.vy = -this.vy * JELLY_CONFIG.collisionBounce;
        this.applyImpulse(0, 4);
      } else if (this.cy > canvasBounds.height - pad) {
        this.cy = canvasBounds.height - pad;
        this.vy = -this.vy * JELLY_CONFIG.collisionBounce;
        this.applyImpulse(0, -4);
      }
    }

    // Scroll-induced lag/squish force (vertical acceleration)
    const scrollImpulse = -scrollVy * JELLY_CONFIG.scrollReaction * 0.04;

    let totalDisplacement = 0;
    let totalVel = 0;

    // 2. Compute vertex forces
    for (let i = 0; i < N; i++) {
      const p = this.points[i];
      p.fx = 0;
      p.fy = 0;

      // Subtle breathing harmonic wave
      const breath = Math.sin(this.idlePhase + (i / N) * Math.PI * 4) * JELLY_CONFIG.idleAmplitude;
      const normLen = Math.hypot(p.baseX, p.baseY) || 1;
      const normX = p.baseX / normLen;
      const normY = p.baseY / normLen;

      // Rest target in world coordinates
      const restX = this.cx + p.baseX + normX * breath;
      const restY = this.cy + p.baseY + normY * breath;

      // Hooke's restoring spring force towards base shape
      const dx = restX - p.x;
      const dy = restY - p.y;
      p.fx += dx * JELLY_CONFIG.stiffness;
      p.fy += dy * JELLY_CONFIG.stiffness;

      // Laplacian surface tension (pull towards average of neighbor vertices)
      const prev = this.points[(i - 1 + N) % N];
      const next = this.points[(i + 1) % N];
      const avgNeighborX = (prev.x + next.x) * 0.5;
      const avgNeighborY = (prev.y + next.y) * 0.5;
      p.fx += (avgNeighborX - p.x) * JELLY_CONFIG.perimeterTension;
      p.fy += (avgNeighborY - p.y) * JELLY_CONFIG.perimeterTension;

      // Cursor push repulsion force
      if (localPointer && localPointer.active) {
        const pdx = p.x - localPointer.x;
        const pdy = p.y - localPointer.y;
        const pDist = Math.hypot(pdx, pdy);
        const radius = JELLY_CONFIG.pointerRadius;

        if (pDist < radius && pDist > 0.001) {
          const factor = (1 - pDist / radius);
          // Speed increases dynamic shockwave
          const kineticPush = (25 + localPointer.speed * 0.08) * JELLY_CONFIG.pointerForce;
          const pushForce = factor * factor * kineticPush;

          p.fx += (pdx / pDist) * pushForce;
          p.fy += (pdy / pDist) * pushForce;

          // Drag effect along pointer motion vector
          p.fx += localPointer.vx * factor * 0.015;
          p.fy += localPointer.vy * factor * 0.015;
        }
      }

      // Add scroll momentum
      p.fy += scrollImpulse;

      totalDisplacement += Math.hypot(dx, dy);
    }

    // 3. Integrate velocities and positions
    const dtFactor = Math.min(dt * 60, 2.0);
    const damp = Math.pow(JELLY_CONFIG.damping, dtFactor);

    for (let i = 0; i < N; i++) {
      const p = this.points[i];
      p.vx = (p.vx + p.fx * dtFactor) * damp;
      p.vy = (p.vy + p.fy * dtFactor) * damp;

      p.x += p.vx * dtFactor * JELLY_CONFIG.wobbleAmount;
      p.y += p.vy * dtFactor * JELLY_CONFIG.wobbleAmount;

      totalVel += Math.hypot(p.vx, p.vy);
    }

    // Telemetry stats
    this.deformationRatio = (totalDisplacement / (N * this.radius)) * 100;
    this.kineticEnergy = totalVel / N;
  }

  /**
   * Applies an instantaneous shockwave impulse to all vertices.
   */
  applyImpulse(fx, fy) {
    const N = this.points.length;
    for (let i = 0; i < N; i++) {
      const p = this.points[i];
      // Randomize slightly for organic ripples
      const jitter = 0.8 + Math.random() * 0.4;
      p.vx += fx * jitter * JELLY_CONFIG.wobbleAmount;
      p.vy += fy * jitter * JELLY_CONFIG.wobbleAmount;
    }
  }

  /**
   * Slaps the jelly with a directional shockwave.
   */
  slap(intensity = 15) {
    const angle = Math.random() * Math.PI * 2;
    this.applyImpulse(Math.cos(angle) * intensity, Math.sin(angle) * intensity);
  }

  /**
   * Check if a coordinate hits inside the jelly (approximate radial check).
   */
  containsPoint(px, py) {
    return Math.hypot(px - this.cx, py - this.cy) <= this.radius * 1.15;
  }

  /**
   * Render soft-body jelly with Catmull-Rom midpoint curves,
   * glossy translucent 3D gradients, dynamic specular gleam, and shadow.
   */
  draw(ctx) {
    const N = this.points.length;
    if (N < 3) return;

    ctx.save();

    // 1. Soft ambient drop shadow underneath
    this.drawShadow(ctx);

    // 2. Build smooth Catmull-Rom / midpoint Bezier path
    ctx.beginPath();
    const firstMidX = (this.points[N - 1].x + this.points[0].x) * 0.5;
    const firstMidY = (this.points[N - 1].y + this.points[0].y) * 0.5;
    ctx.moveTo(firstMidX, firstMidY);

    for (let i = 0; i < N; i++) {
      const curr = this.points[i];
      const next = this.points[(i + 1) % N];
      const midX = (curr.x + next.x) * 0.5;
      const midY = (curr.y + next.y) * 0.5;
      ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    }
    ctx.closePath();

    // 3. Translucent Candy Gelatin Fill (multi-stop radial gradient)
    // The gradient focal point shifts slightly with body deformation!
    let shiftX = (this.points[0].x - (this.cx + this.points[0].baseX)) * 0.3;
    let shiftY = (this.points[0].y - (this.cy + this.points[0].baseY)) * 0.3;
    const gradX = this.cx - this.radius * 0.25 + shiftX;
    const gradY = this.cy - this.radius * 0.25 + shiftY;

    const grad = ctx.createRadialGradient(
      gradX, gradY, this.radius * 0.05,
      this.cx, this.cy, this.radius * 1.3
    );
    grad.addColorStop(0, this.flavor.secondary);
    grad.addColorStop(0.65, this.flavor.primary);
    grad.addColorStop(1, this.flavor.deep);

    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.94;
    ctx.fill();

    // 4. Inner Gelatin Rim Glow (stroke along contour)
    ctx.lineWidth = Math.max(3, this.radius * 0.05);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.stroke();

    // 5. Dynamic Specular Highlights (shifts organically with deformation)
    this.drawSpecular(ctx, shiftX, shiftY);

    ctx.restore();
  }

  /**
   * Draws realistic soft gelatin shadow below the body.
   */
  drawShadow(ctx) {
    const shadowY = this.cy + this.radius * 0.85;
    const shadowW = this.radius * 1.3;
    const shadowH = this.radius * 0.35;

    ctx.save();
    const shadowGrad = ctx.createRadialGradient(
      this.cx, shadowY, 0,
      this.cx, shadowY, shadowW
    );
    shadowGrad.addColorStop(0, 'rgba(40, 20, 20, 0.22)');
    shadowGrad.addColorStop(0.5, 'rgba(40, 20, 20, 0.08)');
    shadowGrad.addColorStop(1, 'rgba(40, 20, 20, 0)');

    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(this.cx, shadowY, shadowW, shadowH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draws dynamic specular highlight that tilts and deforms with the jelly.
   */
  drawSpecular(ctx, shiftX, shiftY) {
    ctx.save();

    // Primary highlight: curved gloss oval at top-left
    const hlX = this.cx - this.radius * 0.35 + shiftX * 0.6;
    const hlY = this.cy - this.radius * 0.38 + shiftY * 0.6;
    const hlRx = this.radius * 0.38;
    const hlRy = this.radius * 0.18;
    const hlRot = -0.45 + (shiftX / this.radius) * 0.5;

    const hlGrad = ctx.createRadialGradient(
      hlX, hlY, 0,
      hlX, hlY, hlRx
    );
    hlGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    hlGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    hlGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = hlGrad;
    ctx.beginPath();
    ctx.ellipse(hlX, hlY, hlRx, hlRy, hlRot, 0, Math.PI * 2);
    ctx.fill();

    // Secondary subsurface light reflection (bottom right rim)
    const subX = this.cx + this.radius * 0.32;
    const subY = this.cy + this.radius * 0.36;
    const subGrad = ctx.createRadialGradient(
      subX, subY, 0,
      subX, subY, this.radius * 0.25
    );
    subGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    subGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = subGrad;
    ctx.beginPath();
    ctx.ellipse(subX, subY, this.radius * 0.25, this.radius * 0.12, 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

/* ============================================================================
   4. CANVAS RETINA RESIZING & VISIBILITY OBSERVER
   ============================================================================ */
function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || parseInt(canvas.getAttribute('width'), 10) || 300;
  const height = rect.height || parseInt(canvas.getAttribute('height'), 10) || 150;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const ctx = canvas.getContext('2d');
  ctx.resetTransform();
  ctx.scale(dpr, dpr);

  return { ctx, width, height, dpr };
}

/* ============================================================================
   5. HERO SECTION: "GIGA JELLY"
   ============================================================================ */
class HeroController {
  constructor() {
    this.canvas = document.getElementById('hero-canvas');
    if (!this.canvas) return;

    this.initCanvasSize();
    this.blob = new JellyBody({
      cx: this.width / 2,
      cy: this.height / 2 - 10,
      radius: Math.min(this.width, this.height) * 0.33,
      flavor: FLAVORS.strawberry,
      numPoints: 32,
      shapeType: 'circle'
    });

    this.localPointer = {
      x: -9999,
      y: -9999,
      prevX: -9999,
      prevY: -9999,
      vx: 0,
      vy: 0,
      speed: 0,
      active: false
    };

    this.flavorKeys = Object.keys(FLAVORS);
    this.flavorIdx = 0;
    this.isVisible = true;

    this.initEvents();
  }

  initCanvasSize() {
    const res = setupCanvas(this.canvas);
    this.ctx = res.ctx;
    this.width = res.width;
    this.height = res.height;
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.initCanvasSize();
      if (this.blob) {
        this.blob.cx = this.width / 2;
        this.blob.cy = this.height / 2 - 10;
        this.blob.radius = Math.min(this.width, this.height) * 0.33;
        this.blob.initGeometry();
      }
    });

    const getCanvasPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      const pos = getCanvasPos(e);
      if (this.blob.containsPoint(pos.x, pos.y)) {
        this.blob.isDragged = true;
        this.blob.dragOffsetX = this.blob.cx - pos.x;
        this.blob.dragOffsetY = this.blob.cy - pos.y;
        this.blob.applyImpulse((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const pos = getCanvasPos(e);
      const dt = 0.016;
      this.localPointer.vx = (pos.x - (this.localPointer.prevX || pos.x)) / dt;
      this.localPointer.vy = (pos.y - (this.localPointer.prevY || pos.y)) / dt;
      this.localPointer.speed = Math.hypot(this.localPointer.vx, this.localPointer.vy);
      this.localPointer.prevX = this.localPointer.x;
      this.localPointer.prevY = this.localPointer.y;
      this.localPointer.x = pos.x;
      this.localPointer.y = pos.y;
      this.localPointer.active = true;
    });

    const endDrag = () => {
      if (this.blob.isDragged) {
        this.blob.isDragged = false;
        // Fling momentum with rubber overshoot
        this.blob.applyImpulse(this.localPointer.vx * 0.03, this.localPointer.vy * 0.03);
      }
    };

    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
    this.canvas.addEventListener('pointerleave', () => {
      this.localPointer.active = false;
      endDrag();
    });

    // Quick Poke button
    const pokeBtn = document.getElementById('hero-poke-btn');
    if (pokeBtn) {
      pokeBtn.addEventListener('click', () => {
        this.blob.slap(26);
      });
    }

    // Flavor Cycle button
    const colorBtn = document.getElementById('hero-color-btn');
    if (colorBtn) {
      colorBtn.addEventListener('click', () => {
        this.flavorIdx = (this.flavorIdx + 1) % this.flavorKeys.length;
        const key = this.flavorKeys[this.flavorIdx];
        this.blob.flavor = FLAVORS[key];
        colorBtn.textContent = `${this.getFlavorEmoji(key)} ${FLAVORS[key].name}`;
        this.blob.slap(12);
      });
    }
  }

  getFlavorEmoji(key) {
    const emojis = { strawberry: '🍓', mint: '🌱', lemon: '🍋', grape: '🍇', sky: '💧' };
    return emojis[key] || '🍮';
  }

  update(dt) {
    if (!this.isVisible) return;

    // Decay local pointer speed
    this.localPointer.vx *= 0.85;
    this.localPointer.vy *= 0.85;
    this.localPointer.speed *= 0.85;

    // Center restoring force if not dragged
    if (!this.blob.isDragged) {
      const homeX = this.width / 2;
      const homeY = this.height / 2 - 10;
      this.blob.cx += (homeX - this.blob.cx) * 0.08;
      this.blob.cy += (homeY - this.blob.cy) * 0.08;
    }

    this.blob.update(dt, { width: this.width, height: this.height }, this.localPointer, input.scroll.vy);

    // Update telemetry HUD
    this.updateHUD();

    // Render
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.blob.draw(this.ctx);
  }

  updateHUD() {
    const stateEl = document.getElementById('tel-state');
    const squishEl = document.getElementById('tel-squish');
    const energyEl = document.getElementById('tel-energy');

    if (stateEl) {
      if (this.blob.isDragged) stateEl.textContent = 'Stretching';
      else if (this.blob.kineticEnergy > 1.2) stateEl.textContent = 'Wobbling';
      else stateEl.textContent = 'Breathing';
    }

    if (squishEl) {
      squishEl.textContent = `${Math.min(99, Math.round(this.blob.deformationRatio * 1.5))}%`;
    }

    if (energyEl) {
      if (this.blob.kineticEnergy > 2.5) energyEl.textContent = 'High 🔥';
      else if (this.blob.kineticEnergy > 0.8) energyEl.textContent = 'Active ✨';
      else energyEl.textContent = 'Low 💤';
    }
  }
}

/* ============================================================================
   6. PLAYGROUND SECTION: MULTI-SHAPE COLLISION SANDBOX
   ============================================================================ */
class PlaygroundController {
  constructor() {
    this.canvas = document.getElementById('playground-canvas');
    if (!this.canvas) return;

    this.initCanvasSize();
    this.shapes = [];
    this.gravityEnabled = false;
    this.isVisible = true;

    this.localPointer = {
      x: -9999,
      y: -9999,
      prevX: -9999,
      prevY: -9999,
      vx: 0,
      vy: 0,
      speed: 0,
      active: false
    };

    this.initShapes();
    this.initEvents();
  }

  initCanvasSize() {
    const res = setupCanvas(this.canvas);
    this.ctx = res.ctx;
    this.width = res.width;
    this.height = res.height;
  }

  initShapes() {
    this.shapes = [];
    const w = this.width;
    const h = this.height;

    // 1. Strawberry Ball
    this.shapes.push(new JellyBody({
      cx: w * 0.2,
      cy: h * 0.45,
      radius: 65,
      flavor: FLAVORS.strawberry,
      numPoints: 24,
      shapeType: 'circle'
    }));

    // 2. Mint Rounded Squircle
    this.shapes.push(new JellyBody({
      cx: w * 0.38,
      cy: h * 0.5,
      radius: 60,
      flavor: FLAVORS.mint,
      numPoints: 24,
      shapeType: 'squircle'
    }));

    // 3. Lemon 5-Point Star
    this.shapes.push(new JellyBody({
      cx: w * 0.58,
      cy: h * 0.4,
      radius: 70,
      flavor: FLAVORS.lemon,
      numPoints: 30,
      shapeType: 'star'
    }));

    // 4. Grape Pill / Capsule
    this.shapes.push(new JellyBody({
      cx: w * 0.78,
      cy: h * 0.52,
      radius: 55,
      flavor: FLAVORS.grape,
      numPoints: 26,
      shapeType: 'pill',
      pillWidth: 150,
      pillHeight: 80
    }));

    // 5. Sky Blue Teardrop
    this.shapes.push(new JellyBody({
      cx: w * 0.5,
      cy: h * 0.7,
      radius: 58,
      flavor: FLAVORS.sky,
      numPoints: 24,
      shapeType: 'drop'
    }));
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.initCanvasSize();
    });

    const getPos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - r.left,
        y: e.clientY - r.top
      };
    };

    let activeDragShape = null;

    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      const pos = getPos(e);

      // Check shapes from top to bottom
      for (let i = this.shapes.length - 1; i >= 0; i--) {
        const s = this.shapes[i];
        if (s.containsPoint(pos.x, pos.y)) {
          activeDragShape = s;
          s.isDragged = true;
          s.dragOffsetX = s.cx - pos.x;
          s.dragOffsetY = s.cy - pos.y;
          s.applyImpulse((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);

          // Bring clicked shape to top
          this.shapes.splice(i, 1);
          this.shapes.push(s);
          break;
        }
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const pos = getPos(e);
      const dt = 0.016;
      this.localPointer.vx = (pos.x - (this.localPointer.prevX || pos.x)) / dt;
      this.localPointer.vy = (pos.y - (this.localPointer.prevY || pos.y)) / dt;
      this.localPointer.speed = Math.hypot(this.localPointer.vx, this.localPointer.vy);
      this.localPointer.prevX = this.localPointer.x;
      this.localPointer.prevY = this.localPointer.y;
      this.localPointer.x = pos.x;
      this.localPointer.y = pos.y;
      this.localPointer.active = true;
    });

    const release = () => {
      if (activeDragShape) {
        activeDragShape.isDragged = false;
        // Fling with kinetic momentum
        activeDragShape.vx = this.localPointer.vx * 0.025;
        activeDragShape.vy = this.localPointer.vy * 0.025;
        activeDragShape.applyImpulse(activeDragShape.vx * 0.8, activeDragShape.vy * 0.8);
        activeDragShape = null;
      }
    };

    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener('pointerleave', () => {
      this.localPointer.active = false;
      release();
    });

    // Toolbar actions
    const shakeBtn = document.getElementById('pg-shake-btn');
    if (shakeBtn) {
      shakeBtn.addEventListener('click', () => {
        this.shake();
      });
    }

    const gravityBtn = document.getElementById('pg-gravity-btn');
    const gravityLabel = document.getElementById('pg-gravity-label');
    if (gravityBtn && gravityLabel) {
      gravityBtn.addEventListener('click', () => {
        this.gravityEnabled = !this.gravityEnabled;
        gravityLabel.textContent = `🍎 Soft Gravity: ${this.gravityEnabled ? 'ON' : 'OFF'}`;
        gravityBtn.classList.toggle('active', this.gravityEnabled);
      });
    }

    const resetBtn = document.getElementById('pg-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.initShapes();
        this.shake();
      });
    }
  }

  shake() {
    this.shapes.forEach(s => {
      s.vx = (Math.random() - 0.5) * 16;
      s.vy = (Math.random() - 0.5) * 16 - 4;
      s.slap(20);
    });
  }

  resolveCollisions() {
    const len = this.shapes.length;
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const a = this.shapes[i];
        const b = this.shapes[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const dist = Math.hypot(dx, dy);
        const minDist = (a.radius + b.radius) * 0.88;

        if (dist < minDist && dist > 0.001) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;

          // Push centers apart
          const sep = overlap * 0.45;
          if (!a.isDragged) {
            a.cx -= nx * sep;
            a.cy -= ny * sep;
            a.vx -= nx * sep * 0.15;
            a.vy -= ny * sep * 0.15;
          }
          if (!b.isDragged) {
            b.cx += nx * sep;
            b.cy += ny * sep;
            b.vx += nx * sep * 0.15;
            b.vy += ny * sep * 0.15;
          }

          // Soft viscoelastic squish deformation at collision point
          a.applyImpulse(-nx * overlap * 0.35, -ny * overlap * 0.35);
          b.applyImpulse(nx * overlap * 0.35, ny * overlap * 0.35);
        }
      }
    }
  }

  update(dt) {
    if (!this.isVisible) return;

    this.localPointer.vx *= 0.85;
    this.localPointer.vy *= 0.85;
    this.localPointer.speed *= 0.85;

    const bounds = { width: this.width, height: this.height };

    // Update shapes
    this.shapes.forEach(s => {
      if (this.gravityEnabled && !s.isDragged) {
        s.vy += 0.25; // Gentle downward gravity
      }
      s.update(dt, bounds, this.localPointer, input.scroll.vy);
    });

    // Resolve soft collisions
    this.resolveCollisions();

    // Render
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.shapes.forEach(s => s.draw(this.ctx));
  }
}

/* ============================================================================
   7. JELLY COMPONENTS CONTROLLERS
   ============================================================================ */

/**
 * 7A. Squishy Jelly Buttons
 */
class JellyButtonComponent {
  constructor(wrapId, canvasSelector, nativeBtnId, flavor) {
    this.wrap = document.getElementById(wrapId);
    if (!this.wrap) return;

    this.canvas = this.wrap.querySelector(canvasSelector);
    this.nativeBtn = document.getElementById(nativeBtnId);
    if (!this.canvas || !this.nativeBtn) return;

    this.flavor = flavor;
    this.initCanvasSize();

    this.body = new JellyBody({
      cx: this.width / 2,
      cy: this.height / 2,
      radius: this.height * 0.48,
      flavor: this.flavor,
      numPoints: 24,
      shapeType: 'pill',
      pillWidth: this.width * 0.88,
      pillHeight: this.height * 0.78
    });

    this.isHovered = false;
    this.isPressed = false;
    this.initEvents();
  }

  initCanvasSize() {
    const res = setupCanvas(this.canvas);
    this.ctx = res.ctx;
    this.width = res.width;
    this.height = res.height;
  }

  initEvents() {
    this.wrap.addEventListener('pointerenter', () => {
      this.isHovered = true;
      document.body.classList.add('cursor-hover');
      this.body.applyImpulse(0, 3.5);
    });

    this.wrap.addEventListener('pointerleave', () => {
      this.isHovered = false;
      document.body.classList.remove('cursor-hover');
      this.body.applyImpulse(0, -2.5);
    });

    this.nativeBtn.addEventListener('pointerdown', () => {
      this.isPressed = true;
      // Strong squish compression on click
      this.body.applyImpulse(0, 9);
      const fb = document.getElementById('btn-feedback-msg');
      if (fb) fb.textContent = `🎉 Squished ${this.flavor.name} Button with elastic rebound!`;
    });

    this.nativeBtn.addEventListener('pointerup', () => {
      this.isPressed = false;
      this.body.applyImpulse(0, -8);
    });

    // Keyboard accessibility: Enter or Space triggers squash
    this.nativeBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        this.body.applyImpulse(0, 10);
      }
    });
  }

  update(dt) {
    this.body.cx = this.width / 2;
    this.body.cy = this.height / 2;
    this.body.update(dt, null, null, input.scroll.vy);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.body.draw(this.ctx);
  }
}

/**
 * 7B. Jelly Toggle Switch
 */
class JellyToggleComponent {
  constructor() {
    this.canvas = document.getElementById('toggle-canvas');
    this.statusEl = document.getElementById('toggle-state-text');
    if (!this.canvas) return;

    this.initCanvasSize();
    this.isOn = false;

    // Soft-body knob
    this.knobRadius = 38;
    this.knobX = 65;
    this.knobTargetX = 65;
    this.knobY = this.height / 2;
    this.knobVx = 0;

    this.knobBody = new JellyBody({
      cx: this.knobX,
      cy: this.knobY,
      radius: this.knobRadius,
      flavor: FLAVORS.strawberry,
      numPoints: 20,
      shapeType: 'circle'
    });

    this.isDragging = false;
    this.initEvents();
  }

  initCanvasSize() {
    const res = setupCanvas(this.canvas);
    this.ctx = res.ctx;
    this.width = res.width;
    this.height = res.height;
  }

  initEvents() {
    const toggle = () => {
      this.isOn = !this.isOn;
      this.updateStateUI();
    };

    this.canvas.addEventListener('click', (e) => {
      toggle();
    });

    this.canvas.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  updateStateUI() {
    this.canvas.setAttribute('aria-checked', String(this.isOn));
    if (this.statusEl) {
      this.statusEl.textContent = this.isOn ? 'ON (Mint)' : 'OFF (Strawberry)';
    }

    if (this.isOn) {
      this.knobTargetX = this.width - 65;
      this.knobBody.flavor = FLAVORS.mint;
      this.knobBody.applyImpulse(14, 0); // Fling overshoot right
    } else {
      this.knobTargetX = 65;
      this.knobBody.flavor = FLAVORS.strawberry;
      this.knobBody.applyImpulse(-14, 0); // Fling overshoot left
    }
  }

  update(dt) {
    // Track spring physics for toggle knob
    const springForce = (this.knobTargetX - this.knobX) * 0.22;
    this.knobVx = (this.knobVx + springForce) * 0.82;
    this.knobX += this.knobVx;

    this.knobBody.cx = this.knobX;
    this.knobBody.cy = this.height / 2;
    this.knobBody.update(dt, null, null, input.scroll.vy);

    // Draw track
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Soft pill track background
    this.ctx.save();
    const trackH = 68;
    const trackY = (this.height - trackH) / 2;
    const trackR = trackH / 2;

    this.ctx.beginPath();
    this.ctx.roundRect(20, trackY, this.width - 40, trackH, trackR);
    this.ctx.fillStyle = this.isOn ? 'rgba(0, 210, 148, 0.25)' : 'rgba(255, 59, 105, 0.2)';
    this.ctx.fill();
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = this.isOn ? 'rgba(0, 210, 148, 0.6)' : 'rgba(255, 59, 105, 0.4)';
    this.ctx.stroke();
    this.ctx.restore();

    // Draw jelly knob
    this.knobBody.draw(this.ctx);
  }
}

/**
 * 7C. Elastic Jelly Slider
 */
class JellySliderComponent {
  constructor() {
    this.canvas = document.getElementById('slider-canvas');
    this.readout = document.getElementById('slider-val-readout');
    if (!this.canvas) return;

    this.initCanvasSize();
    this.value = 50; // 0 to 100
    this.trackPoints = [];
    this.numTrackPoints = 21;

    // Initialize sagging ribbon points
    this.initTrackPoints();

    // Handle jelly blob
    this.handleRadius = 26;
    this.handleX = this.getHandleX();
    this.handleY = this.height / 2;
    this.handleBody = new JellyBody({
      cx: this.handleX,
      cy: this.handleY,
      radius: this.handleRadius,
      flavor: FLAVORS.sky,
      numPoints: 20,
      shapeType: 'circle'
    });

    this.isDragging = false;
    this.initEvents();
  }

  initCanvasSize() {
    const res = setupCanvas(this.canvas);
    this.ctx = res.ctx;
    this.width = res.width;
    this.height = res.height;
  }

  initTrackPoints() {
    this.trackPoints = [];
    const pad = 50;
    const span = this.width - pad * 2;
    const midY = this.height / 2;

    for (let i = 0; i < this.numTrackPoints; i++) {
      const t = i / (this.numTrackPoints - 1);
      this.trackPoints.push({
        baseX: pad + t * span,
        baseY: midY,
        x: pad + t * span,
        y: midY,
        vy: 0
      });
    }
  }

  getHandleX() {
    const pad = 50;
    const span = this.width - pad * 2;
    return pad + (this.value / 100) * span;
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.initCanvasSize();
      this.initTrackPoints();
    });

    const getPos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - r.left,
        y: e.clientY - r.top
      };
    };

    const updateFromX = (x, y) => {
      const pad = 50;
      const span = this.width - pad * 2;
      const clampedX = Math.max(pad, Math.min(pad + span, x));
      this.value = Math.round(((clampedX - pad) / span) * 100);

      this.canvas.setAttribute('aria-valuenow', String(this.value));
      if (this.readout) this.readout.textContent = `${this.value}%`;

      // Sag track points towards pointer Y
      const midY = this.height / 2;
      const sagY = Math.max(midY - 35, Math.min(midY + 50, y));

      this.trackPoints.forEach(p => {
        const dist = Math.abs(p.baseX - clampedX);
        if (dist < 120) {
          const factor = 1 - dist / 120;
          p.vy += (sagY - p.y) * factor * 0.35;
        }
      });
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.isDragging = true;
      const pos = getPos(e);
      updateFromX(pos.x, pos.y);
      this.handleBody.applyImpulse(0, 10);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.isDragging) {
        const pos = getPos(e);
        updateFromX(pos.x, pos.y);
      }
    });

    const stop = () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.handleBody.applyImpulse(0, -8);
      }
    };

    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);

    // Keyboard support
    this.canvas.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        this.value = Math.min(100, this.value + 5);
        this.handleBody.applyImpulse(8, 0);
        this.canvas.setAttribute('aria-valuenow', String(this.value));
        if (this.readout) this.readout.textContent = `${this.value}%`;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        this.value = Math.max(0, this.value - 5);
        this.handleBody.applyImpulse(-8, 0);
        this.canvas.setAttribute('aria-valuenow', String(this.value));
        if (this.readout) this.readout.textContent = `${this.value}%`;
      }
    });
  }

  update(dt) {
    // 1. Update elastic track ribbon physics
    const N = this.trackPoints.length;
    for (let i = 0; i < N; i++) {
      const p = this.trackPoints[i];
      // Restoring force to center line
      const fy = (p.baseY - p.y) * 0.18;
      p.vy = (p.vy + fy) * 0.86;
      p.y += p.vy;
    }

    // Smooth neighbor smoothing
    for (let i = 1; i < N - 1; i++) {
      const p = this.trackPoints[i];
      const avgY = (this.trackPoints[i - 1].y + this.trackPoints[i + 1].y) * 0.5;
      p.y += (avgY - p.y) * 0.15;
    }

    // 2. Update handle position
    const targetX = this.getHandleX();
    this.handleX += (targetX - this.handleX) * 0.28;

    // Find track Y at handle X
    const pad = 50;
    const span = this.width - pad * 2;
    const t = Math.max(0, Math.min(1, (this.handleX - pad) / span));
    const idx = t * (N - 1);
    const low = Math.floor(idx);
    const high = Math.min(N - 1, low + 1);
    const frac = idx - low;
    const currentTrackY = this.trackPoints[low].y * (1 - frac) + this.trackPoints[high].y * frac;

    this.handleBody.cx = this.handleX;
    this.handleBody.cy = currentTrackY;
    this.handleBody.update(dt, null, null, input.scroll.vy);

    // 3. Render
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw drooping ribbon track
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(this.trackPoints[0].x, this.trackPoints[0].y);
    for (let i = 1; i < N; i++) {
      const prev = this.trackPoints[i - 1];
      const curr = this.trackPoints[i];
      const mx = (prev.x + curr.x) * 0.5;
      const my = (prev.y + curr.y) * 0.5;
      this.ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    this.ctx.lineTo(this.trackPoints[N - 1].x, this.trackPoints[N - 1].y);
    this.ctx.lineWidth = 14;
    this.ctx.lineCap = 'round';
    this.ctx.strokeStyle = 'rgba(0, 166, 251, 0.35)';
    this.ctx.stroke();

    // Inner highlight line
    this.ctx.lineWidth = 4;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.stroke();
    this.ctx.restore();

    // Draw jelly handle
    this.handleBody.draw(this.ctx);
  }
}

/**
 * 7D. Wobbly 3D Gelatin Cards
 */
class JellyCardsController {
  constructor() {
    this.cards = document.querySelectorAll('.wobble-card');
    if (!this.cards.length) return;

    this.cardStates = [];
    this.cards.forEach(card => {
      this.cardStates.push({
        el: card,
        rotX: 0,
        rotY: 0,
        targetRotX: 0,
        targetRotY: 0,
        vx: 0,
        vy: 0
      });

      card.addEventListener('pointermove', (e) => {
        const rect = card.getBoundingClientRect();
        const normX = (e.clientX - rect.left) / rect.width - 0.5;
        const normY = (e.clientY - rect.top) / rect.height - 0.5;

        const state = this.cardStates.find(s => s.el === card);
        if (state) {
          state.targetRotX = -normY * 26; // Degrees
          state.targetRotY = normX * 26;
        }
      });

      card.addEventListener('pointerleave', () => {
        const state = this.cardStates.find(s => s.el === card);
        if (state) {
          state.targetRotX = 0;
          state.targetRotY = 0;
          // Wobble bounce back
          state.vx += (Math.random() - 0.5) * 8;
          state.vy += (Math.random() - 0.5) * 8;
        }
      });
    });
  }

  update(dt) {
    this.cardStates.forEach(s => {
      // Spring damper towards target tilt
      const fx = (s.targetRotX - s.rotX) * 0.16;
      const fy = (s.targetRotY - s.rotY) * 0.16;

      s.vx = (s.vx + fx) * 0.84;
      s.vy = (s.vy + fy) * 0.84;

      s.rotX += s.vx * JELLY_CONFIG.wobbleAmount;
      s.rotY += s.vy * JELLY_CONFIG.wobbleAmount;

      s.el.style.transform = `perspective(1000px) rotateX(${s.rotX.toFixed(2)}deg) rotateY(${s.rotY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
    });
  }
}

/**
 * 7E. Jelly Typography (Interactive "JELLY" letters)
 */
class JellyTextController {
  constructor() {
    this.canvas = document.getElementById('text-canvas');
    if (!this.canvas) return;

    this.initCanvasSize();
    this.letters = [];
    this.chars = ['J', 'E', 'L', 'L', 'Y'];
    this.flavors = [FLAVORS.strawberry, FLAVORS.mint, FLAVORS.lemon, FLAVORS.grape, FLAVORS.sky];

    this.initLetters();
    this.initEvents();
  }

  initCanvasSize() {
    const res = setupCanvas(this.canvas);
    this.ctx = res.ctx;
    this.width = res.width;
    this.height = res.height;
  }

  initLetters() {
    this.letters = [];
    const count = this.chars.length;
    const spacing = this.width / (count + 1);

    for (let i = 0; i < count; i++) {
      const blob = new JellyBody({
        cx: spacing * (i + 1),
        cy: this.height / 2,
        radius: 44,
        flavor: this.flavors[i % this.flavors.length],
        numPoints: 20,
        shapeType: 'squircle'
      });
      this.letters.push({
        char: this.chars[i],
        blob: blob
      });
    }
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.initCanvasSize();
      this.initLetters();
    });

    const getPos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - r.left,
        y: e.clientY - r.top
      };
    };

    this.canvas.addEventListener('pointermove', (e) => {
      const pos = getPos(e);
      this.letters.forEach(item => {
        const d = Math.hypot(item.blob.cx - pos.x, item.blob.cy - pos.y);
        if (d < 70) {
          const factor = (1 - d / 70) * 12;
          item.blob.applyImpulse((Math.random() - 0.5) * factor, (Math.random() - 0.5) * factor);
        }
      });
    });

    const jiggleBtn = document.getElementById('jelly-text-jiggle-btn');
    if (jiggleBtn) {
      jiggleBtn.addEventListener('click', () => {
        this.letters.forEach((item, idx) => {
          setTimeout(() => {
            item.blob.slap(18);
          }, idx * 70);
        });
      });
    }
  }

  update(dt) {
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.letters.forEach(item => {
      item.blob.update(dt, null, null, input.scroll.vy);
      item.blob.draw(this.ctx);

      // Render letter text centered inside the squishy blob
      this.ctx.save();
      this.ctx.font = '700 42px "Fredoka", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetY = 2;
      this.ctx.fillText(item.char, item.blob.cx, item.blob.cy);
      this.ctx.restore();
    });
  }
}

/* ============================================================================
   8. SCROLL STORY SECTION: 4-STAGE VISCOELASTIC MORPHING
   ============================================================================ */
class ScrollStoryController {
  constructor() {
    this.canvas = document.getElementById('story-canvas');
    this.progressBar = document.getElementById('story-progress-bar');
    this.badgeLabel = document.getElementById('story-badge-label');
    this.steps = document.querySelectorAll('.story-step');
    if (!this.canvas) return;

    this.initCanvasSize();
    this.currentStep = 0;

    this.storyBlob = new JellyBody({
      cx: this.width / 2,
      cy: this.height / 2,
      radius: this.width * 0.32,
      flavor: FLAVORS.strawberry,
      numPoints: 32,
      shapeType: 'circle'
    });

    this.initEvents();
  }

  initCanvasSize() {
    const res = setupCanvas(this.canvas);
    this.ctx = res.ctx;
    this.width = res.width;
    this.height = res.height;
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.initCanvasSize();
      if (this.storyBlob) {
        this.storyBlob.cx = this.width / 2;
        this.storyBlob.cy = this.height / 2;
        this.storyBlob.radius = this.width * 0.32;
        this.storyBlob.initGeometry();
      }
    });

    window.addEventListener('scroll', () => {
      this.checkActiveStep();
    }, { passive: true });
  }

  checkActiveStep() {
    const scrollMid = window.scrollY + window.innerHeight * 0.5;
    let activeIdx = 0;

    this.steps.forEach((step, idx) => {
      const top = step.offsetTop;
      const height = step.offsetHeight;
      if (scrollMid >= top && scrollMid < top + height) {
        activeIdx = idx;
      }
    });

    if (activeIdx !== this.currentStep) {
      this.currentStep = activeIdx;
      this.onStepChange(activeIdx);
    }

    if (this.progressBar) {
      const pct = ((activeIdx + 1) / this.steps.length) * 100;
      this.progressBar.style.width = `${pct}%`;
    }
  }

  onStepChange(idx) {
    this.steps.forEach((st, i) => st.classList.toggle('active', i === idx));

    const labels = [
      'State 1: Impact & Squish',
      'State 2: Elastic Rebound',
      'State 3: Harmonic Ripples',
      'State 4: Thermal Breathing'
    ];

    if (this.badgeLabel) {
      this.badgeLabel.textContent = labels[idx] || '';
    }

    // Trigger state-specific physical deformation
    if (idx === 0) {
      // Impact: Flatten against floor
      this.storyBlob.flavor = FLAVORS.strawberry;
      this.storyBlob.applyImpulse(0, 24);
    } else if (idx === 1) {
      // Rebound: Pull tall like taffy
      this.storyBlob.flavor = FLAVORS.lemon;
      this.storyBlob.applyImpulse(0, -28);
    } else if (idx === 2) {
      // Harmonic ripples
      this.storyBlob.flavor = FLAVORS.grape;
      this.storyBlob.slap(26);
    } else if (idx === 3) {
      // Equilibrium
      this.storyBlob.flavor = FLAVORS.mint;
      this.storyBlob.applyImpulse(0, 4);
    }
  }

  update(dt) {
    this.storyBlob.cx = this.width / 2;
    this.storyBlob.cy = this.height / 2;
    this.storyBlob.update(dt, null, null, input.scroll.vy);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.storyBlob.draw(this.ctx);
  }
}

/* ============================================================================
   9. FOOTER BIG CTA CONTROLLER
   ============================================================================ */
class FooterCTAController {
  constructor() {
    this.canvas = document.getElementById('footer-btn-canvas');
    this.button = document.getElementById('footer-top-btn');
    if (!this.canvas || !this.button) return;

    this.initCanvasSize();
    this.body = new JellyBody({
      cx: this.width / 2,
      cy: this.height / 2,
      radius: this.height * 0.46,
      flavor: FLAVORS.strawberry,
      numPoints: 28,
      shapeType: 'pill',
      pillWidth: this.width * 0.9,
      pillHeight: this.height * 0.8
    });

    this.initEvents();
  }

  initCanvasSize() {
    const res = setupCanvas(this.canvas);
    this.ctx = res.ctx;
    this.width = res.width;
    this.height = res.height;
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.initCanvasSize();
      this.body.cx = this.width / 2;
      this.body.cy = this.height / 2;
      this.body.initGeometry();
    });

    this.button.addEventListener('pointerenter', () => {
      this.body.applyImpulse(0, 4);
      document.body.classList.add('cursor-hover');
    });

    this.button.addEventListener('pointerleave', () => {
      this.body.applyImpulse(0, -3);
      document.body.classList.remove('cursor-hover');
    });

    this.button.addEventListener('click', () => {
      this.body.slap(24);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  update(dt) {
    this.body.cx = this.width / 2;
    this.body.cy = this.height / 2;
    this.body.update(dt, null, null, input.scroll.vy);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.body.draw(this.ctx);
  }
}

/* ============================================================================
   10. PHYSICS TUNER DRAWER (Real-time tweaking)
   ============================================================================ */
class PhysicsTuner {
  constructor() {
    this.drawer = document.getElementById('physics-tuner');
    this.toggleBtn = document.getElementById('tuner-toggle');
    this.resetBtn = document.getElementById('tuner-reset-btn');
    if (!this.drawer || !this.toggleBtn) return;

    this.initControls();
    this.initEvents();
  }

  initControls() {
    this.inputs = {
      stiffness: document.getElementById('param-stiffness'),
      damping: document.getElementById('param-damping'),
      perimeter: document.getElementById('param-perimeter'),
      force: document.getElementById('param-force'),
      wobble: document.getElementById('param-wobble')
    };

    this.displays = {
      stiffness: document.getElementById('val-stiffness'),
      damping: document.getElementById('val-damping'),
      perimeter: document.getElementById('val-perimeter'),
      force: document.getElementById('val-force'),
      wobble: document.getElementById('val-wobble')
    };
  }

  initEvents() {
    this.toggleBtn.addEventListener('click', () => {
      const isOpen = this.drawer.classList.toggle('open');
      this.toggleBtn.setAttribute('aria-expanded', String(isOpen));
    });

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const pKey = btn.getAttribute('data-preset');
        if (PRESETS[pKey]) {
          this.applyPreset(PRESETS[pKey]);
        }
      });
    });

    // Slider inputs
    if (this.inputs.stiffness) {
      this.inputs.stiffness.addEventListener('input', (e) => {
        JELLY_CONFIG.stiffness = parseFloat(e.target.value);
        if (this.displays.stiffness) this.displays.stiffness.textContent = e.target.value;
      });
    }

    if (this.inputs.damping) {
      this.inputs.damping.addEventListener('input', (e) => {
        JELLY_CONFIG.damping = parseFloat(e.target.value);
        if (this.displays.damping) this.displays.damping.textContent = e.target.value;
      });
    }

    if (this.inputs.perimeter) {
      this.inputs.perimeter.addEventListener('input', (e) => {
        JELLY_CONFIG.perimeterTension = parseFloat(e.target.value);
        if (this.displays.perimeter) this.displays.perimeter.textContent = e.target.value;
      });
    }

    if (this.inputs.force) {
      this.inputs.force.addEventListener('input', (e) => {
        JELLY_CONFIG.pointerForce = parseFloat(e.target.value);
        if (this.displays.force) this.displays.force.textContent = e.target.value;
      });
    }

    if (this.inputs.wobble) {
      this.inputs.wobble.addEventListener('input', (e) => {
        JELLY_CONFIG.wobbleAmount = parseFloat(e.target.value);
        if (this.displays.wobble) this.displays.wobble.textContent = e.target.value;
      });
    }

    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        this.applyPreset(PRESETS.classic);
        document.querySelectorAll('.preset-btn').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-preset') === 'classic');
        });
      });
    }
  }

  applyPreset(preset) {
    JELLY_CONFIG.stiffness = preset.stiffness;
    JELLY_CONFIG.damping = preset.damping;
    JELLY_CONFIG.perimeterTension = preset.perimeterTension;
    JELLY_CONFIG.pointerForce = preset.pointerForce;
    JELLY_CONFIG.wobbleAmount = preset.wobbleAmount;

    if (this.inputs.stiffness) this.inputs.stiffness.value = preset.stiffness;
    if (this.inputs.damping) this.inputs.damping.value = preset.damping;
    if (this.inputs.perimeter) this.inputs.perimeter.value = preset.perimeterTension;
    if (this.inputs.force) this.inputs.force.value = preset.pointerForce;
    if (this.inputs.wobble) this.inputs.wobble.value = preset.wobbleAmount;

    if (this.displays.stiffness) this.displays.stiffness.textContent = preset.stiffness;
    if (this.displays.damping) this.displays.damping.textContent = preset.damping;
    if (this.displays.perimeter) this.displays.perimeter.textContent = preset.perimeterTension;
    if (this.displays.force) this.displays.force.textContent = preset.pointerForce;
    if (this.displays.wobble) this.displays.wobble.textContent = preset.wobbleAmount;
  }
}

/* ============================================================================
   11. MAIN APPLICATION LOOP (Delta-time 60fps & Intersection Observer)
   ============================================================================ */
class JellyApp {
  constructor() {
    this.hero = new HeroController();
    this.playground = new PlaygroundController();

    this.btn1 = new JellyButtonComponent('btn-wrap-1', '.jelly-btn-canvas', 'action-btn-1', FLAVORS.strawberry);
    this.btn2 = new JellyButtonComponent('btn-wrap-2', '.jelly-btn-canvas', 'action-btn-2', FLAVORS.mint);
    this.toggle = new JellyToggleComponent();
    this.slider = new JellySliderComponent();
    this.cards = new JellyCardsController();
    this.text = new JellyTextController();
    this.story = new ScrollStoryController();
    this.footer = new FooterCTAController();
    this.tuner = new PhysicsTuner();

    this.lastTime = performance.now();
    this.initVisibilityObserver();
    this.startLoop();
  }

  /**
   * Only animate sections that are visible in viewport
   */
  initVisibilityObserver() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = entry.target.id;
        const visible = entry.isIntersecting;

        if (id === 'hero' && this.hero) this.hero.isVisible = visible;
        if (id === 'playground' && this.playground) this.playground.isVisible = visible;
      });
    }, { threshold: 0.05 });

    const heroSec = document.getElementById('hero');
    const pgSec = document.getElementById('playground');
    if (heroSec) observer.observe(heroSec);
    if (pgSec) observer.observe(pgSec);
  }

  startLoop() {
    const frame = (now) => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.06); // Cap dt to avoid explosion on tab inactive
      this.lastTime = now;

      // Decay global velocities
      input.decay();

      // Update and render all active components
      if (this.hero) this.hero.update(dt);
      if (this.playground) this.playground.update(dt);
      if (this.btn1) this.btn1.update(dt);
      if (this.btn2) this.btn2.update(dt);
      if (this.toggle) this.toggle.update(dt);
      if (this.slider) this.slider.update(dt);
      if (this.cards) this.cards.update(dt);
      if (this.text) this.text.update(dt);
      if (this.story) this.story.update(dt);
      if (this.footer) this.footer.update(dt);

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }
}

// Boot application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.__JELLY_APP__ = new JellyApp();
});
