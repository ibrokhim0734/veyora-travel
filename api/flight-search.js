const {amadeus,demoFlights}=require('./_amadeus');
module.exports=async(req,res)=>{
 try{
  const q=req.method==='GET'?req.query:req.body||{};
  const origin=String(q.origin||'JFK').toUpperCase();
  const destination=String(q.destination||'FCO').toUpperCase();
  const departureDate=String(q.departureDate||'');
  const adults=Math.max(1,Number(q.adults||1));
  if(!departureDate)return res.status(400).json({error:'departureDate is required'});
  let results,mode='live';
  try{
   const d=await amadeus(`/v2/shopping/flight-offers?originLocationCode=${encodeURIComponent(origin)}&destinationLocationCode=${encodeURIComponent(destination)}&departureDate=${encodeURIComponent(departureDate)}&adults=${adults}&currencyCode=USD&max=5`);
   if(!d){mode='demo';results=demoFlights(origin,destination,departureDate,adults);} else {
    results=(d.data||[]).map(x=>({id:x.id,carrier:x.validatingAirlineCodes?.[0]||x.itineraries?.[0]?.segments?.[0]?.carrierCode||'Airline',origin,destination,departure:x.itineraries?.[0]?.segments?.[0]?.departure?.at,arrival:x.itineraries?.[0]?.segments?.slice(-1)?.[0]?.arrival?.at,stops:Math.max(0,(x.itineraries?.[0]?.segments?.length||1)-1),price:Number(x.price?.grandTotal||0),currency:x.price?.currency||'USD',mode:'live'}));
   }
  }catch(e){mode='demo';results=demoFlights(origin,destination,departureDate,adults);}
  res.status(200).json({mode,provider:mode==='live'?'Amadeus':'Demo inventory',results});
 }catch(e){res.status(500).json({error:e.message||'Flight search failed'});}
};
