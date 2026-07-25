# Design Inspiration: Noomo Scrollytelling

Reference: https://storytelling.noomoagency.com/

## Why It Matters

The Noomo reference shows the kind of premium, immersive landing page Veltact could use to feel memorable before users enter the actual RapidMatch workflow.

The inspiration is not the exact visual theme. The useful pattern is:

- a cinematic first impression
- scroll-driven product storytelling
- high craft in motion, lighting and depth
- a transition from brand narrative into a concrete product workflow

For Veltact, this should support the message:

> From urgent industrial need to committed supplier, in one workflow.

## Core Technology Pattern

### WebGL and Three.js

Noomo-style pages use WebGL for real-time graphics in the browser. Three.js is the common JavaScript library used to make WebGL practical.

This enables:

- 3D spaces
- animated camera movement
- lights and shadows
- glass, metal and industrial material effects
- particles, floating objects and depth
- product metaphors that are rendered by code instead of video

### Scroll-Bound Animation

The experience is scrollytelling, not a normal static page.

Instead of a video autoplaying, the user's scroll controls:

- camera position
- scene transitions
- object movement
- reveal timing
- text sequencing

This makes the story feel interactive while still being guided.

### Custom Shaders

Custom GLSL shaders can create effects that normal CSS cannot, such as:

- lit hallway glow
- refraction and glass
- animated scan lines or signal flows
- rich industrial lighting
- subtle depth, blur and material texture

For Veltact, shader effects should stay restrained and product-relevant: signal paths, supplier network lines, machinery glow, payment confirmation states, or structured brief formation.

### GSAP

GSAP is commonly paired with Three.js to coordinate:

- smooth scroll progress
- camera interpolation
- object timelines
- section transitions
- text and UI animation synced with 3D movement

GSAP's ScrollTrigger plugin is often used for scrollytelling.

## What Veltact Currently Has

Current frontend app:

- `apps/buyer`
- static HTML pages
- vanilla TypeScript
- CSS files
- client-side DOM rendering with `innerHTML`
- API calls to the Express backend

Current rendering model:

- no React
- no Vite frontend runtime
- no Three.js
- no WebGL scene
- no GSAP
- no shader pipeline
- no canvas-based landing page

## What We Need For A Noomo-Style Landing Page

To build a premium landing page in this direction, add only the minimum stack needed:

- `three` for WebGL scenes
- `gsap` for scroll-bound animation
- a dedicated landing entrypoint, separate from the buyer workflow
- a `<canvas>` scene for the hero/scrollytelling layer
- static fallback content for accessibility and slower devices

Optional later:

- custom GLSL shader files
- postprocessing effects
- asset compression
- reduced-motion mode

## Product-Specific Landing Concept

The landing page should not be generic SaaS.

Suggested narrative:

1. **Line stop**
   - A dark industrial floor or conveyor signal fails.
2. **One brief**
   - Messy requirement text becomes a structured Need Profile.
3. **Supplier market response**
   - A small network of relevant suppliers lights up with explainable match reasons.
4. **Comparable responses**
   - Availability, price, experience and conditions align into a comparison surface.
5. **Pinch-secured engagement**
   - The selected supplier moves into a secured payment state.

## Design Guardrails

- Keep the actual app quiet, dense and operational.
- Use cinematic motion on the landing page, not throughout every dashboard screen.
- Do not hide the product behind abstract visuals.
- Make Pinch integration visible as trust and commercial commitment, not decorative checkout.
- Provide a normal accessible path for users who skip motion or use reduced motion.
- The landing page should lead directly into the working buyer demo.

## Current Stack Verdict

We do not currently have the rendering stack needed for a Noomo-level immersive landing page.

We do have a simple static TypeScript frontend that can host one, but we would need to add Three.js and GSAP, then create a dedicated landing page entrypoint.
