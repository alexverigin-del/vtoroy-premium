export function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    return new Response(null, {
      status: 301,
      headers: { Location: `/product/${encodeURIComponent(slug)}` },
    });
  });
}
