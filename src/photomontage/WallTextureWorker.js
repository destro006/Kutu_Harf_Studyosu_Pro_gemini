import {generateWallPixels} from './WallTextureGenerator.js';
self.onmessage=e=>{
 const id=e.data?.id;
 try{
  const result=generateWallPixels(id,percent=>self.postMessage({id,percent}));
  self.postMessage({id,result},[result.color.buffer,result.bump.buffer]);
 }catch(error){self.postMessage({id,error:String(error.message||error)});}
};
