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

// Poster registrations and saves use a hash of the original SVG bytes. Apply the
// website palette at presentation time so existing likes, threads and links stay attached.
const websitePosterPaint = {
  // Forest and mint, from the site's primary action.
  '#1852a3':'#28613e', '#103f87':'#225e3c', '#082859':'#183f2a',
  '#a8d8ff':'#bcf1c8', '#82c0f3':'#a6dfb6', '#74aee5':'#96cda9',
  '#edf7ff':'#f5f7f2', '#d6ebff':'#e6ede6', '#c2dff7':'#d4e6d6',
  '#5da5ee':'#9aebbb', '#13529b':'#39754e', '#071c3d':'#17251e',
  '#071b32':'#102b1e', '#477da8':'#668b72',
  // Violet and lilac, from the site's second debate action.
  '#ffda64':'#d7bcf3', '#f8be32':'#c6aff8', '#efac21':'#baa1e4',
  '#ffe7a0':'#eadff5', '#ffda75':'#e0d3ef', '#f4c763':'#d5c6e7',
  '#fff6dd':'#f7f5f9', '#ffedbb':'#eeeaf3', '#f8e2ac':'#e6dfed',
  '#fff0a3':'#decef2', '#e5a21d':'#a487be', '#825308':'#564263',
  '#3e2a0b':'#27193d', '#271a05':'#27193d', '#a97922':'#8a7398',
  // Headings, captions, field, outlines and hardware share the site's neutral tones.
  '#101e34':'#101910', '#071b3e':'#101910', '#183b69':'#17251e',
  '#faf7ed':'#f7f7f5', '#deedff':'#e6ede6', '#d8e5f1':'#e6ede6',
  '#c0ddf7':'#bcf1c8', '#ffd47d':'#d7bcf3', '#184967':'#102b1e', '#73460e':'#27193d',
  '#d9eeff':'#d7eadd', '#f4faff':'#f5f7f2', '#fff9e9':'#f7f7f5', '#ffe4a7':'#e6deed',
  '#f7fafc':'#f7f7f5', '#94b8ce':'#a7b7aa', '#37506d':'#47594e',
  '#ecf1ef':'#e6ede6', '#a58c55':'#aba1b5', '#4b5264':'#54505c', '#e6d3a3':'#e4deeb',
  '#10283c':'#17251e', '#263b50':'#47594e', '#969e9f':'#79867d', '#acaa9c':'#79867d',
  '#142c46':'#17251e', '#15263e':'#17251e', '#172f49':'#17251e', '#354352':'#47594e',
  '#315577':'#47594e', '#183655':'#304236', '#0b223e':'#17251e', '#8299a9':'#819187',
  '#233d52':'#36453b', '#e8ecdc':'#e6ede6', '#eef4ec':'#e6ede6', '#fff9e8':'#f7f7f5',
  '#b6b7b0':'#c7d4ca', '#142d43':'#17251e', '#a9e1e3':'#bcf1c8', '#314862':'#47594e',
  '#a9b9c3':'#b3c0b7', '#526b7b':'#697970', '#b2cfbd':'#b6cec0', '#d5dfdc':'#d8e2da',
  '#263e4d':'#2a3c30', '#547367':'#597361', '#16263c':'#19251e', '#8897a3':'#8a978d',
  '#fff8df':'#f5f7f2', '#213448':'#243329'
};

export function websitePosterSvg(svg) {
  if (!svg || !svg.includes('id="finish-left-core"')) return svg;
  return svg.replace(/<[a-zA-Z][\w:-]*(?:[^>"']|"[^"]*"|'[^']*')*>/g, tag =>
    tag.replace(/([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')/g, (attribute,name,equals,quoted) => {
      if (name!=='fill' && name!=='stroke' && name!=='stop-color') return attribute;
      const value=quoted.slice(1,-1).toLowerCase();
      return Object.hasOwn(websitePosterPaint,value)
        ? name+equals+quoted[0]+websitePosterPaint[value]+quoted[0] : attribute;
    }));
}
