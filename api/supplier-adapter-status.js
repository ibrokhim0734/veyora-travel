module.exports=async(req,res)=>{
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const types=['flight','hotel','transfer','experience'];
  const adapters={};
  for(const type of types){
    const prefix=`SUPPLIER_BOOK_${type.toUpperCase()}`;
    const url=process.env[`${prefix}_URL`]||'';
    const key=process.env[`${prefix}_KEY`]||'';
    adapters[type]={configured:Boolean(url&&key),hasUrl:Boolean(url),hasKey:Boolean(key),host:url?(()=>{try{return new URL(url).host}catch{return 'invalid-url'}})():null};
  }
  const configured=Object.values(adapters).filter(x=>x.configured).length;
  res.status(200).json({configured,total:types.length,ready:configured===types.length,adapters,timestamp:new Date().toISOString()});
};