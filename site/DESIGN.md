---
name: Kareer public website
description: Paperwork with attitude.
colors:
  primary: "#c5f55a"
  paper: "#f7f6f0"
  paper-deep: "#efeee6"
  ink: "#20231c"
  muted-ink: "#62665a"
  rule: "#d5d7ca"
  inferred-ink: "#775210"
  inferred-paper: "#fff0c9"
typography:
  display:
    fontFamily: "Bricolage Grotesque, sans-serif"
    fontSize: "clamp(60px, 6.8vw, 96px)"
    fontWeight: 750
    lineHeight: 0.99
    letterSpacing: "-0.035em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    lineHeight: 1.65
  data:
    fontFamily: "Geist Mono, monospace"
rounded:
  control: "9px"
  sheet: "12px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
  section: "110px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "54px"
---

# Kareer public website design

## Overview

**Creative North Star: "Paperwork with attitude."**

Warm paper, confident ink typography and electric lime give an exhausted applicant a lighter way into a repetitive task. The voice is playfully fed up with the process. Precise layouts support a few tilted sheets, annotations and stamps.

This system applies to the public website only. The repository-root DESIGN.md continues to govern the extension and document editor.

## Colors

Lime marks the primary action and completion. Amber identifies inferred sample answers; their text labels carry the meaning too. Quiet paper separates content without a wall of cards. The privacy summary uses an ink background and light text.

## Typography

Display headings use the licensed Cojeev Bricolage Grotesque face. Body text uses its DM Sans. Existing Geist Mono is restricted to form metadata, source labels and technical values. Keep display tracking above -0.04em.

## Layout

The desktop container caps at 1240px, with 48px side margins. Below 1100px margins reduce to 32px; below 580px they reduce to 20px. The hero stacks below 800px. Documents and other paired sections stack below 580px. Reading pages switch their sticky contents column into wrapping links below 800px.

## Elevation & Depth

Application sheets and document previews use soft offset shadows to communicate physical layering. Hairline rules organize ordinary content. Use the paper stack sparingly; the default page surface stays quiet.

## Shapes

Controls have softly squared corners. Sheet corners are gently curved. The tilted sheets describe repetitive applications, rather than decoration unrelated to the product.

## Components

Use actual Cojeev Button, Tabs, Tooltip, TextReveal, MotionPresence and MotionSurface before creating new equivalents. The user chose subtle/comet with speed 0.85, intensity 1.75, hover enabled and hover strength 0.75. The hero's bounded field sequence is custom state coordination over those primitives. Reduced motion skips playback and shows the complete result immediately.

The demo uses only labeled fictional data. Source labels are keyboard/click accessible. Native details provide FAQ disclosure. Privacy and setup inherit the same tokens with quieter typography and an article layout.

Landing-page motion uses a folded, line-staggered TextReveal hero (760ms, 100ms stagger) and an eased lime underline draw. ScrollReveal reuses MotionSurface, Cojeev visibility handling and its enter easing: 700ms arrivals, 22px translation and a bounded 2px softening. Headline and demo enter together, followed by copy, then buttons; actual completion advances each group. A small extension to Cojeev TextReveal exposes playback state. Normal-motion entrances are concealed before hydration and while waiting, preserving layout space. A head-script opt-in keeps no-JavaScript content readable and falls back to visible content if startup fails. Benefit and document entrances use the original short stagger; receipt and closing groups play once on entry. Reduced motion shows resting content immediately. Native scrolling remains in control.

## Do's and Don'ts

- Do keep installation, model costs and data transmission explicit.
- Do keep copy grounded in the available product and distribution routes.
- Do give one expressive sequence room to breathe.
- Don't invent testimonials, performance guarantees or application outcomes.
- Don't introduce animation that gates reading or requires hover to understand content.
