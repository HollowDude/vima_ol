export function clientHasGeolocation(client) {
  return !!(client && client.partner_latitude && client.partner_longitude && client.partner_latitude !== 0);
}
