# Profile and document preview fixes

Work starts from `feature/materials-editor-ux` at `d321150`.

1. [x] Center the profile within the content area beside the sidebar, preserving responsive widths.
2. [x] Restore subsection quick links under Profile; jump to overview cards and preserve section editing and history navigation.
3. [x] Give “In this document” more width on desktop while retaining the compact navigation on small screens.
4. [x] Display uncategorized technical skills inline with separators, matching PDF/Word; preserve categorized rows and lossless edits.
5. [x] Show the actual exported PDF page count while editing, distinguish pending edits from current output, and label individual proof pages with visible boundaries.
6. [x] Run relevant profile, editor, export, and browser checks together; review the diff and keep focused commits.

## Verification

- Targeted units: 61/61 passed across profile, profile storage, editor/autosave, export and library files.
- Real-extension browser checks: 35/35 passed across `workspace.spec.js` and `materials.spec.js` together on the final source, including section saves, route history, downloads, PDF proofs, generation and application uploads.
- Chrome, Firefox and userscript builds passed at v0.5.114; the build-cache source hash matches the final source.
- Reviewed desktop/phone proof screenshots and responsive geometry. `git diff --check` passed.
- Each fix has a focused commit; standard build/version synchronization is recorded separately. Targeted checks follow the active branch's `AGENTS.md`.
