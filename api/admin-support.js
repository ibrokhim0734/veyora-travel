const U='https://neckklsrofckomgmbcjg.supabase.co';
module.exports=async(req,res)=>{
 try{
  const auth=req.headers.authorization||'';
  const r=await fetch(U+'/functions/v1/admin-support',{method:req.method,headers:{'Content-Type':'application/json','Authorization':auth},body:req.method==='GET'?undefined:JSON.stringify(req.body||{})});
  const text=await r.text(); let data={}; try{data=text?JSON.parse(text):{}}catch{data={error:text||'Invalid response'}}
  return res.status(r.status).json(data);
 }catch(e){return res.status(500).json({error:'Support admin service unavailable'});}
};