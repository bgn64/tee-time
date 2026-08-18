# Feedback: light and dark theme

Branch: `bgn64/light-dark-theme`
Date: 2026-08-18

## Items

### F1 — Support system, light, and dark appearance modes

- Verbatim: "the app should support a dark and light color scheme. The existing theme can be the dark one, but there should be a corresponding light one. The default should be to use the systme color scheme (if avaialble). If not available for some reason, light can be the default. We should have the option to also pick explicitly. So thre options, light, dark, system (which is the default)."
- Triage: clean
- Proposed mockup change: Preserve Aurora Glass as the dark palette and add a corresponding daylight Aurora palette with pale cool backgrounds, translucent white glass, dark text, and adjusted accent contrast. Add an Appearance settings screen with System, Light, and Dark choices; System is selected by default and resolves to light when the platform preference is unavailable.
- Decision: accepted
- Backend: none

### F2 — Demonstrate the proposed light appearance

- Verbatim: "Please generate one or two main screens in the mockup to show the proposed lgith color scheme"
- Triage: clean
- Proposed mockup change: Add light-theme variants of the Feed and Appearance screens to the active mockup, marked as feedback updates, while retaining the existing dark screens as the dark-theme reference.
- Decision: accepted
- Backend: none

## Notes

The light palette should remain recognizably Aurora rather than becoming a
generic white UI: cyan/lime glow fields, translucent surfaces, and semantic
performance colors remain, with contrast adjusted for daylight surfaces.
Appearance is reached from the gear button in the You screen header.
Because that gear previously signed out directly, Sign out moves to the bottom
of Appearance rather than being removed.
