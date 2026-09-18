# ULTRA@503 Visual Check Sheet (Version 1)

A completely separate PWA from the ULTRA@503 Rework / Rejection app. Built for
shop-floor visual inspection using the 7-point Visual Check Sheet
(Format No: UC/QA/FR/61, Rev/Date: 00/06.08.2025).

This app does **not** contain Notification, Rework, Reject, Remark-on-defect,
or Responsible Section workflow from the old rejection system — it is purely
a Visual Check Sheet.

## Features
- **Employee Profile** — Employee Name + Employee ID No. saved once in the
  browser's local storage (`localStorage`). No password, no server — a
  convenience "remember me" profile, not a real login. Auto-fills Inspector
  Name / Employee ID on every future visit on that device.
- **Route Card** — Scan Route Card QR (same proven scanner as the Rework app:
  native `BarcodeDetector` first, `jsQR` fallback, rear camera, continuous
  detection, auto-stop on success) or enter fields manually / paste QR text
  via "Read QR Data". WO No., SAP Order No. and Material No. are never
  captured into the UI or PDF.
- **7 Check Points** — exact wording as supplied, YES/NO only (no scoring).
  Optional remarks only on Points 1, 3 and 6. Separate photo capture only on
  Points 3, 4, 5, 6 and 7, each with its own thumbnail gallery.
- **Validation** — all 7 points must be answered before a PDF can be
  generated.
- **Inspector Information** — Name/ID auto-filled from the saved profile;
  Inspection Date/Time is a live clock, frozen at the moment the PDF is
  generated.
- **PDF** — A4, ULTRA branding, Format No./Rev-Date top right, route card
  details, all 7 points with YES/NO highlighted, remarks where applicable,
  inspector block, then photo pages (2×2, max 4 per page, each photo labeled
  "Check Point N — Photo M").
- **Download / Share** — native Android share sheet with the actual PDF
  file attached plus a share message containing Part No., PO No., UC Batch
  No. and the Format No./Rev-Date.
- **Create New Entry** — clears the current inspection (route card,
  answers, remarks, photos, generated PDF) but **keeps** the saved Employee
  Profile.
- **PWA** — installable, works offline for scanning/entry/PDF creation once
  the app shell has loaded once; only sharing needs another app with
  connectivity.

## Deploying
Push the contents of this folder (including `.github/workflows/main.yml`)
to the root of its own GitHub repository, then in **Settings → Pages** set
"Build and deployment → Source" to **GitHub Actions**. This repo is
independent of `ULTRA-503-Rework-Rejection` — deploying it will not affect
that app.

## v1.1 updates (this update)
- Customer Name is now a required field — the app blocks PDF generation with a
  clear message if it's not selected, and the label shows a red `*`.
- Visual Check Sheet layout tightened (smaller, denser type; single-line
  YES/NO result pill instead of two boxes; the "no photographs attached"
  filler line removed) so the full 7-point sheet, route card details and
  inspector block fit on one A4 page in the normal case. Remarks are now
  drawn directly under their point in full, not truncated.
- Fixed a real layout bug on the photo pages: photos are now placed inside a
  grid computed strictly between the header line and the footer band (with
  padding), so no photograph can ever be drawn under/behind the header or
  footer. (Previously the grid math could push part of an image above the
  page or under the header.)

## Version 2 (not implemented yet)
The code is structured so a future version can add: a central database,
multiple employee accounts/login, a second-user "Verified By" step with
verifier name/ID/date-time/status, inspection history, and search — none of
this is built in Version 1 by design.
