// Captions are display copy. A saved support choice always uses its original key.
const editorialSupportCaptions = {
  'ai-data-centers': {'Approve with safeguards':'Approve with safeguards','Pause until costs are clear':'Clarify costs first'},
  'cloud-outage-backup': {'Pay for a backup channel':'Buy backup channel','Use existing emergency contacts':'Use existing contacts'},
  'federal-gas-tax': {'Pause the gas tax':'Pause gas tax','Keep the gas tax in place':'Keep gas tax'},
  'fossil-fuel-deadline': {'Set a shared deadline':'One shared deadline','Let countries choose their dates':'Set national deadlines'},
  'grocery-tariffs': {'Remove grocery tariffs':'Remove grocery tariffs','Keep selected grocery tariffs':'Keep selected tariffs'},
  'health-insurance': {'Restore larger tax credits':'Restore larger credits','Focus on the price of care':'Address care prices'},
  'immigration-bill': {'A single bill':'One combined bill','Vote on separate bills':'Separate bills'},
  'iran-war-powers': {'Require a public vote':'Require public vote','Allow flexibility with oversight':'Flexibility with oversight'},
  'office-land-housing': {'Allow apartments on office land':'Allow apartments','Review each site first':'Review each site'},
  'teen-autoplay': {'Turn off autoplay':'Turn off autoplay','Let families choose':'Let families choose'}
};
const participantSupportCaptions = {
  'tariffs-on-subsidized-imports': {'Raise targeted tariffs':'Raise targeted tariffs','Reject the proposed hikes':'Reject tariff hikes'},
  'iowa-army-detonation': {'Proceed with safeguards':'Proceed with safeguards','Require stronger review':'Require stronger review'},
  'poster-0f7ba5510ebec28c5dd1d6ba811dfb8a5a2c74357aeefa417f7ff983bcc596e2': {
    'Wait for Friday and compare the price history first':'Wait for Friday',
    'Buy a planned gift early when the price meets your target':'Buy gifts early'
  }
};

function supportWords(text){
  return text.trim().split(/\s+/u).filter(Boolean);
}
function memberStanceWords(statement){
  const words=supportWords(statement);
  if(words.length<=3)return words;
  // Remove only a speaker's introduction. Keep position and negation words.
  const trimmed=statement.replace(/^(?:(?:i (?:think|believe) (?:that )?|in my (?:view|opinion)[, ]+|we should |i would ))+/i,'');
  return supportWords(trimmed||statement);
}
function compactSupportCaptions(positions,slug){
  const catalog=Object.hasOwn(editorialSupportCaptions,slug)?editorialSupportCaptions[slug]:
    Object.hasOwn(participantSupportCaptions,slug)?participantSupportCaptions[slug]:{};
  const words=positions.map(side=>memberStanceWords(side.label));
  const first=words.map(list=>list.slice(0,3).join(' ').toLowerCase());
  let start=0;
  if(words.length===2 && first[0]===first[1]){
    while(words[0][start] && words[0][start].toLowerCase()===words[1][start]?.toLowerCase())start++;
  }
  return positions.map((side,i)=>{
    if(Object.hasOwn(catalog,side.label))return catalog[side.label];
    const excerpt=words[i].slice(start,start+3).join(' ');
    const omittedNegation=words[i].slice(0,start).some(word=>/^(?:not|no|never|cannot|.*n['’]t)$/i.test(word));
    if(!excerpt || omittedNegation)return 'Position '+(i+1);
    const end=words[i].length>start+3?'…':'';
    return excerpt.charAt(0).toLocaleUpperCase()+excerpt.slice(1)+end;
  });
}

export function positionButtons(positions,slug,names){
  const captions=compactSupportCaptions(positions,slug);
  return positions.map((side,i)=>{
    const name=String(names?.[side.persona]?.name||side.author||'').trim();
    const publicName=name.includes('@') && !/^@[\p{L}\p{N}_.-]+$/u.test(name)?'':name;
    let byline=supportWords(publicName)[0];
    if(publicName==='Differ Kindly AI')byline='DK AI';
    if(publicName==='Differ Kindly Editorial' || (!publicName && Object.hasOwn(editorialSupportCaptions,slug)))byline='Editorial';
    return {key:side.key??side.label,byline:byline||'Debater',caption:captions[i],
      fullName:publicName||byline||'Debater',statement:side.label,count:side.count};
  });
}
