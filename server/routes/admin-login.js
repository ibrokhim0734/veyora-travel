const path = require('path');
module.exports = async (req, res) => {
  const raw = (req.query && req.query.route) || '';
  const route = Array.isArray(raw) ? raw.join('/') : String(raw);
  const name = route.replace(/^\/+|\/+$/g, '');
  const allowed = new Set(['admin-bookings','admin-login','admin-pricing','admin-support','booking-notification','booking-status','bootstrap-admin','cart-preflight','cart-to-booking','contact-message','create-payment-session','experience-search','flight-search','hotel-search','location-search','multi-city-search','package-search','provider-status','request-cancellation','submit-booking','supplier-adapter-status','supplier-amadeus-flight','supplier-fulfillment','supplier-orchestrator','transfer-search','trip-cart']);
  if (!allowed.has(name)) return res.status(404).json({error:'API route not found'});
  try { const handler=require(path.join(process.cwd(),'server','routes',name+'.js')); return await handler(req,res); }
  catch(e){ console.error('API router error',name,e); return res.status(500).json({error:'Internal API error'}); }
};
