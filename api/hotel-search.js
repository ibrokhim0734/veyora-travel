const {amadeus,demoHotels}=require('./_amadeus');
module.exports=async(req,res)=>{
 try{
  const q=req.method==='GET'?req.query:req.body||{};
  const cityCode=String(q.cityCode||'ROM').toUpperCase();
  const checkIn=String(q.checkIn||''); const checkOut=String(q.checkOut||'');
  const adults=Math.max(1,Number(q.adults||1));
  if(!checkIn||!checkOut)return res.status(400).json({error:'checkIn and checkOut are required'});
  let results=[],mode='live';
  try{
   const list=await amadeus(`/v1/reference-data/locations/hotels/by-city?cityCode=${encodeURIComponent(cityCode)}&radius=20&radiusUnit=KM&hotelSource=ALL`);
   if(!list){mode='demo';results=demoHotels(cityCode,checkIn,checkOut,adults);} else {
    const ids=(list.data||[]).slice(0,12).map(x=>x.hotelId).filter(Boolean);
    if(!ids.length){mode='demo';results=demoHotels(cityCode,checkIn,checkOut,adults);} else {
      const offers=await amadeus(`/v3/shopping/hotel-offers?hotelIds=${encodeURIComponent(ids.join(','))}&adults=${adults}&checkInDate=${encodeURIComponent(checkIn)}&checkOutDate=${encodeURIComponent(checkOut)}&currency=USD&bestRateOnly=true`);
      results=(offers?.data||[]).slice(0,8).map(x=>({id:x.hotel?.hotelId||x.hotel?.name,name:x.hotel?.name||'Hotel',rating:x.hotel?.rating||'',room:x.offers?.[0]?.room?.description?.text||x.offers?.[0]?.room?.typeEstimated?.category||'Room',price:Number(x.offers?.[0]?.price?.total||0),currency:x.offers?.[0]?.price?.currency||'USD',mode:'live'}));
      if(!results.length){mode='demo';results=demoHotels(cityCode,checkIn,checkOut,adults);}
    }
   }
  }catch(e){mode='demo';results=demoHotels(cityCode,checkIn,checkOut,adults);}
  res.status(200).json({mode,provider:mode==='live'?'Amadeus':'Demo inventory',results});
 }catch(e){res.status(500).json({error:e.message||'Hotel search failed'});}
};
