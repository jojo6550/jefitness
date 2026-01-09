# HTTPS/SSL Configuration Guide

## Overview
This guide provides step-by-step instructions for setting up HTTPS/SSL in the JE Fitness application.

## Option 1: Development (Self-Signed Certificates)

### Generate Self-Signed Certificate
```bash
# Create a certs directory
mkdir -p certs

# Generate private key and certificate
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes

# When prompted, enter:
# Country: US
# State: Your State
# Locality: Your City
# Organization: JE Fitness
# Organizational Unit: Development
# Common Name: localhost
# Email: dev@jefitness.com
```

### Update Environment Variables
```bash
# .env
SSL_CERT_PATH=./certs/cert.pem
SSL_KEY_PATH=./certs/key.pem
NODE_ENV=development
```

## Option 2: Production (Let's Encrypt)

### Prerequisites
- Domain name pointing to your server
- Server accessible from the internet
- Port 80 and 443 open

### Install Certbot
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install certbot

# macOS (using Homebrew)
brew install certbot
```

### Generate Certificate
```bash
# Standalone mode (stops your server temporarily)
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Or using DNS validation (recommended for automated renewal)
sudo certbot certonly --dns-cloudflare -d yourdomain.com -d www.yourdomain.com
```

### Certificate Locations
```
/etc/letsencrypt/live/yourdomain.com/fullchain.pem  (certificate)
/etc/letsencrypt/live/yourdomain.com/privkey.pem    (private key)
```

### Update Environment Variables
```bash
# .env
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
```

### Auto-Renewal Setup
```bash
# Create renewal script
sudo nano /usr/local/bin/renew-ssl.sh

#!/bin/bash
certbot renew --quiet
# Optional: Restart Node.js service
systemctl restart jefitness

# Make executable
sudo chmod +x /usr/local/bin/renew-ssl.sh

# Add to crontab (runs daily at 2 AM)
sudo crontab -e

0 2 * * * /usr/local/bin/renew-ssl.sh >> /var/log/certbot.log 2>&1
```

## Option 3: Cloud Provider (Recommended for Production)

### AWS (Application Load Balancer)
1. Upload certificate to AWS Certificate Manager
2. Configure ALB with HTTPS listener
3. Set backend to HTTP
4. Update DNS to point to ALB

### Render/Heroku
- Automatic HTTPS with provided domain
- Option to add custom domain with automatic SSL

### DigitalOcean App Platform
1. Enable HTTPS in app configuration
2. Add custom domain
3. Automatic renewal included

## Server Code Implementation

### Using HTTPS in Express
```javascript
const https = require('https');
const fs = require('fs');

let server;

if (process.env.NODE_ENV === 'production' && process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH) {
  const options = {
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
    key: fs.readFileSync(process.env.SSL_KEY_PATH)
  };
  server = https.createServer(options, app);
} else {
  const http = require('http');
  server = http.createServer(app);
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT} ${process.env.NODE_ENV === 'production' ? 'with HTTPS' : 'with HTTP'}`);
});
```

## Verification & Testing

### Check Certificate
```bash
# View certificate details
openssl x509 -in certs/cert.pem -text -noout

# Check certificate validity
openssl x509 -in certs/cert.pem -noout -dates

# Verify certificate chain
openssl s_client -connect localhost:443 -cert certs/cert.pem
```

### Test with curl
```bash
# Development (ignore self-signed certificate warning)
curl -k https://localhost:10000

# Production (with valid certificate)
curl https://yourdomain.com
```

### Browser Testing
- Development: https://localhost:10000 (accept warning)
- Production: https://yourdomain.com (should show green padlock)

## Security Best Practices

### Certificate Management
1. **Key Security**: Never commit private keys to version control
2. **Permissions**: Restrict key file permissions
   ```bash
   sudo chmod 600 /etc/letsencrypt/live/yourdomain.com/privkey.pem
   ```
3. **Backup**: Maintain secure backups of private keys
4. **Rotation**: Plan for renewal before expiration

### HSTS (HTTP Strict Transport Security)
- Already configured in Helmet.js
- 1-year max age with subdomains
- Preload list submission (optional, advanced)

### Redirect HTTP to HTTPS
```javascript
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
    res.redirect(`https://${req.header('host')}${req.url}`);
  } else {
    next();
  }
});
```

### Mixed Content Prevention
- Already configured in CSP headers
- All resources should be HTTPS in production
- Verify: Browser console for mixed content warnings

## Troubleshooting

### Certificate Not Loading
```bash
# Check file paths
ls -la /path/to/cert.pem
ls -la /path/to/key.pem

# Check permissions
sudo chmod 644 /path/to/cert.pem
sudo chmod 600 /path/to/key.pem

# Verify certificate and key match
openssl x509 -noout -modulus -in cert.pem | openssl md5
openssl rsa -noout -modulus -in key.pem | openssl md5
# Both should output the same md5 hash
```

### Port 443 Already in Use
```bash
# Find process using port 443
sudo lsof -i :443

# Kill process
sudo kill -9 <PID>
```

### Certificate Expired
```bash
# Renew immediately
sudo certbot renew --force-renewal

# Or manually with Let's Encrypt
sudo certbot certonly --force-renewal-all
```

## Monitoring Certificate Expiration

### Set Up Reminders
```bash
# Email reminders (Certbot does this automatically)
# Or create your own check:

#!/bin/bash
CERT_FILE="/etc/letsencrypt/live/yourdomain.com/fullchain.pem"
EXPIRATION=$(openssl x509 -enddate -noout -in $CERT_FILE | cut -d= -f2)
DAYS_REMAINING=$(( ($(date -d "$EXPIRATION" +%s) - $(date +%s)) / 86400 ))

if [ $DAYS_REMAINING -lt 30 ]; then
  # Send alert
  mail -s "SSL Certificate Expiring in $DAYS_REMAINING days" admin@jefitness.com
fi
```

## References

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot Documentation](https://certbot.eff.org/docs/)
- [Node.js HTTPS Documentation](https://nodejs.org/api/https.html)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [OWASP Transport Layer Protection](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Protection_Cheat_Sheet.html)
