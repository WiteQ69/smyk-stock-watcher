import {resolveLocation,fetchStores,requestJSON} from '../src/smyk.js';

export async function collect(endpoint,key,fetcher=fetch) {
  const headers={Authorization:'Bearer '+key};
  const config=await requestJSON(endpoint+'/agent/config',{headers},fetcher);
  const products=[];let location;
  for(const product of config.products){
    try{location ||= await resolveLocation(product.postal,fetcher);const stores=await fetchStores(product,location,fetcher);products.push({sku:product.sku,ok:true,stores});}
    catch(error){products.push({sku:product.sku,ok:false,error:String(error.message||'Nieudany odczyt SMYK.').slice(0,400)});}
  }
  const report={revision:config.revision,checkedAt:new Date().toISOString(),products};
  const result=await requestJSON(endpoint+'/agent/report',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(report)},fetcher);
  console.log(JSON.stringify({ok:result.ok,products:result.products.map((p,index)=>({product:index+1,ok:p.ok,availableStores:p.availableStores,notifications:p.notifications,...(p.error?{error:p.error}:{})}))}));
  if(!result.ok)throw Error('Co najmniej jeden odczyt SMYK nie powiódł się.');
  return result;
}

if(process.env.MONITOR_ENDPOINT&&process.env.MONITOR_AGENT_KEY){
  collect(process.env.MONITOR_ENDPOINT.replace(/\/$/,''),process.env.MONITOR_AGENT_KEY).catch(error=>{console.error(String(error.message).split(process.env.MONITOR_AGENT_KEY).join('[redacted]'));process.exitCode=1;});
}
