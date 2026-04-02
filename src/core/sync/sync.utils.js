
export function sanitizeForOdoo(data) {
    const sanitized = {};
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'string') {
        sanitized[key] = value[0];
      } 
      else {
        sanitized[key] = value;
      }
    });
    
    return sanitized;
}
