-- This editorial SVG stores two bylines and their per-point author metadata.
-- Other catalog posters are rendered from the ID-keyed public persona roster.
update public.dk_infographics
set artwork = replace(replace(artwork, 'Júlia Nunes', 'Laura Bennett'), 'Temilade Afolayan', 'Denise Carter')
where slug = 'tariffs-on-subsidized-imports' and owner_id is null
  and (artwork like '%Júlia Nunes%' or artwork like '%Temilade Afolayan%');
