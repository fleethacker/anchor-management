'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
module.exports=function loadEmbeddedAssistant(id){
  const match=html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'));
  if(!match)throw new Error('Missing embedded script: '+id);
  const result={exports:{}};
  const evaluate=vm.runInThisContext('(function(module,exports,require){'+match[1]+'\n})',{filename:'index.html#'+id});
  evaluate(result,result.exports,require);
  return result.exports;
};
