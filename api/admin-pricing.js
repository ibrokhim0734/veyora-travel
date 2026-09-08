const U='https://neckklsrofckomgmbcjg.supabase.co';
const KEY='sb_publishable_HJRQj67rIV6vGlYT2fb8Qw_Yj7OtXSn';
module.exports=async(req,res)=>{
 try{
  const auth=req.headers.authorization||'';
  const r=await fetch(U+'/functions/v1/admin-pricing',{method:req.method,headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':auth},body:['GET','HEAD'].includes(req.method)?undefined:JSON.stringify(req.body||{})});
  const text=await r.text(); res.status(r.status).setHeader('Content-Type','application/json').send(text);
 }catch(e){res.status(500).json({error:e.message||'Pricing proxy failed'});}
};
