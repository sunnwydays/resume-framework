Sample resume PDFs for the "Try a sample" gallery live here, served
statically at `/samples/<file>.pdf`. See `lib/samples/index.ts` for how to
wire a new PDF in.

Some samples also have their LaTeX source alongside the PDF/JSON
(`/samples/<file>.tex`), for the gallery's "View LaTeX" preview/download.
Not every sample has one — it's optional, set via `texPath`/`texFileName`
in `lib/samples/index.ts`.
