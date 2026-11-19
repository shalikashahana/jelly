# Jelly UI 🍮

A front-end only, dependency-free interactive website where UI elements behave like authentic soft-body gelatin when touched, dragged, or scrolled through.

Built with plain **HTML5**, **CSS3**, and **vanilla JavaScript**. No frameworks, no build tools, no external physics libraries.

---

## ✨ Features

- **Soft-Body Viscoelastic Physics**: Outline vertices tethered by Hooke's Law restoring springs and Laplacian perimeter tension.
- **Organic Curvature**: Rendered using midpoint quadratic Bezier splines (Catmull-Rom style), eliminating polygonal edges.
- **Dynamic 3D Optics**: Multi-stop radial gradients, subsurface refraction, ambient drop shadows, and specular highlights that shift and deform dynamically with physical strain.
- **Velocity-Sensitive Cursor Interaction**:
  - Slow movement creates gentle surface dents.
  - Fast flicks deliver kinetic shockwaves and harmonic ripples.
  - Click and drag stretches the body; releasing triggers elastic overshoot and decaying oscillations.
- **Scroll Kinetics**: Scroll velocity imparts a vertical lag/jiggle impulse to jelly elements, settling back when scrolling stops.
- **Custom Jelly Cursor**: Fluid cursor that stretches along its motion vector.
- **Tactile UI Showcase**:
  - **Hero ("Giga Jelly")**: Massive interactive centerpiece with live deformation telemetry and flavor cycling.
  - **Playground**: 5 soft-body shapes (Circle, Squircle, 5-point Star, Capsule Pill, and Teardrop) with soft boundary bouncing, shape collisions, and gravity toggle.
  - **Squishy Buttons**: Compress elastically on hover, click, and keyboard focus.
  - **Jelly Toggle Switch**: Squishy pill track and bouncy knob that springs across with overshoot.
  - **Elastic Jelly Slider**: Sagging, flexible ribbon track that droops when pulled.
  - **Wobbly Content Cards**: 3D spring-damper card tilt tracking cursor coordinates.
  - **Jelly Typography**: Interactive "J-E-L-L-Y" letters that ripple when swept across.
  - **Scroll Story**: Sticky morphing visualization of the 4 viscoelastic states (*Impact*, *Rebound*, *Harmonics*, *Breathing*).
  - **Footer CTA**: Large gelatin button with snap-back-to-top bounce.
- **Real-Time Physics Tuner**: Floating drawer allowing on-the-fly adjustment of stiffness, damping, perimeter tension, force, and presets (**Jiggly**, **Classic**, **Firm**, **Gooey**).
- **Accessible & Responsive**: Keyboard navigable, visible focus outlines, retina display (`devicePixelRatio`) support, and `prefers-reduced-motion` compliance.

---

## 🚀 Getting Started

No build step or server required! Simply clone the repository and open `index.html` in any modern web browser:

```bash
git clone https://github.com/shalikashahana/jelly.git
cd jelly
```

Double click `index.html` or serve with any static file server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .
```

Then visit `http://localhost:8000`.

---

## ⚙️ Physics Configuration

You can easily customize the jelly feel at the top of `script.js`:

```javascript
const JELLY_CONFIG = {
  stiffness: 0.12,         // Restoring spring strength (higher = snappier)
  damping: 0.89,           // Velocity decay per frame (lower = thicker pudding)
  perimeterTension: 0.24,  // Tension between neighbor vertices
  pointerForce: 1.8,       // Cursor push multiplier
  pointerRadius: 85,       // Radius of cursor influence in pixels
  wobbleAmount: 1.0,       // Global wobble amplitude multiplier
  idleAmplitude: 3.0,      // Ambient breathing amplitude
  idleFrequency: 1.6,      // Ambient breathing cycle speed
  dragSpring: 0.16,        // Pull strength when dragging
  scrollReaction: 0.35,    // Squish impulse from scroll velocity
  collisionBounce: 0.55    // Restitution between colliding shapes
};
```

---

## 📄 License

MIT License. Free to use and explore!
