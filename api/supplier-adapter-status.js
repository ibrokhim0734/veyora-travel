module.exports=async(req,res)=>{
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const types=['flight','hotel','transfer','experience'];
  const adapters={};
  const validUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!['localhost','127.0.0.1','0.0.0.0'].includes(u.hostname)&&!u.hostname.endsWith('.local')}catch{return false}};
  for(const type of types){
    const prefix=`SUPPLIER_BOOK_${type.toUpperCase()}`;
    const url=process.env[`${prefix}_URL`]||'';
    const key=process.env[`${prefix}_KEY`]||'';
    const urlValid=Boolean(url&&validUrl(url));
    adapters[type]={configured:Boolean(urlValid&&key),hasUrl:Boolean(url),urlValid,hasKey:Boolean(key),host:url?(()=>{try{return new URL(url).host}catch{return 'invalid-url'}})():null};
  }
  const configured=Object.values(adapters).filter(x=>x.configured).length;
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({configured,total:types.length,ready:configured===types.length,adapters,timestamp:new Date().toISOString()});
};