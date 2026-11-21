// Fallback outlines are drawing primitives chosen for each named subject.
export const subjectRoles = ['main','left','right','foreground'];
export const subjectForms = ['rounded','figure','building','landform','tool','layered'];
const outlines = {
  rounded: [[5,47],[10,24],[28,9],[55,5],[80,15],[94,36],[95,60],[79,85],[50,95],[22,83],[9,66]],
  figure: [[14,96],[17,67],[33,54],[39,51],[30,32],[34,14],[44,6],[59,7],[69,18],[69,34],[61,50],[77,58],[87,73],[91,96]],
  building: [[4,39],[12,34],[48,7],[91,33],[97,39],[91,43],[90,93],[12,93],[11,44],[4,43]],
  landform: [[2,84],[13,66],[25,55],[40,27],[51,13],[64,32],[71,41],[80,36],[93,68],[98,88],[71,94],[28,92]],
  tool: [[5,77],[41,44],[48,31],[65,12],[87,5],[94,17],[86,38],[70,51],[57,54],[21,91],[10,93]],
  layered: [[2,27],[24,21],[48,26],[74,18],[97,23],[98,81],[72,88],[49,82],[25,90],[2,84]],
};
const detail = {
  rounded:[[20,38],[29,24],[43,18]], figure:[[36,64],[49,73],[64,62]],
  building:[[17,42],[49,20],[84,41]], landform:[[30,54],[49,30],[61,45]],
  tool:[[47,44],[60,32],[77,21]], layered:[[6,57],[26,51],[47,57],[71,48],[95,55]],
};
const points = pairs => pairs.map(([x,y])=>({x,y}));
const validPoint = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x>=0 && p.x<=100 && p.y>=0 && p.y<=100;
const validLine = (v,min,max) => Array.isArray(v) && v.length>=min && v.length<=max && v.every(validPoint);

export function illustratedSubjects(subjects) {
  return subjectRoles.map(role => {
    const subject = subjects[role];
    const {name,form,outline,details} = subject;
    if (!subjectForms.includes(form)) throw Error('Unknown illustration form.');
    const area = validLine(outline,8,40) ? Math.abs(outline.reduce((sum,p,i)=>{
      const next=outline[(i+1)%outline.length]; return sum+p.x*next.y-next.x*p.y;
    },0))/2 : 0;
    const lines = Array.isArray(details) ? details.filter(line=>validLine(line,2,12)).slice(0,3) : [];
    if (area<450) return {name,outline:points(outlines[form]),details:[points(detail[form])]};
    return {name,outline,details:lines.length ? lines : [points(detail[form])]};
  });
}

// Prefer the primary copy, using a complete alternate when two submissions get the same wording.
export function chooseSceneLabels(entries) {
  const clean = text => typeof text==='string' ? text.trim().replace(/\s+/g,' ') : '';
  const options = entries.map(entry=>[...new Set([entry.primary,entry.alternate].map(clean))]
    .filter(text=>/^\S+(?: \S+){2,3}$/.test(text) && !/\b(?:a|an|the|and|or|for|to|with|from|if|than|of|in|on|by|can|could|would|should|may|might|must|already|gets|leave|leaves)\s*[.!?]?$/i.test(text) && text.length<=90 && !/…|\.\.\./.test(text)));
  const taken = new Map(), chosen = new Array(entries.length);
  function assign(index,seen) {
    for(const phrase of options[index]){
      const key=phrase.toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);
      const other=taken.get(key);
      if(other===undefined || assign(other,seen)){taken.set(key,index);chosen[index]=phrase;return true;}
    }
    return false;
  }
  for(let i=0;i<entries.length;i++)if(!assign(i,new Set()))throw Error('Every argument needs a distinct complete 3–4 word label.');
  return entries.map((entry,i)=>({id:entry.id,position:entry.position,statement:chosen[i]}));
}
