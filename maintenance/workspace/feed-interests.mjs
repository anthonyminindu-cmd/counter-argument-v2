export const feedInterestPath = '/settings?section=feed-interests';
const starterTopics = ['sports','entertainment','science','technology','money','places','health','everyday'];

export function offerFeedInterests(createdAt, state) {
  return state?.selected === null && Date.parse(createdAt) >= Date.parse(state.enabled_at);
}

export function createFeedInterests({React, db, useAuth, useLocation, useNavigate, useQuery, link, status, login}) {
  const h = React.createElement;
  const Context = React.createContext(null);

  function InterestProvider({children}) {
    const {user} = useAuth();
    const owner = user?.id;
    const query = useQuery(owner || null, () => db.rpc('dk_feed_interest_state').single());
    const [committed,setCommitted] = React.useState(null);
    const saved = committed?.owner === owner ? committed : null;
    const selected = saved?.selected ?? query.data?.selected;
    const offer = !saved && offerFeedInterests(user?.created_at, query.data);

    async function save(picks) {
      const {error} = await db.from('dk_member_feed_interests').upsert({owner_id:owner,selected:picks});
      if (error) throw error;
      setCommitted({owner,selected:picks});
    }
    async function dismiss() {
      try { await save([]); }
      catch { setCommitted({owner,selected:[]}); }
    }
    return h(Context.Provider,{value:{selected,offer,query,save,dismiss}},children);
  }

  function FeedInterestLink({className='dk-link',label='Edit interests'}={}) {
    return useAuth().user ? link(feedInterestPath,label,className) : null;
  }

  function InterestPicker({onboarding=false}) {
    const {user,loading} = useAuth(), navigate = useNavigate(), state = React.useContext(Context);
    const catalog = useQuery(user?.id || null, () => db.from('dk_feed_topics').select('id,label,parent_id,aliases').order('sort_order'));
    const [draft,setDraft] = React.useState(null), [expanded,setExpanded] = React.useState(!onboarding);
    const [search,setSearch] = React.useState(''), [busy,setBusy] = React.useState(false);
    const [message,setMessage] = React.useState(''), [error,setError] = React.useState('');
    const title = React.useRef(null), more = React.useId(), searchId = React.useId();
    React.useEffect(() => { if (onboarding) title.current?.focus(); }, [onboarding]);

    const heading = onboarding ? 'What would you like to see more of?' : 'Feed interests';
    const trending = '/home?view=feed&sort=trending';
    const selected = draft ?? state?.selected ?? [];
    const rows = catalog.data ?? [];
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches = row => terms.every(term=>[row.label,...row.aliases].some(label=>label.toLowerCase().includes(term)));
    const parents = rows.filter(row=>row.parent_id===null);
    const starters = starterTopics.map(id=>parents.find(row=>row.id===id)).filter(Boolean);
    const labels = new Map(rows.map(row=>[row.id,row.label]));
    const unavailable = !catalog.data || !!state?.query.error || state?.query.loading;

    function toggle(id) {
      setDraft(selected.includes(id) ? selected.filter(value=>value!==id) : [...selected,id]);
      setMessage('');
      setError('');
    }
    async function submit(event) {
      event.preventDefault();
      if (busy || unavailable) return;
      setBusy(true);setError('');setMessage('');
      try {
        await state.save(selected);
        if (onboarding) navigate(trending,{replace:true});
        else { setDraft(null);setMessage('Feed interests saved.'); }
      } catch {
        setError('Your interests could not be saved. Try again.');
      } finally { setBusy(false); }
    }
    async function skip() {
      if (busy) return;
      setBusy(true);
      await state.dismiss();
      navigate(trending,{replace:true});
    }
    function option(row) {
      const active=selected.includes(row.id);
      return h('button',{type:'button',key:row.id,className:'dk-interest-choice','aria-pressed':active,
        disabled:busy||!state,onClick:()=>toggle(row.id)},active&&h('span',{'aria-hidden':true},'✓ '),row.label);
    }
    function group(parent) {
      const children=rows.filter(row=>row.parent_id===parent.id);
      const visible=terms.length&&!matches(parent)?children.filter(matches):children;
      if (terms.length&&!matches(parent)&&!visible.length) return null;
      return h('div',{className:'dk-interest-group',key:parent.id},
        h('div',{className:'dk-interest-root'},option(parent)),
        terms.length?h('div',{className:'dk-interest-options'},...visible.map(option)):
          h('details',null,h('summary',null,'Topics in '+parent.label),h('div',{className:'dk-interest-options'},...visible.map(option))));
    }

    const groups = parents.map(group).filter(Boolean);
    return h('div',{className:'dk-main dk-feed-interests'},h('section',{className:'dk-panel'},
      !onboarding&&link('/settings','Back to Settings'),
      h('h1',{ref:title,tabIndex:-1},heading),
      h('p',null,onboarding?'Pick a few interests to move those debates higher in Trending.':'Choose which topics get a boost in Trending. Your choices are private.'),
      !user?(loading?status('Loading account…'):link(login(feedInterestPath),'Sign in to edit interests','dk-primary')):
      h('form',{onSubmit:submit},
        catalog.error?status('Topics could not be loaded.',true):!catalog.data?status('Loading topics…'):null,
        state?.query.error&&status('Your saved interests could not be loaded.',true),
        (catalog.error||state?.query.error)&&h('button',{type:'button',className:'dk-secondary',onClick:()=>{catalog.refresh();state?.query.refresh();}},'Retry loading interests'),
        catalog.data&&!expanded&&h('div',{className:'dk-interest-options'},...starters.map(option)),
        catalog.data&&onboarding&&h('button',{type:'button',className:'dk-link dk-interest-more','aria-expanded':expanded,
          'aria-controls':more,onClick:()=>setExpanded(value=>!value)},expanded?'Show fewer topics':'See all topics'),
        h('div',{id:more,hidden:!expanded},catalog.data&&h(React.Fragment,null,
          h('label',{htmlFor:searchId},'Search topics'),
          h('input',{id:searchId,type:'search',value:search,onChange:event=>setSearch(event.target.value)}),
          groups.length?h('div',{className:'dk-interest-catalog'},...groups):status('No topics match your search.'))),
        h('p',{className:'dk-note','aria-live':'polite'},selected.length ? selected.length+' selected' : 'Trending shows all eligible debates.'),
        selected.length>0&&h('ul',{className:'dk-interest-selected','aria-label':'Selected interests'},...selected.map(id=>
          h('li',{key:id},h('button',{type:'button',className:'dk-small',onClick:()=>toggle(id),disabled:busy,
            'aria-label':(labels.get(id)||id)+', remove interest'},labels.get(id)||id,h('span',{'aria-hidden':true},' ×'))))),
        h('div',{className:'dk-actions'},
          h('button',{type:'submit',className:'dk-primary',disabled:busy||unavailable},busy?'Saving…':onboarding?'See my feed':'Save interests'),
          onboarding?h('button',{type:'button',className:'dk-secondary',disabled:busy,onClick:skip},'Skip for now'):
            selected.length>0&&h('button',{type:'button',className:'dk-small',disabled:busy,onClick:()=>{setDraft([]);setMessage('');}},'Clear selections')),
        message&&status(message),error&&status(error,true))));
  }

  function SettingsRoute({DefaultSettings}) {
    const params = new URLSearchParams(useLocation().search);
    return params.get('section') === 'feed-interests' ? h(InterestPicker) : h(DefaultSettings);
  }

  return {InterestProvider,InterestPicker,FeedInterestLink,SettingsRoute,useFeedInterests:()=>React.useContext(Context)};
}

export async function feedRankingRequest(ordinary, personalized, useInterests) {
  if (useInterests) {
    try {
      const result = await personalized();
      if (!result.error && Array.isArray(result.data) && result.data.length) return result;
    } catch {}
  }
  return ordinary();
}
