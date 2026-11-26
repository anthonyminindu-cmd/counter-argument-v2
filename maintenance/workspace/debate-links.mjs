export function posterDebateRoute(id) {
  return '/home?view=feed&debate=' + encodeURIComponent(id);
}

export function readPosterDebate(params) {
  return params.get('debate') || params.get('example');
}

// Bookmarks and invitations created before the public parameter was renamed still resolve.
export function normalizeDebateSearch(search) {
  const params = new URLSearchParams(search);
  if (!params.has('example')) return search;
  const id = readPosterDebate(params);
  params.delete('example');
  if (id && !params.get('debate')) params.set('debate', id);
  return params.size ? '?' + params : '';
}
