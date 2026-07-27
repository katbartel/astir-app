# Settings, Stages

Build source for `/preferences/stages`.

Stages are id-backed. Application logic keys off `stageId`, never the display name. The legacy `status` field remains only for old clients and old rows.

## Buckets

1. Applying: one fixed `applied` stage. Rename only.
2. In progress: one to ten stages. Add, delete, rename, and reorder.
3. Offer and hired: fixed `offer`, then `hired`. Rename only.
4. Closed: one fixed `closed` stage. Rename only.

Bucket headers are fixed copy.

## Icons

Icons are generated on render.

1. Applying uses a filled dot.
2. In progress uses an arc based on row position: `(i + 1) / (k + 1)`.
3. Offer uses a full gold ring.
4. Hired uses the warm hired token, with a filled circle and empty check.
5. Closed uses dispersing dots.

Do not store icon data on stage records.

## Data

Frontend stage config is stored in localStorage under `astir.stages.v1`.

Backend applications now have `stage_id`. Existing rows migrate from old `status` labels:

1. `Applied` to `applied`
2. `1st stage` to `progress-1`
3. `2nd stage` to `progress-2`
4. `3rd stage` to `progress-3`
5. `Offer` to `offer`
6. `Hired` to `hired`
7. `Closed` or `Rejected` to `closed`

Removing an In progress stage with applications asks for confirmation and moves those applications to the earliest remaining In progress stage.
