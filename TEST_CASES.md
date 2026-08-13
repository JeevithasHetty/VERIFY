# FieldVerify verification test cases

## Registration/OCR

- Clear plate: `KA41EC4911` -> structurally valid; low whole-image OCR must not automatically reject if registration confidence is sufficient.
- Noisy OCR: `IND KA 4] ECs 4 9 1 1` -> recover `KA41EC4911` as the preferred candidate.
- Tamil/advertisement-heavy image with `TN05BT5754` -> prefer the registration over phone numbers.
- Phone numbers (`9594924048`, `7755900813`) -> never accepted as registrations.
- Task IDs (`22FUGV4G2K`) and GPS coordinates -> never accepted as registrations.
- BH-series (`21BH1234AA`) -> structurally valid Bharat Series candidate.
- Spaced/hyphenated plate text -> normalize before validation.

## Recommendation behavior

- Clean, sufficiently supported evidence -> ACCEPT.
- Duplicate -> REVIEW, not REJECT.
- Near duplicate -> REVIEW, not REJECT.
- Plate detected but OCR uncertain -> REVIEW.
- OCR failed but vehicle evidence exists -> REVIEW, not REJECT.
- Moderate blur/lighting issue -> REVIEW.
- Severe unusable image -> REJECT.
- Strong manipulation signal -> may REJECT depending on configured confidence.
- Capture overlay (timestamp/GPS/task ID) alone -> not proof of manipulation.

## Batch

Each uploaded image receives its own processing ID, status, analysis, and recommendation. A batch can contain ACCEPT + REVIEW + REJECT results simultaneously.
