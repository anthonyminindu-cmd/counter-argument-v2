// Both the live SVG and the prebuilt Trending posters use these print-safe materials.
// Each piece has a diffuse face; the bright reflections belong to the rim.
export const posterMaterials = {
  left: {
    core: ['#1852a3', '#103f87', '#082859'],
    medium: ['#a8d8ff', '#82c0f3', '#74aee5'],
    small: ['#edf7ff', '#d6ebff', '#c2dff7'],
    body: ['#5da5ee', '#13529b', '#071c3d'],
    ink: '#071b32', coreInk: '#ffffff', seam: '#477da8'
  },
  right: {
    core: ['#ffda64', '#f8be32', '#efac21'],
    medium: ['#ffe7a0', '#ffda75', '#f4c763'],
    small: ['#fff6dd', '#ffedbb', '#f8e2ac'],
    body: ['#fff0a3', '#e5a21d', '#825308'],
    ink: '#3e2a0b', coreInk: '#271a05', seam: '#a97922'
  }
};
export function posterTier(rank) {
  return rank <= 8 ? 'core' : rank <= 13 ? 'medium' : 'small';
}
export function posterFinishDefs() {
  const result = [];
  for (const [side, material] of Object.entries(posterMaterials)) {
    for (const tier of ['core', 'medium', 'small', 'body']) {
      const [light, mid, shade] = material[tier];
      result.push('<linearGradient id="finish-'+side+'-'+tier+'" x1="0%" y1="0%" x2="38%" y2="100%">'+
        '<stop stop-color="'+light+'"/><stop offset=".5" stop-color="'+mid+'"/><stop offset="1" stop-color="'+shade+'"/></linearGradient>');
    }
  }
  return result.join('')+
    '<linearGradient id="object-rim" x1="0%" y1="0%" x2="70%" y2="100%"><stop stop-color="#f7fafc"/><stop offset=".19" stop-color="#94b8ce"/><stop offset=".25" stop-color="#37506d"/><stop offset=".48" stop-color="#ecf1ef"/><stop offset=".65" stop-color="#a58c55"/><stop offset=".83" stop-color="#4b5264"/><stop offset="1" stop-color="#e6d3a3"/></linearGradient>'+
    '<linearGradient id="scene-field" x1="0%" x2="100%"><stop stop-color="#d9eeff"/><stop offset=".5" stop-color="#f4faff"/><stop offset=".501" stop-color="#fff9e9"/><stop offset="1" stop-color="#ffe4a7"/></linearGradient>';
}
