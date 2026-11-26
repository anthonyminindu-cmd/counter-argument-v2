import {readPosterDebate} from './debate-links.mjs';
const preferenceKey = 'debateai-settings';
const fontSizes = {small:'87.5%', medium:'100%', large:'112.5%', 'extra-large':'125%'};

export function applyReadingPreferences(settings) {
  const root = document.documentElement;
  root.classList.toggle('dark', settings.theme === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches : settings.theme !== 'light');
  root.classList.toggle('dk-high-contrast', settings.highContrast === true);
  root.classList.toggle('dk-reduced-motion', settings.reducedMotion === true);
  root.style.fontSize = fontSizes[settings.fontSize] || '';
}

function syncReadingPreferences() {
  try { applyReadingPreferences(JSON.parse(localStorage.getItem(preferenceKey)) || {}); }
  catch { applyReadingPreferences({}); }
}

const profilePages = {friends:'Friends',comments:'Your comments',work:'Your posts and debates',given:'Support given',
  received:'Support received',account:'Account settings',pinned:'Pinned items',posters:'Saved posters',created:'Created infographics',
  table:'Your table',people:'Friends'};
export function routeTitle(path, params, heading) {
  if (path === '/login') return 'Sign in or create an account';
  if (path === '/reset-password') return 'Reset your password';
  if (path === '/profile') return profilePages[params.get('section') || params.get('tab')] || heading || 'Your profile';
  if (path === '/settings') return params.get('section') === 'feed-interests' ? 'Feed interests' : 'Settings';
  if (path === '/debate/active') return params.get('topic') || heading || 'Active debate';
  if (path.startsWith('/debate/view/')) return heading || 'Saved debate';
  if (path === '/debate/start') return params.get('mode') === 'friend' ? 'Debate with a friend' : 'Start a debate';
  if (path === '/debate/topic') return heading || 'Choose a debate topic';
  if (path === '/' || path === '/home') {
    if (params.has('join')) return 'Join a friend debate';
    if (readPosterDebate(params) || params.has('question')) return heading || 'Debate discussion';
    if (params.has('commenter')) return heading || 'Community profile';
    if (params.has('view') || params.has('sort') || params.has('edition')) return heading || 'Debate feed';
    return heading === 'What would you like to see more of?' ? 'Choose your interests' : 'Home';
  }
  return 'Page not found';
}

export function createRouteContent(React, useLocation) {
  return function RouteContent({children}) {
    const location = useLocation(), main = React.useRef(null), previous = React.useRef(null);
    const path = location.pathname.replace(/\/$/, '') || '/';
    const params = new URLSearchParams(location.search);
    // Point links and return-to-card navigation manage their own focus.
    const focal = location.state?.dkReturn || ['point','comment','points','react'].some(key=>params.has(key));
    const key = [path,readPosterDebate(params),...['view','sort','commenter','question','section','tab','mode','session','join','area'].map(k=>params.get(k))].join('|');
    React.useLayoutEffect(()=>{
      syncReadingPreferences();
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const storage = event => { if (!event.key || event.key === preferenceKey) syncReadingPreferences(); };
      media.addEventListener('change',syncReadingPreferences);
      window.addEventListener('storage',storage);
      return ()=>{media.removeEventListener('change',syncReadingPreferences);window.removeEventListener('storage',storage);};
    },[]);
    React.useLayoutEffect(()=>{
      const region = main.current;
      const update = () => {
        const heading = region.querySelector('h1')?.textContent?.trim();
        const title = routeTitle(path,new URLSearchParams(location.search),heading) + ' | Differ Kindly';
        if (document.title !== title) document.title = title;
      };
      update();
      if (previous.current !== null && previous.current !== key && !focal && !history.state?.dkCard) region.focus();
      previous.current = key;
      const observer = new MutationObserver(update);
      observer.observe(region,{childList:true,characterData:true,subtree:true});
      return ()=>observer.disconnect();
    },[key,location.search]);
    return React.createElement('main',{id:'dk-route-content',ref:main,tabIndex:-1},children);
  };
}
