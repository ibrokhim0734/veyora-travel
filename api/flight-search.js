const {amadeus,demoFlights}=require('./_amadeus');
module.exports=async(req,res)=>{
 try{
  const q=req.method==='GET'?req.query:req.body||{};
  const origin=String(q.origin||'JFK').toUpperCase(),destination=String(q.destination||'FCO').toUpperCase();
  const departureDate=String(q.departureDate||''),returnDate=String(q.returnDate||'');
  const adults=Math.max(1,Number(q.adults||1)),children=Math.max(0,Number(q.children||0));
  const cabin=String(q.cabin||'ECONOMY').toUpperCase();
  if(!departureDate)return res.status(400).json({error:'departureDate is required'});
  if(returnDate&&returnDate<departureDate)return res.status(400).json({error:'returnDate must be after departureDate'});
  const params=new URLSearchParams({originLocationCode:origin,destinationLocationCode:destination,departureDate,adults:String(adults),currencyCode:'USD',max:'12',travelClass:cabin});
  if(returnDate)params.set('returnDate',returnDate);if(children)params.set('children',String(children));
  let results,mode='live';
  try{
   const d=await amadeus('/v2/shopping/flight-offers?'+params.toString());
   if(!d){mode='demo';results=demoFlights(origin,destination,departureDate,adults+children);}else results=(d.data||[]).map(x=>{const its=x.itineraries||[],out=its[0]?.segments||[],back=its[1]?.segments||[];return {id:x.id,carrier:x.validatingAirlineCodes?.[0]||out[0]?.carrierCode||'Airline',origin,destination,departure:out[0]?.departure?.at,arrival:out.slice(-1)[0]?.arrival?.at,returnDeparture:back[0]?.departure?.at||null,returnArrival:back.slice(-1)[0]?.arrival?.at||null,stops:Math.max(0,out.length-1),returnStops:back.length?Math.max(0,back.length-1):null,price:Number(x.price?.grandTotal||0),currency:x.price?.currency||'USD',cabin:out[0]?.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin||cabin,lastTicketingDate:x.lastTicketingDate||null,seats:x.numberOfBookableSeats||null,mode:'live',offer:x};});
  }catch(e){mode='demo';results=demoFlights(origin,destination,departureDate,adults+children).map(x=>({...x,returnDate:returnDate||null,cabin}));}
  res.status(200).json({mode,provider:mode==='live'?'Amadeus':'Demo inventory',tripType:returnDate?'round_trip':'one_way',search:{origin,destination,departureDate,returnDate: returnDate||null,adults,children,cabin},results});
 }catch(e){res.status(500).json({error:e.message||'Flight search failed'});}
};