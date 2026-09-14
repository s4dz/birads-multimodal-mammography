# Mammo QA Workbench — AI Prediction Validation

A radiologist-facing web application for validating AI predictions on **digital
mammography**. Reviewers read each mammogram in a dark high-contrast viewer
(both standard web images **and native DICOM**), compare it with the model's
3-class prediction (Normal / Benign-leaning / Suspicious, shown with the BI-RADS span
it covers), then **approve** or **relabel** with optional notes. Every
decision is emitted in a structured validation payload and posted to the API.

Built with **Next.js (App Router) + React 19 + TypeScript + Tailwind CSS v4 +
Zustand**, and **Cornerstone3D v5** for native DICOM rendering.

---

## Features

| Area | What you get |
| --- | --- |
| Viewer | Dark-stage mammogram viewer with **Brightness / Contrast sliders**, **Pan** (drag), **Zoom** (wheel or −/+ buttons), fit/reset, double-click reset — no mode switching: drag always pans and the wheel always zooms |
| DICOM | Native in-browser decoding via Cornerstone3D (`@cornerstonejs/dicom-image-loader`, wadouri `dicomfile:` scheme) — no server-side image conversion |
| PNG/JPG | Canvas renderer with the same gestures and a live zoom readout |
| Header | Patient ID, age/sex, study date, accession, **view (MLO/CC) + side (L/R)**, image type chip |
| Validation panel | AI assessment (hero 3-class chip e.g. **Suspicious (BI-RADS 4-5)** + one-line summary, confidence meter, alternative class-probability bars), AI findings list with **structured label-disagreement** (original VinDr grade vs model prediction), radiologist decision state (**Currently approved** / Relabeled), **Approve BI-RADS X** / **Update decision** and **Relabel** actions |
| Relabel dialog | BI-RADS **0–6 (4A/4B/4C)** grid **or** 3-class triage (Normal / Benign / Malignant) + free-text notes (500 chars) |
| Queue | Thumbnail worklist with per-case decision markers (approved ✓ / relabelled flag / sync spinner) |
| Shortcuts | `A` approve · `R` relabel · `←`/`→` navigate · `Home`/`End` jump · `Esc` close dialog |
| API | `GET /api/cases` (worklist + AI payload), `POST /api/validation` (decision), `GET /api/validation` (session log) |

## Tech stack

- **Framework** — Next.js 16 (webpack), React 19, TypeScript strict
- **Styling** — Tailwind CSS v4 (`@tailwindcss/postcss`)
- **State** — Zustand 5 (image queue, active case, decisions, sync status)
- **DICOM** — Cornerstone3D v5 packages:
  `@cornerstonejs/core`, `@cornerstonejs/tools`, `@cornerstonejs/dicom-image-loader`, `@cornerstonejs/metadata`, `dicom-parser`
- **Mock assets** — NumPy + Pillow phantoms, `pydicom`-generated DICOM P10 files

## Getting started

Prerequisites: **Node.js ≥ 20.9** and npm. Python ≥ 3.10 is only needed if you
want to regenerate the sample images.

### Windows — one-command launcher

The repo ships two run scripts. They auto-detect Node.js/npm (PATH or common
install locations, including `.nvm-node`), install dependencies when they are
stale, regenerate the demo mammogram assets if they are missing, start the app
and open the browser for you.

```bat
:: easiest: double-click this file
run.bat

:: or run it from a terminal
run.bat -Mode dev
run.bat -Mode start -Port 8080
run.bat -Mode build
```

PowerShell equivalent (same options):

```powershell
.\run.ps1                  # dev + auto-open browser
.\run.ps1 -Mode build
.\run.ps1 -Mode start -NoOpen
.\run.ps1 -Port 3001 -NoInstall
```

| Option | Meaning |
| --- | --- |
| `-Mode dev` (default) | Start the webpack dev server and open the browser |
| `-Mode build` | Create an optimized production build |
| `-Mode start` | Serve the production build (`.next`) |
| `-Port <n>` | Port to listen on (default `3000`) |
| `-NoOpen` | Don't auto-open the browser |
| `-NoInstall` | Skip the dependency freshness check |

### Manual start

```bash
# 1. install dependencies (includes all Cornerstone DICOM libraries)
npm install

# 2. start the dev server (webpack mode — see note below)
npm run dev
# open http://localhost:3000
```

> **Why `--webpack`?** Next.js 16 defaults to Turbopack, but Turbopack's build
> can deadlock on some Windows setups when bundling the heavy Cornerstone/vtk
> graph. The scripts are pinned to webpack (`next dev --webpack` / `next build
> --webpack`) which is fully supported and verified. You can still try plain
> `npx next dev` if you prefer Turbopack.

### Production build

```bash
npm run build   # type-checks + optimised build (webpack)
npm start       # serve on http://localhost:3000
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `A` | **Approve** the AI label (instant, then synced to API) |
| `R` | Open the **Relabel** dialog |
| `←` / `→` | Previous / next image |
| `Home` / `End` | First / last image in queue |
| `Esc` | Close the relabel dialog |

## API contract

### `GET /api/cases`

```json
{
  "cases": [
    {
      "imageId": "mg-2404",
      "patient": { "id": "PT-MAM-11177", "sex": "F", "ageAtStudy": 58 },
      "study": {
        "studyInstanceUid": "1.2.826.0.1.3680043.10.844.100000004",
        "date": "2026-08-05",
        "description": "Diagnostic mammogram — recalled asymmetry",
        "accessionNumber": "ACC-2026-09601"
      },
      "acquisition": { "laterality": "R", "view": "MLO", "pixelSpacingMm": 0.07 },
      "image": { "type": "dicom", "url": "/samples/dicom/mg-2404_MLO_R.dcm", "width": 1024, "height": 1400, "bitsAllocated": 16 },
      "ai": {
        "biradsGrade": "4C",
        "predictedClass": { "index": 2, "name": "Suspicious", "range": "BI-RADS 4-5" },
        "confidence": 0.89,
        "gradeProbabilities": { "0": 0, "4C": 0.89, "…": 0 },
        "classProbabilities": { "normal": 0.05, "benignLeaning": 0.06, "suspicious": 0.89 },
        "findings": [ { "id": "f-2404-1", "kind": "mass", "description": "Spiculated mass, 14 mm, high density", "location": "upper outer quadrant", "probability": 0.84 } ],
        "model": "MammoNet-V2 (VinDr-Mammo fine-tune)",
        "modelVersion": "v2.3.1",
        "runAt": "2026-08-05T14:27:52.000Z"
      }
    }
  ]
}
```

**AI output representation.** The model is trained on 3 coarse classes, so the UI
always shows the class plus the BI-RADS span it covers: `Normal → BI-RADS 1`,
`Benign-leaning → BI-RADS 2-3`, `Suspicious → BI-RADS 4-5`. Those live in
`ai.predictedClass` and `ai.classProbabilities`; `biradsGrade` / `gradeProbabilities`
are kept for API compatibility. Flag label-disagreement findings additionally carry
`originalClass` (with `grade` = the exact VinDr `breast_birads` value) and
`modelClass`. Decision payloads (`POST /api/validation`) and
`record.originalLabel` / `finalLabel` remain BI-RADS-grade strings — the relabel
picker and approve action are unchanged.

### `POST /api/validation`

Request/response body (exactly the specified validation output schema):

```json
{
  "imageId": "mg-2403",
  "radiologistId": "RAD-2026-0142",
  "originalLabel": "BI-RADS 4A — Suspicious — low suspicion",
  "finalLabel": "BI-RADS 3 — Probably benign",
  "status": "RELABELED",
  "notes": "Mass has benign morphology on spot compression.",
  "timestamp": "2026-09-07T10:31:00.000Z"
}
```

→ `200` `{ "ok": true, "record": { … }, "persistedCount": 5 }` · `400/422` with a
`message` when the payload is invalid.

`GET /api/validation` returns `{ records: ValidationRecord[], count }` for the
current server session.

## DICOM setup notes (Cornerstone3D v5)

The DICOM libraries are regular npm dependencies — no separate SDK download.
The wiring lives in `components/viewer/DicomViewer.tsx` and mirrors the
official v5 bootstrap order: `registerDefaultProviders()` (from
`@cornerstonejs/metadata`) → `loader.init({ maxWebWorkers: 1 })` →
`core.init({ debug: { statsOverlay: false } })` → `tools.init()`.

Sample DICOM P10 files are fetched from `/public/samples`, registered with the
loader's `wadouri.fileManager` (`dicomfile:` scheme) and displayed in a
Cornerstone stack viewport with Zoom / Pan / Window-Level tools:

| Input | Tool |
| --- | --- |
| Left drag | active toolbar tool — Window/Level (default), Pan, or Zoom |
| Middle drag | Pan |
| Right drag / wheel | Zoom (`ZoomTool.mouseWheelCallback`) |

### Known bundling quirk (already handled)

The loader statically imports optional JPEG2000/JPEG-LS WASM codecs that touch
Node built-ins (`fs`, `path`, `os`, `crypto`). For **uncompressed** DICOM
those decoders never run, so `next.config.ts` stubs the built-ins for browser
bundles via `webpack.resolve.fallback`. If you later add compressed transfer
syntaxes (JPEG-LS, JPEG2000, deflated…), enable the Cornerstone web workers and
their codec assets instead of relying on the stubs.

## Project structure

```
app/
  layout.tsx / page.tsx / globals.css        # app shell, dark theme
  api/cases/route.ts                          # GET  worklist (images + AI payloads)
  api/validation/route.ts                     # POST validation records, GET session log
components/
  header/PatientHeader.tsx                    # patient, study date, view + side, type
  queue/QueueRail.tsx                         # thumbnail worklist + decision markers
  viewer/ImageViewer.tsx                      # routes PNG vs DICOM, hosts toolbar
  viewer/PngImageViewer.tsx                   # canvas renderer (zoom/pan/brightness)
  viewer/DicomViewer.tsx                      # Cornerstone3D stack viewport
  viewer/ViewerToolbar.tsx                    # Brightness/Contrast bars + Zoom + Reset
  panel/ValidationPanel.tsx                   # AI label card, findings, actions
  relabel/RelabelModal.tsx                    # BI-RADS / 3-class picker + notes
  layout/ and ui/                             # shell, toast, buttons, modal, badges
store/workbench-store.ts                      # Zustand: queue, decisions, sync state
hooks/useValidationShortcuts.ts               # global hotkeys
lib/
  types.ts · taxonomy.ts · config.ts          # domain model + BI-RADS taxonomy
  mock-data.ts                                # demo worklist (PNG + DICOM entries)
  api-client.ts · validation-guards.ts        # typed client & payload guard
  server-validation-store.ts                  # in-memory server log (swap for DB)
public/samples/png … dicom …                  # generated demo exams
run.ps1 · run.bat                              # Windows one-command launchers
scripts/generate_sample_data.py               # phantom generator (NumPy/Pillow/pydicom)
scripts/import_research_flags.py              # rebuild mock-data.ts from CL research CSVs + VinDr
```

## Regenerating the demo images

```bash
pip install numpy pillow pydicom
python scripts/generate_sample_data.py            # writes into public/samples
# optional explicit target:
python scripts/generate_sample_data.py C:/path/public/samples
```

The script synthesises eight "compressed-breast" phantoms (fibroglandular
texture, pectoral muscle, skin line, calcification clusters, spiculated /
indistinct / circumscribed masses, asymmetry, distortion). Two cases are
written as **real DICOM P10 files** (Explicit VR Little Endian, MONOCHROME2,
16-bit, 1024×1400, with Window Center/Width) and six as 8-bit PNGs. The mock
`lib/mock-data.ts` labels/descriptions intentionally match the phantom content,
so approve-vs-relabel is a meaningful exercise (e.g. `mg-2404` really contains
a spiculated mass with pleomorphic calcifications).

### Rebuilding the CL research worklist

```bash
python scripts/import_research_flags.py
```

Rebuilds `lib/mock-data.ts` from `research_flagged_cases.csv`,
`oof_predictions.csv`, and `vindr_detection_v1_folds.csv` (all expected in
`mammo-validator/`). Every flagged patient gets all their views; flagged images
carry a structured label-disagreement finding (`originalClass` with the exact
VinDr `breast_birads` grade, `modelClass`, `originalConfidence`), and every case
gets `predictedClass` + `classProbabilities` from the OOF output.

## Production considerations / current demo limits

- The validation log is an **in-memory module store** — swap
  `lib/server-validation-store.ts` for a DB / FHIR / DICOM-SR repository
  without touching routes or the client.
- Reviewer identity is collected on first run before the workbench loads.
- The profile contains name, specialty, and a reviewer ID; the ID is
  auto-generated (`RAD-<year>-<nnnn>`) but editable.
- The profile is persisted per browser using `localStorage`
  (`mammoqa.reviewer`), so it survives reloads.
- A reviewer can switch profiles from the header (returns to the setup screen).
- Demo DICOMs are uncompressed — web workers / compressed codecs are not
  exercised.
- Multi-frame stacks and hanging protocols are not part of this demo, but the
  tool group + `setStack` already accept a stack of image ids.


