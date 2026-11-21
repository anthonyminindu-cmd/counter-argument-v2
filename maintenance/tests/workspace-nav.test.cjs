const test = require('node:test');
const assert = require('node:assert/strict');

test('all three exploration actions live in the global header across feed and account routes', async () => {
  const {createWorkspace, afterLogin} = await import('../workspace/app.mjs');
  const React = {
    createElement: (type, props, ...children) => ({type, props, children}),
    createContext: () => ({}),
    useState: value => [value, () => {}]
  };
  for (const user of [null,{id:'member'}]) {
    for (const url of ['/','/home?view=feed&sort=latest','/home?view=feed&sort=people','/home?view=feed&question=abc','/profile','/debate/topic?mode=ai']) {
      const workspace = createWorkspace({React, Link:'link', useAuth:()=>({user}), useLocation:()=>new URL(url,'https://example.test'), useNavigate:()=>()=>{}});
      const header = workspace.Nav();
      const nav = header.children.find(child => child?.props?.['aria-label']==='Start an exploration');
      assert.ok(nav, url);
      const actions = nav.children.map(child => {
        const to = child.props.to;
        if(!user && child.children[1].children[0]!=='Pick a topic') assert.match(to,/^\/login\?next=/);
        return [child.children[1].children[0],to.startsWith('/login?')?afterLogin(to.slice(to.indexOf('?'))):to];
      });
      assert.deepEqual(actions,[['Find a friend','/debate/start?mode=friend'],['Pick a topic','/home?view=feed'],['Debate with AI','/debate/topic?mode=ai']]);
    }
  }
});
