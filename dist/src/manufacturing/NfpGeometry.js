// Clipper integer geometry, using the configuration-space/Minkowski-sum
// approach used by SVGNest. Candidate geometry is not production geometry.
// All accepted poses are independently checked against original contours.
import Clipper from '../../public/vendor/cad/clipper-runtime.js';
const S=1000;
const xy=p=>({X:Math.round(p.x*S),Y:Math.round(p.y*S)});
const ring=pts=>{const p=pts.map(xy);if(!Clipper.Clipper.Orientation(p))p.reverse();return p;};
const rect=(l,b,r,t)=>[{X:l,Y:b},{X:r,Y:b},{X:r,Y:t},{X:l,Y:t}];
const cache=new WeakMap();
function simplified(pts){
 // Bound only the search proxy. Preserve every source point in the result.
 const p=pts.length>96?pts.filter((_,i)=>i%Math.ceil(pts.length/80)===0):pts;
 return ring(p);
}
export function forbiddenTranslations(fixed,moving,clearance){
 const a=simplified(fixed),b=simplified(moving).map(p=>({X:-p.X,Y:-p.Y}));
 if(a.length<3||b.length<3)return [];
 const raw=Clipper.Clipper.MinkowskiSum(b,a,true);
 if(!raw.length)return [];
 // Fill interior voids of the outer-contour proxy; hole nesting is searched
 // separately with exact containment checks, never inferred from this proxy.
 const positive=raw.filter(p=>Clipper.Clipper.Orientation(p));
 const offset=new Clipper.ClipperOffset(2,.02*S);
 offset.AddPaths(positive.length?positive:raw,Clipper.JoinType.jtRound,Clipper.EndType.etClosedPolygon);
 const out=[];offset.Execute(out,Math.ceil((clearance+.04)*S));return out;
}
export function nfpCandidates(sheet,variant,minX,minY,maxX,maxY,sep,deadline=Infinity){
 const l=Math.ceil(minX*S),b=Math.ceil(minY*S),r=Math.floor((maxX-variant.bounds.width)*S),t=Math.floor((maxY-variant.bounds.height)*S);
 if(r<l||t<b||performance.now()>deadline)return [];
 const subject=rect(l,b,r,t),forbidden=[];
 let byVariant=cache.get(variant.outer);if(!byVariant){byVariant=new WeakMap();cache.set(variant.outer,byVariant);}
 for(const p of sheet.placements){
  if(performance.now()>deadline)return [];
  let entry=byVariant.get(p.outer);
  if(!entry||entry.sep!==sep){entry={sep,paths:forbiddenTranslations(p.outer,variant.outer,sep)};byVariant.set(p.outer,entry);}
  forbidden.push(...entry.paths);
 }
 if(!forbidden.length)return [{x:l/S,y:b/S},{x:r/S,y:b/S},{x:l/S,y:t/S},{x:r/S,y:t/S}];
 // Subtract forbidden translations from the rectangular inner-fit region.
 const cl=new Clipper.Clipper(),out=[];
 cl.AddPath(subject,Clipper.PolyType.ptSubject,true);
 cl.AddPaths(forbidden,Clipper.PolyType.ptClip,true);
 cl.Execute(Clipper.ClipType.ctDifference,out,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero);
 const points=[];
 for(const path of out)for(const p of path)points.push({x:p.X/S,y:p.Y/S});
 return points;
}
