const {test}=require('node:test');
const {execFileSync}=require('node:child_process');
test('Public topic pin and share release in Chrome with a disposable authenticated member',{skip:process.env.GITHUB_REF_NAME!=='qa/topic-pins-browser'},()=>{
  execFileSync('python',['-m','pip','install','--quiet','playwright==1.55.0'],{stdio:'inherit'});
  execFileSync('python',['maintenance/e2e/topic_share_release_qa.py'],{stdio:'inherit',env:{...process.env,DK_TEST_URL:'http://127.0.0.1:8172/counter-argument-v2'}});
});
