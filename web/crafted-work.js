// Only one directly linked asset's work belongs inside its source card.
export async function craftedWork(item,byId,fetchItem){
  if(item.kind!=='crafted')return {records:[],failed:[]};
  const rows=(item.related||[]).map(id=>byId.get(id)).filter(row=>row?.kind==='work'&&row.status!=='archive');
  const loaded=await Promise.allSettled(rows.map(row=>fetchItem(row.id)));
  const originals=new Set((item.images?.length?item.images:item.image?[item.image]:[]).map(file=>file.id||file.url));
  const records=[],failed=[];
  loaded.forEach((result,index)=>{
    if(result.status==='rejected'){failed.push(rows[index].title);return;}
    const work=result.value;
    if(work.status==='archive')return;
    const assets=(work.related||[]).filter(id=>byId.get(id)?.kind==='crafted');
    if(assets.length!==1||assets[0]!==item.id)return;
    const images=(work.images?.length?work.images:work.image?[work.image]:[]).filter(file=>!originals.has(file.id||file.url));
    if(images.length)records.push({work,images});
  });
  return {records,failed};
}
