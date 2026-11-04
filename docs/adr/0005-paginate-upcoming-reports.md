# Paginate upcoming reports at the collection seam

Status: accepted

The overview requests upcoming CASREP due records from the backend in pages of
10, ordered by `nextUpdateAt`, instead of rendering the entire due population at
once. The backend owns filtering, ordering, total-count metadata, and offsets;
the frontend owns page controls and the current page. This keeps the first
integration slice small while preserving a path to paginate larger registries.

The fictional model data remains embedded in `index.html` for the local fallback
and tests. Backend seed extraction is the current source-of-truth bridge; full
fixture removal is a separate migration because the existing model tests still
load those scripts directly.
