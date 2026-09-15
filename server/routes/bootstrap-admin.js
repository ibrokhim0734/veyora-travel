{
  "$schema":"https://openapi.vercel.sh/vercel.json",
  "functions":{"api/router.js":{"maxDuration":30}},
  "rewrites":[{"source":"/api/:route","destination":"/api/router?route=:route"}],
  "headers":[{"source":"/(.*)","headers":[{"key":"X-Content-Type-Options","value":"nosniff"},{"key":"X-Frame-Options","value":"SAMEORIGIN"},{"key":"Referrer-Policy","value":"strict-origin-when-cross-origin"}]}]
}
