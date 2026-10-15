'use strict'
const fs=require('fs'),path=require('path')
const {Schematic}=require('prismarine-schematic')
const nbt=require('prismarine-nbt'),minecraftData=require('minecraft-data')
const LIMIT=12000,AIR=new Set(['air','cave_air','void_air','structure_void'])
const key=(x,y,z)=>String(x)+','+String(y)+','+String(z)
const n=v=>Number(v&&typeof v==='object'&&'value'in v?v.value:v)||0
const name=v=>String(v||'air').replace(/^minecraft:/,'').split('[')[0]
function defaultVersion(){try{const b=require('bedrock-protocol'),a=b.supportedVersions||b.versions||[],v=a[a.length-1];if(typeof v==='string'&&/^\d+\.\d+/.test(v))return v}catch{}return '1.21.80'}
function long(v){try{return BigInt.asUintN(64,BigInt(v))}catch{return 0n}}
async function readLitematic(buf){
 const parsed=await nbt.parse(buf),root=nbt.simplify(parsed.parsed||parsed),regions=root.Regions||(root.value&&root.value.Regions)
 if(!regions)throw Error('No readable Regions data in this .litematic file.')
 const raw=[];let mx=Infinity,my=Infinity,mz=Infinity
 for(const r of Object.values(regions)){
  const p=r.Position||{},s=r.Size||{},sx=Math.abs(n(s.x)),sy=Math.abs(n(s.y)),sz=Math.abs(n(s.z)),pal=r.BlockStatePalette
  const packed=r.BlockStates&&typeof r.BlockStates[Symbol.iterator]==='function'?Array.from(r.BlockStates):null
  if(!sx||!sy||!sz||!Array.isArray(pal)||!packed)continue
  const bits=Math.max(2,Math.ceil(Math.log2(pal.length))),per=Math.floor(64/bits),mask=(1n<<BigInt(bits))-1n,volume=sx*sy*sz
  if(volume>2000000)throw Error('Schematic exceeds the safe 2-million-block parsing limit.')
  for(let i=0;i<volume;i++){
   const pi=Math.floor(i/per);if(pi>=packed.length)break
   const ix=Number((long(packed[pi])>>BigInt((i%per)*bits))&mask),e=pal[ix];if(!e)continue
   const bn=name(e.Name||e.name);if(AIR.has(bn))continue
   const x=n(p.x)+(n(s.x)<0?-1:1)*(i%sx),z=n(p.z)+(n(s.z)<0?-1:1)*(Math.floor(i/sx)%sz),y=n(p.y)+(n(s.y)<0?-1:1)*Math.floor(i/(sx*sz))
   raw.push({x,y,z,name:bn});mx=Math.min(mx,x);my=Math.min(my,y);mz=Math.min(mz,z)
   if(raw.length>LIMIT)throw Error('Schematic has more than '+LIMIT+' non-air blocks. Split it into smaller sections to avoid console lag.')
  }
 }
 if(!raw.length)throw Error('No non-air blocks were found in this schematic.')
 return raw.map(b=>({...b,x:b.x-mx,y:b.y-my,z:b.z-mz}))
}
async function readSchematic(file){
 const buf=fs.readFileSync(file);if(buf.length>60*1024*1024)throw Error('Schematic exceeds the 60 MB upload limit.')
 if(path.extname(file).toLowerCase()==='.litematic')return readLitematic(buf)
 const sch=await Schematic.read(buf),out=[]
 sch.forEach((b,p)=>{const nm=name(b&&(b.name||b.displayName));if(!AIR.has(nm))out.push({x:n(p.x),y:n(p.y),z:n(p.z),name:nm})})
 if(!out.length)throw Error('No non-air blocks were found in this schematic.')
 if(out.length>LIMIT)throw Error('Schematic has more than '+LIMIT+' non-air blocks. Split it into smaller sections to avoid console lag.')
 const x=Math.min(...out.map(b=>b.x)),y=Math.min(...out.map(b=>b.y)),z=Math.min(...out.map(b=>b.z))
 return out.map(b=>({...b,x:b.x-x,y:b.y-y,z:b.z-z}))
}
function createGhost({schemDir,onSay=()=>{},log=()=>{}}){
 let player=null,pos=null,selected=null,layer=0,all=false,rotation=0,mirror=false,overlay=new Map(),originals=new Map(),generation=0,blockData=null,glassId=null
 function blockId(nm,version){
  try{if(!blockData||blockData.version!==version){const d=minecraftData(version)||minecraftData(defaultVersion());blockData={version,names:d.blocksByName||{}};const g=blockData.names.glass;glassId=g&&(g.minStateId??g.defaultState)}
   const b=blockData.names[name(nm)];return b&&Number.isInteger(b.minStateId)?b.minStateId:(Number.isInteger(glassId)?glassId:null)
  }catch{return null}
 }
 function trans(b){let x=mirror?-b.x:b.x,z=b.z;for(let i=0;i<rotation;i++){const old=x;x=-z;z=old}return{x,y:b.y,z}}
 function visible(){if(!selected||!pos)return[];const a={x:Math.floor(pos.x),y:Math.floor(pos.y),z:Math.floor(pos.z)},out=[]
  for(const b of selected.blocks){if(!all&&b.y!==layer)continue;const t=trans(b);out.push({x:a.x+t.x,y:a.y+t.y,z:a.z+t.z,name:b.name,id:blockId(b.name,selected.version)})}return out}
 function send(p,b){if(!p||typeof p.queue!=='function'||!Number.isInteger(b.id))return;try{p.queue('update_block',{position:{x:b.x,y:b.y,z:b.z},block_runtime_id:b.id,flags:3,layer:0})}catch(e){log('Overlay packet error: '+e.message)}}
 function apply(p=player){if(!p||!selected||!pos)return;const gen=++generation,list=visible();overlay=new Map(list.map(b=>[key(b.x,b.y,b.z),b]));let i=0
  const batch=()=>{if(gen!==generation||p!==player)return;for(let end=Math.min(i+100,list.length);i<end;i++)send(p,list[i]);if(i<list.length)setTimeout(batch,0);else log('Preview refreshed: '+list.length+' blocks shown.')}
  batch()
 }
 function restore(p=player){generation++;if(p&&typeof p.queue==='function')for(const k of overlay.keys()){const actual=originals.get(k);if(actual!=null){const a=k.split(',').map(Number);try{p.queue('update_block',{position:{x:a[0],y:a[1],z:a[2]},block_runtime_id:actual,flags:3,layer:0})}catch{}}}overlay.clear()}
 function say(msg){onSay(msg);if(player&&typeof player.queue==='function')try{player.queue('text',{type:'raw',needs_translation:false,source_name:'Ghost Bridge',message:msg,xuid:'',platform_chat_id:''})}catch{}}
 function attach(p){
  player=p;pos=null;originals.clear();overlay.clear()
  p.on('serverbound',pkt=>{const q=pkt&&pkt.params||{};if((pkt.name==='move_player'||pkt.name==='player_auth_input')&&q.position){const first=!pos;pos={x:q.position.x,y:q.position.y,z:q.position.z};if(selected&&first){selected.anchorY=Math.floor(pos.y);apply(p)}else if(selected&&selected.followLayer){layer=Math.max(0,Math.floor(pos.y)-selected.anchorY);apply(p)}}})
  p.on('clientbound',pkt=>{const q=pkt&&pkt.params||{};if(pkt.name==='update_block'&&q.position){const a=q.position,k=key(a.x,a.y,a.z);if(q.block_runtime_id!=null)originals.set(k,q.block_runtime_id);const fake=overlay.get(k);if(fake&&Number.isInteger(fake.id))q.block_runtime_id=fake.id}
   if(pkt.name==='level_chunk'&&selected&&pos){const cx=Number(q.x),cz=Number(q.z);if(Number.isFinite(cx)&&Number.isFinite(cz))setTimeout(()=>{if(selected&&player===p)for(const b of visible())if((b.x>>4)===cx&&(b.z>>4)===cz)send(p,b)},200)}
  })
 }
 async function run(input){
  const a=String(input||'').trim().split(/\s+/),cmd=(a.shift()||'').toLowerCase()
  if(cmd==='build'&&a[0]==='start'){
   const fileName=a.slice(1).join(' '),safe=path.basename(fileName);if(!safe||safe!==fileName||!/\.(litematic|schem|schematic)$/i.test(safe))throw Error('Choose a .litematic, .schem or .schematic file.')
   const file=path.join(schemDir,safe);if(!fs.existsSync(file))throw Error('Upload that schematic first.')
   const blocks=await readSchematic(file);restore();selected={file:safe,blocks,version:player&&typeof player.version==='function'?player.version():defaultVersion(),anchorY:pos?Math.floor(pos.y):0,followLayer:false};layer=0;all=false;rotation=0;mirror=false
   if(pos)apply();else say('Schematic loaded. Move in-game once to anchor the preview.')
   say('Loaded '+safe+': '+blocks.length+' non-air blocks. Visual guide only; it does not place blocks on the server.');return
  }
  if((cmd==='build'&&a[0]==='cancel')||cmd==='undo'){restore();selected=null;say('Preview cleared. No server blocks were changed.');return}
  if(!selected)throw Error('Upload a schematic, join the proxy, then tap Preview first.')
  if(cmd==='build'&&(a[0]==='up'||a[0]==='down')){layer=Math.max(0,layer+(a[0]==='up'?1:-1));all=false;selected.followLayer=false;apply();say('Preview layer '+layer+'.');return}
  if(cmd==='layer'){const sub=(a[0]||'').toLowerCase();if(sub==='auto'){selected.followLayer=true;all=false;layer=0;apply();say('Layer auto-follow enabled.');return}
   if(sub==='all'){all=true;apply();say('Showing all layers. Large overlays may lag.');return}
   if(sub==='up'||sub==='down'){layer=Math.max(0,layer+(sub==='up'?1:-1));all=false;selected.followLayer=false;apply();say('Preview layer '+layer+'.');return}
   const m=a.join(' ').match(/^range\s+(\d+)\s+(\d+)$/i);if(m){const low=Number(m[1]),high=Number(m[2]);selected.blocks=selected.blocks.filter(b=>b.y>=low&&b.y<=high);layer=low;all=true;apply();say('Showing layers '+low+' to '+high+'.');return}}
  if(cmd==='rotate'){rotation=(rotation+1)%4;apply();say('Rotated preview '+rotation*90+' degrees.');return}
  if(cmd==='mirror'&&a[0]==='x'){mirror=!mirror;apply();say('Mirror X '+(mirror?'enabled':'disabled')+'.');return}
  if(cmd==='mirror'&&a[0]==='off'){mirror=false;apply();say('Mirror disabled.');return}
  if((cmd==='build'&&a[0]==='place')||cmd==='next'){layer++;all=false;selected.followLayer=false;apply();say('Moved to preview layer '+layer+'. This tool does not place real blocks.');return}
  if(cmd==='build'&&a[0]==='unlock'){say('Preview controls unlocked.');return}
  if(cmd==='style'){say('Preview uses schematic block types where supported by this Bedrock version.');return}
  if(cmd==='progress'||cmd==='info'){say(selected.file+': '+selected.blocks.length+' blocks. Preview layer '+layer+'. Visual guide only.');return}
  if(cmd==='layers'){say('Schematic layers: 0-'+Math.max(...selected.blocks.map(b=>b.y))+'. Current layer: '+layer+'.');return}
  if(cmd==='mats'){const c=new Map();for(const b of selected.blocks)c.set(b.name,(c.get(b.name)||0)+1);say([...c.entries()].sort((x,y)=>y[1]-x[1]).slice(0,12).map(x=>x[0]+': '+x[1]).join(' | '));return}
  throw Error('Unknown command. Try layer up/down/all, rotate, mirror x, progress, mats, or build cancel.')
 }
 function current(){if(!player)return null;const p=player.profile||{};return{player:p.name||player.username||'connected',located:!!pos,file:selected&&selected.file,blocks:selected?selected.blocks.length:0,done:0,wrong:0,layer,mode:selected&&selected.followLayer?'follow':'locked'}}
 return{version:defaultVersion(),attach(r){r.on('connect',attach);r.on('disconnect',p=>{if(p===player){restore(p);player=null;pos=null}})},current,run,defaultVersion}
}
module.exports={createGhost,defaultVersion}
